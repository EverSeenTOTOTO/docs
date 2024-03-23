import { ref, computed, onUnmounted } from 'vue';
// @ts-ignore
import init from '../square.wasm?init';

const utf8Decoder = new TextDecoder('utf-8');


type Square = {
  exec(sourceAddr: number, size: number): void,
};

type WasmExports = {
  __data_end: WebAssembly.Global,
  __heap_base: WebAssembly.Global,
  memory: WebAssembly.Memory,

  alloc(size: number): number,
  dealloc(ptr: number, size: number): void,
} & Square;

export const useSquare = () => {
  const instance = ref<null | WebAssembly.Instance>(null);
  const square = computed(() => instance.value?.exports as WasmExports);

  const allocated: { addr: number, len: number }[] = [];
  const free = () => {
    allocated.forEach(({ addr, len }) => {
      square.value?.dealloc(addr, len);
    });
    allocated.splice(0, allocated.length);
  }

  onUnmounted(free)

  const readUtf8String = (offset: number, length: number) => {
    const array = new Uint8Array(square.value!.memory.buffer, offset, length);
    return utf8Decoder.decode(array);
  };

  const writeUtf8String = (source: string) => {
    const encoder = new TextEncoder();
    const encodedString = encoder.encode(source);
    const sourceAddr = square.value!.alloc(encodedString.length);

    new Uint8Array(square.value!.memory.buffer, sourceAddr, encodedString.length).set(encodedString);

    const result = {
      addr: sourceAddr,
      len: encodedString.length,
    };

    allocated.push(result);

    return result;
  };

  init({
    memory: {
      write: (offset: number, length: number) => {
        const message = readUtf8String(offset, length);

        console.log(message);
      },
      get_data_end() {
        return square.value!.__data_end.value;
      },
      get_heap_base() {
        return square.value!.__heap_base.value;
      },
      get_memory_size() {
        return square.value!.memory.buffer.byteLength;
      },
    },
  }).then((inst: WebAssembly.Instance) => {
    instance.value = inst;
  })
    .catch(console.error);

  const instructions = ref<string[]>([]);
  const callframes = ref<string[]>([]);

  return {
    instance,
    instructions,
    callframes,

    compile(code: string) {
      const { addr, len } = writeUtf8String(code);

      square.value!.exec(addr, len);
    }
  };
}
