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


export type Square = {
  compile(sourceAddr: number, size: number): number, // instsAddr
  dump_instructions(instsAddr: number): void,

  init(): number; // vmAddr

  reset(vmAddr: number): void;
  dump_pc(vmAddr: number): number,
  dump_callframes(vmAddr: number): void,

  step(vmAddr: number, instsAddr: number): void;
  run(vmAddr: number, instsAddr: number): void;
};

type SquareWasmExports = {
  __data_end: WebAssembly.Global,
  __heap_base: WebAssembly.Global,
  memory: WebAssembly.Memory,

  alloc(size: number): number,
  dealloc(ptr: number, size: number): void,
} & Square;

//@ts-ignore
WebAssembly.Suspending = WebAssembly.Suspending || class { constructor(fn: unknown) { return fn } }
//@ts-ignore
WebAssembly.promising = WebAssembly.promising || function (fn: unknown) { return fn }

export const useSquare = (editor: Ref<CodeJar>, terminal: Ref<Terminal>) => {
  const disabled = ref(false);
  const square = ref<SquareWasmExports>();
  const vmAddr = ref(-1);
  const instsAddr = ref(-1);

  type Write = (message: string) => void;

  const termWrite: Write = (message) => terminal.value?.write(message);
  const stdout = ref<Write>(termWrite);
  const redirect = (write: Write) => { stdout.value = write; };

  init({
    memory: {
      write: (offset: number, length: number) => {
        const message = readUtf8String(square.value!.memory.buffer, offset, length);

        stdout.value?.(message);
      },
    },
    js: {
      //@ts-ignore
      sleep: new WebAssembly.Suspending((ms: number) => new Promise<void>(resolve => {
        disabled.value = true;
        setTimeout(() => {
          disabled.value = false;
          resolve();
        }, ms)
      }))
    }
  }).then((instance: WebAssembly.Instance) => {
    square.value = {
      ...instance.exports,
      //@ts-ignore
      run: WebAssembly.promising(instance.exports.run),
      //@ts-ignore
      step: WebAssembly.promising(instance.exports.step),
    } as SquareWasmExports;

    vmAddr.value = square.value.init();
    callframes.value = dump_callframes();
    console.log(`VM address: ${vmAddr.value}`);
  })
    .catch(console.error);

  const dump_instructions = () => {
    if (instsAddr.value < 0) return [];

    const instructions: string[] = [];
    const write = (message: string) => instructions.push(message);

    redirect(write);
    square.value?.dump_instructions(instsAddr.value);
    redirect(termWrite)

    return instructions.join('').split('\n').filter(Boolean);
  }

  const dump_callframes = () => {
    if (vmAddr.value < 0) return [];

    const callframes: string[] = [];
    const write = (message: string) => callframes.push(message);

    redirect(write);
    square.value?.dump_callframes(vmAddr.value);
    redirect(termWrite)

    return callframes.join('').split('\n').filter(Boolean);
  }

  const oldPc = ref(0);
  const pc = ref(0);
  const instructions = ref<string[]>([]);
  const callframes = ref<string[]>([]);

  return {
    oldPc,
    pc,
    instructions,
    callframes,

    compile() {
      this.reset();

      const { addr, len } = writeUtf8String(square.value!.memory.buffer, editor.value!.toString(), square.value!.alloc);

      instsAddr.value = square.value?.compile(addr, len) || -1;
      instructions.value = dump_instructions();
      square.value?.dealloc(addr, len);
      terminal.value?.clear();
    },

    step() {
      if (disabled.value) return;

      square.value?.step(vmAddr.value, instsAddr.value);
      oldPc.value = pc.value;
      pc.value = square.value?.dump_pc(vmAddr.value) || 0;
      callframes.value = dump_callframes();
    },

    run() {
      if (disabled.value) return;

      this.compile();
      square.value?.run(vmAddr.value, instsAddr.value);
      oldPc.value = pc.value;
      pc.value = square.value?.dump_pc(vmAddr.value) || 0;
      callframes.value = dump_callframes();
    },

    reset() {
      disabled.value = false;
      square.value?.reset(vmAddr.value);
      oldPc.value = 0;
      pc.value = 0;
      instsAddr.value = -1;
      instructions.value = [];
      callframes.value = dump_callframes();
      terminal.value.clear();
    }
  };
}

export const INITIAL_CODE = `[let fib /[n] 
  [if [<= n 2] 
    1
    [+ [fib [- n 1]] [fib [- n 2]]]]]

[sleep 1000]
[println [fib 20]]
`
