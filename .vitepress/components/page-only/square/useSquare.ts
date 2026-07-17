import { Terminal } from '@xterm/xterm';
import type { CodeJar } from 'codejar';
import { ref, Ref } from 'vue';
// @ts-ignore
import init from '../../../square.wasm?init';

const utf8Decoder = new TextDecoder('utf-8');
const readUtf8String = (buffer: ArrayBuffer, offset: number, length: number) => {
  const array = new Uint8Array(buffer, offset, length);
  return utf8Decoder.decode(array);
};
const writeUtf8String = (buffer: ArrayBuffer, source: string, alloc: (len: number) => number) => {
  const encoder = new TextEncoder();
  const encodedString = encoder.encode(source);
  const sourceAddr = alloc(encodedString.length);

  new Uint8Array(buffer, sourceAddr, encodedString.length).set(encodedString);

  return {
    addr: sourceAddr,
    len: encodedString.length,
  };
};


export type Frame = {
  ra: string;
  locals: string[];
  stack: string[];
};

export type Snapshot = {
  pc: number;
  frames: Frame[];
};

export type Square = {
  compile(sourceAddr: number, size: number): number, // instsAddr
  snapshot_insts(instsAddr: number): bigint,         // packed (ptr<<32)|len

  init(): number; // vmAddr

  reset(vmAddr: number): void;
  snapshot(vmAddr: number): bigint,                  // packed (ptr<<32)|len

  step(vmAddr: number, instsAddr: number): void;
  run(vmAddr: number, instsAddr: number): void;

  // 异步运行时入口：宿主在 setTimeout/queueMicrotask 回调里调它，rewind 恢复被挂起的续延并续跑。
  wake_by_id(id: number): void;
};

type SquareWasmExports = {
  __data_end: WebAssembly.Global,
  __heap_base: WebAssembly.Global,
  memory: WebAssembly.Memory,

  alloc(size: number): number,
  dealloc(ptr: number, size: number): void,
} & Square;

export const useSquare = (editor: Ref<CodeJar>, terminal: Ref<Terminal>) => {
  const square = ref<SquareWasmExports>();
  const vmAddr = ref(-1);
  const instsAddr = ref(-1);

  type Write = (message: string) => void;
  const termWrite: Write = (message) => terminal.value?.write(message);

  // 调试数据走专用通道：客机 snapshot() 把 VM 状态序列化进线性内存，返 packed 句柄
  // (ptr<<32)|len。wasm i64 返回值在 JS 里是 BigInt，这里用 BigInt 移位切出 ptr/len（各自
  // 32 位，Number() 无损），解码成结构化对象后立即 dealloc——与程序 println 输出彻底分离，
  // 不再像旧 dump_* 那样临时劫持 memory.write。
  const readU32 = (buf: Uint8Array, off: number) =>
    (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;

  const unpack = (handle: bigint) => ({
    ptr: Number(handle >> BigInt(32)),
    len: Number(handle & BigInt(0xffffffff)),
  });

  const readSnapshot = (handle: bigint): Snapshot => {
    const { ptr, len } = unpack(handle);
    const buf = new Uint8Array(square.value!.memory.buffer, ptr, len);
    let o = 0;
    const readStr = () => {
      const l = readU32(buf, o); o += 4;
      const s = utf8Decoder.decode(buf.subarray(o, o + l)); o += l;
      return s;
    };

    const pc = readU32(buf, o); o += 4;
    const nFrames = readU32(buf, o); o += 4;
    const frames: Frame[] = [];
    for (let i = 0; i < nFrames; i++) {
      const ra = readStr();
      const nLocals = readU32(buf, o); o += 4;
      const locals: string[] = [];
      for (let j = 0; j < nLocals; j++) {
        const k = readStr();
        const v = readStr();
        locals.push(`${k}: ${v}`);
      }
      const nStack = readU32(buf, o); o += 4;
      const stack: string[] = [];
      for (let j = 0; j < nStack; j++) stack.push(readStr());
      frames.push({ ra, locals, stack });
    }

    square.value!.dealloc(ptr, len);
    return { pc, frames };
  };

  const snap = (): Snapshot => {
    const handle = square.value?.snapshot(vmAddr.value);
    return handle ? readSnapshot(handle) : { pc: 0, frames: [] };
  };

  const dumpInstructions = (): string[] => {
    const handle = square.value?.snapshot_insts(instsAddr.value);
    if (!handle) return [];
    const { ptr, len } = unpack(handle);
    const text = readUtf8String(square.value!.memory.buffer, ptr, len);
    square.value!.dealloc(ptr, len);
    return text.split('\n');
  };

  init({
    memory: {
      write: (offset: number, length: number) => {
        const message = readUtf8String(square.value!.memory.buffer, offset, length);

        termWrite(message);
      },
    },
    // 客机不再依赖 JSPI：sleep/defer 改为「id → wake_by_id」模型。
    // 客机挂起时调 js_sleep(id, ms) / js_queue_microtask(id)，我们在异步回调里调
    // 导出的 wake_by_id(id) rewind 恢复对应续延并续跑（详见 square/src/runtime.rs）。
    host: {
      js_sleep: (id: number, ms: number) => {
        setTimeout(() => {
          square.value?.wake_by_id(id);
        }, ms);
      },
      js_queue_microtask: (id: number) => {
        queueMicrotask(() => square.value?.wake_by_id(id));
      },
    }
  }).then((instance: WebAssembly.Instance) => {
    // 不再用 WebAssembly.promising 包 run/step——异步已下放到客机运行时（id → wake_by_id），
    // run 现在是普通同步导出：内部 spawn 主续延 + tick，任务 park 后即返回。
    square.value = {
      ...instance.exports,
    } as SquareWasmExports;

    vmAddr.value = square.value.init();
    callframes.value = snap().frames;
    console.log(`VM address: ${vmAddr.value}`);
  })
    .catch(console.error);

  const oldPc = ref(0);
  const pc = ref(0);
  const instructions = ref<string[]>([]);
  const callframes = ref<Frame[]>([]);

  return {
    oldPc,
    pc,
    instructions,
    callframes,

    compile() {
      this.reset();

      const { addr, len } = writeUtf8String(square.value!.memory.buffer, editor.value!.toString(), square.value!.alloc);

      instsAddr.value = square.value?.compile(addr, len) || -1;
      instructions.value = dumpInstructions();
      square.value?.dealloc(addr, len);
      terminal.value?.clear();
    },

    step() {
      square.value?.step(vmAddr.value, instsAddr.value);
      const snapshot = snap();
      oldPc.value = pc.value;
      pc.value = snapshot.pc;
      callframes.value = snapshot.frames;
    },

    run() {
      this.compile();
      square.value?.run(vmAddr.value, instsAddr.value);
      const snapshot = snap();
      oldPc.value = pc.value;
      pc.value = snapshot.pc;
      callframes.value = snapshot.frames;
    },

    reset() {
      square.value?.reset(vmAddr.value);
      oldPc.value = 0;
      pc.value = 0;
      instsAddr.value = -1;
      instructions.value = [];
      callframes.value = snap().frames;
      terminal.value.clear();
    }
  };
}

export const INITIAL_CODE = `[let fib /[n] 
  [if [<= n 2] 
    1
    [+ [fib [- n 1]] [fib [- n 2]]]]]
    
[sleep 1000]
[defer /[] [println 'later']]

[println [fib 20]]
`
