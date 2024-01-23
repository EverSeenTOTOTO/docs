# Square <Badge type="warning" text="WIP" />

[Square](https://github.com/EverSeenTOTOTO/square)是最近上班摸鱼时开发的一个玩具语言， 主要目的有两个：一是以前实现过一个支持一类函数和一类延续的解释器，对自己的这门玩具语言有不少新想法，一直想写个编译器及相应的虚拟机实现，哪怕是最简单的自定义指令集堆栈机也很不错；二是采取 “learning by the hard way” 的模式，强迫在Rust `no_std`条件下编写并尽可能减少外部依赖，深入实践下Rust，同时构建为WASM，这样一可以复用自身各种前端技能，比如我打算等虚拟机大体完工之后再做的可视化交互环境；二来也在不依赖 emscripten、wasm_bindgen 等工具的情况下加载WASM并与宿主环境交互，变相又学到了不少WASM的知识。整个过程中有很多经验值得记录。

## 搭建Rust `no_std`环境

这个教程很多了，随便找一些Rust嵌入式教程，或者Github上从零开始用Rust编写操作系统的教程都会讲到，这部分的重点是自定义堆内存分配器`global_allocator`和异常处理器`panic_handler`，为了便于调试还可以实现下`println`宏，跟着教程一步步来就差不多行了。因为这部分和编译器早期开发关系并不大，我打算在编译器本体就绪之后再考虑内存分配效率和GC问题，所以当下简单找了个可以在`no_std`环境下运作的 crate `buddy_system_allocator`；`panic`时直接吐出WASM的`unreachable`指令；`println`则直接调用宿主环境提供的打印方法，例如在NodeJS环境中，可以包装下`process.stdout.write`。

1. 堆内存分配器：

```Rust
use buddy_system_allocator::LockedHeap;

#[global_allocator]
pub static ALLOCATOR: LockedHeap<32> = LockedHeap::<32>::new();
```

2. 异常处理：

```Rust
#[panic_handler]
fn panic(panic: &core::panic::PanicInfo<'_>) -> ! {
    println!("panic: {}", panic);
    core::arch::wasm32::unreachable()
}
```

3. `print!`和`println!`宏的实现，注意`&str`到内存指针`*const u8`和偏移量`usize`的FFI转换：

::: code-group
```Rust [WASM程序内部]
pub mod memory {
    use core::fmt;

    mod inner {
        #[link(wasm_import_module = "memory")]
        extern "C" {
            pub fn write(str: *const u8, len: usize);
        }
    }

    // write to memory and read by host
    pub fn write(message: &str) {
        unsafe { inner::write(message.as_ptr(), message.len()) };
    }

    pub struct Writer {}

    impl fmt::Write for Writer {
        fn write_str(&mut self, message: &str) -> fmt::Result {
            write(message);
            Ok(())
        }
    }
}

lazy_static! {
    static ref WRITER: Mutex<memory::Writer> = Mutex::new(memory::Writer {});
}

#[doc(hidden)]
pub fn extern_write(args: core::fmt::Arguments) {
    use core::fmt::Write;
    WRITER.lock().write_fmt(args).unwrap();
}

#[macro_export]
macro_rules! print {
    ($($arg:tt)*) => ($crate::externs::extern_write(format_args!($($arg)*)));
}

#[macro_export]
macro_rules! println {
    () => ($crate::print!("\n"));
    ($($arg:tt)*) => ($crate::print!("{}\n", format_args!($($arg)*)));
}

```

```js [宿主环境（NodeJS）]
const readUtf8String = (exports: WasmExports, offset: number, length: number) => {
  const array = new Uint8Array(exports.memory.buffer, offset, length);
  return utf8Decoder.decode(array);
};

const { instance } = await WebAssembly.instantiate(wasm, {
  memory: {
    write: (offset: number, length: number) => {
      const message = readUtf8String(instance.exports as WasmExports, offset, length);

      process.stdout.write(message);
    },
  },
}
```
:::

## 与宿主环境交互

首先有个特别想吐槽的点，我在翻阅网上的一些教程时，发现它们在提到WASM内存时都会说使用`WebAssembly.Memory`初始化一块线性内存，然后在WASM模块实例化时传入云云：

```js
const memory = new WebAssembly.Memory({ initial: 1, maximum: 16 });

WebAssembly.instantiate(wasmModule, { env: { memory } })
```

但实际上这创建的`memory`是一块“共享内存”，目前还只是个[proposal](https://github.com/WebAssembly/threads/blob/master/proposals/threads/Overview.md#shared-linear-memory)，似乎只有 [Wasmtime](https://docs.wasmtime.dev/api/wasmtime/struct.SharedMemory.html) 等几个运行时提供了相关实现。更重要的是，它和WASM模块运行起来之后自身所处的内存空间**没有任何关系**。因此，要想实现WASM模块内部与宿主环境的交互，还是得使用WASM模块自身导出的内存，通常离不开如下三个步骤：

1. 在WASM模块内部分配内存，拿到以程序虚拟地址空间表示的指针地址和布局大小，通过FFI传递给宿主环境；
2. 宿主环境在该地址上写入数据，调用WASM模块导出的其他方法通知数据就绪；
3. WASM模块方法中使用该数据。

下面是一个例子，在`test`中我们创建了一个`Foo`结构，打印其内存布局，并调用宿主环境提供的方法`update_foo`来更新`foo`，同时传递`foo`变量的地址和长度，随后再次打印`foo`的内存布局进行对比：

::: code-group
```Rust [WASM模块内部]
fn hexdump(ptr: *const u8, len: usize) {
    // hexdump 内调用宿主环境提供的print方法输出与xxd类似的内存布局，但是这并不重要……
}

struct Foo {
    bar: i32,
    baz: [u8; 8],
}

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    pub fn print(str: *const u8, len: usize);
    pub fn update_foo(addr: *const u8, len: usize);
}

#[no_mangle]
pub extern "C" fn test() {
    unsafe {
        let foo = Foo {
            bar: 0xabcd,
            baz: [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08],
        };
        let addr = &foo as *const _ as *const u8;
        let len = std::mem::size_of::<Foo>();

        hexdump(addr, len);

        // 在宿主环境中改变foo
        update_foo(addr, len);
        hexdump(addr, len);
    }
}
```

```js [宿主环境]
const utf8Decoder = new TextDecoder('utf-8');

async function main() {
  const buf = fs.readFileSync('rustdemo.wasm');
  const wasm = await WebAssembly.instantiate(buf, {
    env: {
      print(ptr, len) {
        const array = new Uint8Array(wasm.instance.exports.memory.buffer, ptr, len);
        const str = utf8Decoder.decode(array);
        process.stdout.write(str);
      },
      update_foo(addr, _len) {
        const view = new DataView(wasm.instance.exports.memory.buffer);

        view.setUint8(addr + 0, 0x9);
        view.setUint8(addr + 1, 0xa);
        view.setUint8(addr + 2, 0xb);
        view.setUint8(addr + 3, 0xc);
        view.setUint8(addr + 4, 0xd);
        view.setUint8(addr + 5, 0xe);
        view.setUint8(addr + 6, 0xf);
        view.setUint8(addr + 7, 0x0);
        view.setInt32(addr + 8, 0xffff, true);
      }
    },
  })

  wasm.instance.exports.test();
}

main();
```
:::

输出类似这样，注意我的机器是小端表示：

```
0xffff0 | 01 02 03 04 05 06 07 08
0xffff1 | cd ab 00 00
0xffff0 | 09 0a 0b 0c 0d 0e 0f 00
0xffff1 | ff ff 00 00
```

## 调整WASM程序初始化内存

目前Rust以`wasm32-unknown-unknown`作为target构建时，默认会导出内部的内存对象，如果我们将输出的wasm文件转换为wat的话，可以找到这样一条指令：

```lisp
 (memory (;0;) 17)
```

WASM程序一页是64KB，17页恰好是1MB多1页，有没有办法控制初始化时的内存大小呢？在[一些Issue](https://github.com/rustwasm/wasm-bindgen/issues/1345)上可以找到线索。这个17页是因为链接器默认会分配1MB的栈大小，要想控制这个数值，得传递一个参数给链接器：

```bash
RUSTFLAGS="-C link-arg=-zstack-size=65536" cargo build --target=wasm32-unknown-unknown
```

单位是Byte，65536B刚好是1页64KB，因此最终分配两页：

```lisp
(memory (;0;) 2)
```

## 闭包的实现

我们需要区分三个概念：函数定义、函数实例化和函数调用。

**函数定义**发生在编译时，指编译器在遇到一个函数时，将它编译为的那段静态指令；

**函数实例化**发生在运行时，对支持一类函数的语言来说，我们需要创建一个真正存在于内存、能够像常规值一样传来传去的结构（闭包），它至少有两个功能：定位到函数（指令）地址和捕获外部的局部变量；

**函数调用**也在运行时，实际调用的是函数实例（闭包），调用过程大体如下：

1. 创建新的调用帧，记录当前的`pc`为RA（Return Address）并保存在调用帧中；
2. 从闭包中取出函数地址并设置给`pc`，继续执行直到函数尾部的RET指令；
3. 从当前调用帧取出RA并重设`pc`；
4. PUSH当前调用帧数据栈栈顶到上一个栈帧数据栈的顶部作为返回值，然后销毁当前调用帧。

函数实例化和函数调用可以发生在不同的时机，这就存在一个问题，在函数调用时，闭包中捕获的局部变量可能已经离开了其作用域而被销毁，因此我们需要预先将被捕获的变量保存到堆上。有两种做法：

1. 在闭包创建时就移动待捕获变量到堆上；
2. 在变量离开作用域时检查是否被闭包所捕获，是则移动到堆上。

采取1实现上会简单点，但2的运行时性能更好。

现在，闭包捕获的实现要考虑两个阶段，一是捕获阶段；
二我姑且称为“填充”阶段，它应该发生在函数调用的步骤1和2之间，通常虚拟机查找变量时，会基于当前调用帧递归向前序调用帧查找局部变量，但现在遇到一个变量时，还需要考虑当前所执行闭包的捕获变量。其实仔细想想，捕获的变量、函数参数和函数体内部定义的局部变量没有本质差别，只是有先后顺序，参数应该覆盖同名捕获变量，局部变量应该覆盖同名参数。因此我们在创建新调用帧的时候，先将该闭包已捕获的变量填充到调用帧的局部变量中，而函数参数、函数体中的变量定义都会被翻译为变量定义指令STORE，并且函数参数定义指令在前，后续正常翻译函数体即可。

具体实现上还有个微妙的问题：整个过程哪些可以使用低级指令表达，哪些最好委托给虚拟机实现。对Lua这类偏向于解释器的语言虚拟机来说，它们定义了抽象层次较高的指令集，例如OP_CLOSURE、GETUPVALUE、SETUPVALUE，由虚拟机解读这些指令。

## 延续的实现

## 对象的实现
