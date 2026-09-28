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
  compile(sourceAddr: number, size: number): number; // instsAddr；编译失败为 0
  snapshot_insts(instsAddr: number): bigint,         // packed (ptr<<32)|len

  init(): number; // vmAddr

  reset(vmAddr: number): void;
  snapshot(vmAddr: number): bigint,                  // packed (ptr<<32)|len

  /** 返回 0 正常；1 出错（文本已写入 memory.write 通道） */
  step(vmAddr: number, instsAddr: number): number;
  run(vmAddr: number, instsAddr: number): number;

  /** 用户代码首指令 pc：prelude 拼接占了前面一截，单步前可先快进 */
  user_start(): number;

  /** 宿主 → 客机唯一唤醒入口：args 为实参数组 JSON，唤醒 id 对应的挂起任务 */
  call_cb(id: number, argsPtr: number, argsLen: number): void;
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
  /** prelude 之后、用户代码首指令的 pc；-1 = 尚未编译 */
  const userStart = ref(-1);

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
    if (instsAddr.value <= 0) return [];
    const handle = square.value?.snapshot_insts(instsAddr.value);
    if (!handle) return [];
    const { ptr, len } = unpack(handle);
    const text = readUtf8String(square.value!.memory.buffer, ptr, len);
    square.value!.dealloc(ptr, len);
    return text.split('\n');
  };

  // ── JS FFI 桥（与 square 仓库 host.mjs 同构）──────────────────────────────
  // 客机 [js 'path' a1 ...] / [await 'path' a1 ...] / [promisify 'path' ...] 经
  // host.js_call / host.js_await_call / host.js_await_cb 进来：按点路径在
  // globalThis 解析、展开实参调用；square 闭包以 {"__sq_cb": id} 句柄跨界，
  // 这里换成 JS 函数——调用即把实参 JSON 写回线性内存并 call_cb 唤醒对应任务。
  // 投递一律 microtask 化：同步回调会在 syscall 执行中途重入 VM，await 的
  // 同步结果也会赶在 park 完成前唤醒（tick 会把未 park 的任务当已完成丢弃）。
  const encoder = new TextEncoder();

  const squareCallback = (a: any) => {
    if (a && typeof a === 'object' && !Array.isArray(a) && '__sq_cb' in a) {
      const id = a.__sq_cb;
      return (...as: any[]) => queueMicrotask(() => sendToSquare(id, as));
    }
    return a;
  };

  const sendToSquare = (id: number, args: unknown[]) => {
    const bytes = encoder.encode(JSON.stringify(args ?? []));
    const ptr = square.value!.alloc(bytes.length);
    new Uint8Array(square.value!.memory.buffer, ptr, bytes.length).set(bytes);
    square.value!.call_cb(id, ptr, bytes.length);
  };

  const packResult = (result: unknown) => {
    let json: string;
    try {
      json = JSON.stringify(result);
    } catch {
      json = 'null';
    }
    const bytes = encoder.encode(json);
    const ptr = square.value!.alloc(bytes.length);
    new Uint8Array(square.value!.memory.buffer, ptr, bytes.length).set(bytes);
    return (BigInt(ptr) << 32n) | BigInt(bytes.length);
  };

  /** 解析点路径并保留父对象作接收者（Promise.reject 等需要 this） */
  const resolvePath = (name: string) => {
    let parent = globalThis;
    let resolved: any = globalThis;
    for (const k of name.split('.')) {
      parent = resolved;
      resolved = resolved?.[k];
    }
    return { parent, resolved };
  };

  const readCallArgs = (ptr: number, len: number) =>
    JSON.parse(
      readUtf8String(square.value!.memory.buffer, ptr, len),
    ).map(squareCallback);

  init({
    memory: {
      write: (offset: number, length: number) => {
        const message = readUtf8String(square.value!.memory.buffer, offset, length);

        termWrite(message);
      },
    },
    host: {
      // 同步 FFI：结果 JSON 写回线性内存返 packed 句柄；宿主异常以 {__sq_err} 回传
      // （客机转语言级错误，try 可捕获）
      js_call: (name_ptr: number, name_len: number, args_ptr: number, args_len: number) => {
        const name = readUtf8String(square.value!.memory.buffer, name_ptr, name_len);
        const args = readCallArgs(args_ptr, args_len);
        const { parent, resolved } = resolvePath(name);
        if (typeof resolved !== 'function') {
          return packResult(resolved === undefined ? null : resolved);
        }
        let result;
        try {
          result = resolved.apply(parent, args);
        } catch (e) {
          return packResult({ __sq_err: String(e) });
        }
        if (result === undefined) return 0n;
        return packResult(result);
      },
      // promisify 形态：实参中首个 {"__sq_cb": cb_id} 是唤醒句柄——宿主调用它即唤醒，
      // 回调实参即结果；返回值忽略（唯一唤醒源是回调）。宿主异常以错误对象投递。
      js_await_cb: (name_ptr: number, name_len: number, args_ptr: number, args_len: number, cb_id: number) => {
        const name = readUtf8String(square.value!.memory.buffer, name_ptr, name_len);
        const args = readCallArgs(args_ptr, args_len);
        const { parent, resolved } = resolvePath(name);
        if (typeof resolved !== 'function') {
          return; // 无法调用：任务悬挂，与 Promise 永不 resolve 一致
        }
        try {
          resolved.apply(parent, args);
        } catch (e) {
          queueMicrotask(() => sendToSquare(cb_id, [{ __sq_err: String(e) }]));
        }
      },
      // await 形态：Promise 则 .then/.catch，同步值/异常 microtask 化立即回调
      js_await_call: (name_ptr: number, name_len: number, args_ptr: number, args_len: number, cb_id: number) => {
        const name = readUtf8String(square.value!.memory.buffer, name_ptr, name_len);
        const args = readCallArgs(args_ptr, args_len);
        const { parent, resolved } = resolvePath(name);
        if (typeof resolved !== 'function') {
          const v = resolved;
          queueMicrotask(() => sendToSquare(cb_id, v === undefined ? [] : [v]));
          return;
        }
        let result;
        try {
          result = resolved.apply(parent, args);
        } catch (e) {
          const err = String(e);
          queueMicrotask(() => sendToSquare(cb_id, [{ __sq_err: err }]));
          return;
        }
        if (result && typeof result.then === 'function') {
          result.then(
            (v: unknown) => sendToSquare(cb_id, [v]),
            (e: unknown) => sendToSquare(cb_id, [{ __sq_err: String(e) }]),
          );
        } else {
          const v = result;
          queueMicrotask(() => sendToSquare(cb_id, v === undefined ? [] : [v]));
        }
      },
    }
  }).then((instance: WebAssembly.Instance) => {
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

  /** prelude 是编译期拼接的固定前缀（三百来条指令），单步交互前静默快进 */
  const fastForwardPrelude = () => {
    const target = square.value?.user_start() ?? -1;
    let last = -1;
    while (pc.value < target && pc.value !== last) {
      last = pc.value;
      stepOnce();
    }
  };

  const stepOnce = () => {
    const status = square.value?.step(vmAddr.value, instsAddr.value) ?? 0;
    const snapshot = snap();
    oldPc.value = pc.value;
    pc.value = snapshot.pc;
    callframes.value = snapshot.frames;
    return status;
  };

  return {
    oldPc,
    pc,
    instructions,
    callframes,

    compile() {
      this.reset();

      const { addr, len } = writeUtf8String(square.value!.memory.buffer, editor.value!.toString(), square.value!.alloc);

      instsAddr.value = square.value?.compile(addr, len) || -1;
      userStart.value = instsAddr.value > 0 ? (square.value?.user_start() ?? -1) : -1;
      instructions.value = dumpInstructions();
      square.value?.dealloc(addr, len);
      terminal.value?.clear();
    },

    step() {
      if (instsAddr.value <= 0) return;
      if (pc.value < userStart.value) {
        fastForwardPrelude();
        return;
      }
      stepOnce();
    },

    run() {
      this.compile();
      if (instsAddr.value <= 0) return;
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
      userStart.value = -1;
      instructions.value = [];
      callframes.value = snap().frames;
      terminal.value.clear();
    }
  };
}

export const INITIAL_CODE = `; sleep/defer 是异步原语上的普通函数，程序自带定义
[= sleep /[ms] [promisify 'setTimeout' /[] nil ms]]
[= defer /[f] [js 'queueMicrotask' f]]

[let fib /[n]
  [if [<= n 2]
    1
    [+ [fib [- n 1]] [fib [- n 2]]]]]

[println [fib 20]]

[sleep 500]
[defer /[] [println 'later']]

[println [try [js 'JSON.stringify' [vec 1 2]] /[e] e]]
`
