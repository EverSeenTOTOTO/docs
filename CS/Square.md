<script setup>
import SquarePlayground from '@vp/SquarePlayground.vue'
</script>

# Square <Badge type="warning" text="WIP" />

[Square](https://github.com/EverSeenTOTOTO/square)是最近上班摸鱼时开发的一个玩具语言， 主要目的有两个：一是以前实现过一个支持一类函数和一类延续的解释器，对自己的这门玩具语言有不少新想法，一直想写个编译器及相应的虚拟机实现，哪怕是最简单的自定义指令集堆栈机也很不错；二是采取 “learning by the hard way” 的模式，强迫在Rust `no_std`条件下编写并尽可能减少外部依赖，深入实践下Rust，同时构建为WASM，这样既可以复用自身各种前端技能，比如我打算等虚拟机大体完工之后再做的可视化交互环境；也因为在不依赖 emscripten、wasm_bindgen 等工具的情况下加载WASM并与宿主环境交互，变相又学到了不少WASM的知识。整个过程中有些理解值得记录。

## Playground

这里的 Playground 基于一个轻量的编辑器[codejar](https://github.com/antonmedv/codejar)制作。

<SquarePlayground />

## 一些准备工作

### 搭建Rust `no_std`环境

这个教程很多了，随便找一些Rust嵌入式教程，或者Github上从零开始用Rust编写操作系统的教程都会讲到，这部分的重点是自定义堆内存分配器`global_allocator`和异常处理器`panic_handler`，为了便于调试还可以实现下`println`宏，跟着教程一步步来就差不多行了。因为这部分和编译器早期开发关系并不大，我打算在编译器本体就绪之后再考虑内存分配效率和GC问题，所以当下的实现都比较简单。

1. 堆内存分配器：

找了个现成的库`talc`：

```Rust
#[global_allocator]
pub static TALC: talc::TalckWasm = unsafe { talc::TalckWasm::new_global() };
```

2. 异常处理：

直接吐出WASM的`unreachable`指令：

```Rust
#[panic_handler]
fn panic(panic: &core::panic::PanicInfo<'_>) -> ! {
    println!("panic: {}", panic);
    core::arch::wasm32::unreachable()
}
```

3. `print!`和`println!`宏的实现，注意`&str`到内存指针`*const u8`和偏移量`usize`的FFI转换：

在NodeJS环境下，用的是`process.std.write`：

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

### 与宿主环境交互

首先有个特别想吐槽的点，我在翻阅网上的一些教程时，发现它们在提到WASM内存时都会说使用`WebAssembly.Memory`初始化一块线性内存，然后在WASM模块实例化时传入云云：

```js
const memory = new WebAssembly.Memory({ initial: 1, maximum: 16 });

WebAssembly.instantiate(wasmModule, { env: { memory } })
```

但这里创建的`memory`是一块“共享内存”，目前还只是个[proposal](https://github.com/WebAssembly/threads/blob/master/proposals/threads/Overview.md#shared-linear-memory)，似乎只有 [Wasmtime](https://docs.wasmtime.dev/api/wasmtime/struct.SharedMemory.html) 等几个运行时提供了相关实现。更重要的是，它和WASM模块运行起来之后自身所用的虚拟地址空间没有什么关系。因此，要想实现WASM模块内部与宿主环境的交互，还是得使用WASM模块自身导出的内存，通常离不开如下三个步骤：

1. 在WASM模块内部分配堆内存，拿到以程序虚拟地址空间表示的指针地址和布局大小，通过FFI机制传递给宿主环境；
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

### 调整WASM程序初始化内存

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

## 指令设计

整个开发过程中有个挺纠结的问题，就是虚拟机指令的抽象程度。我们可以仅使用`LOAD/STORE/PUSH/POP`等基础指令，但这意味着要设计好闭包、对象等复杂数据结构的内存布局，并将创建这些数据结构、填充成员字段等操作翻译为低层次指令；另一方面我们也可以“偷懒”，使用一些抽象层次较高的指令，类似Lua的`OP_CLOSURE`、`GET_UPVALUE`、`SET_UPVALUE`等，每个指令描述了一个复杂过程，其具体实现则委托给虚拟机。显然，前者的优势是非常底层，容易转译为机器码，指令执行过程也相对好实现，甚至用现实中的机械模拟，通常性能也比较高；但缺点是在指令生成阶段将操作各种基础数据结构的逻辑用基础指令表达，这并不简单，而且最终输出的指令也比较多。后者的优势是简化了指令生成过程，但相应的虚拟机在执行指令时要做更多工作，极端情况下，虚拟机退化为直接解读AST的解释器（理解为只有一条`EVAL`指令），这就失去了预编译为指令甚至机器码的性能优势，同时一条指令承担复杂功能，长度通常也会增加。

> CISC vs RISC

一般取舍之后，我还是复用了Rust的`Vec`和`HashMap`等基础设施，最终的指令集中有一些抽象层次较高的指令如`PUSH_CLOSURE`，`PACK`，`PEEK`等，它们的作用在下文说明。

## 作用域的处理

一个有用的观察是，整个代码块都可以组织为函数调用，所谓“全局变量”不过是程序最外层（虚拟机启动时默认创建）的一个隐含调用帧中的局部变量，而类似`{}`、`if {} else {}`等作用域块也可以解读为一个立即执行的函数，因此只要处理好闭包调用和变量定义、访问与捕获，虚拟机设计会大大简化。当然，这种设计也有缺点，对于“立即执行”的作用域函数，它原本可以不捕获变量而是直接向前序调用帧查找的，现在要额外创建一个调用帧并捕获一些变量，无疑大幅度增加了运行时开销，但这个问题是可以用CPS转换和尾调用优化解决的，我们后文详谈。这里给出虚拟机中调用帧的定义：

```rust
pub struct CallFrame {
    locals: HashMap<String, Value>, // 局部变量

    stack: Vec<Value>, // 操作数栈
    sp: usize, // stack pointer

    ra: usize, // return address
}
```

## 闭包的实现

这或许是虚拟机实现中最难的部分。我们需要区分三个概念：函数定义、函数实例化和函数调用。

**函数定义**发生在编译时，指编译器在遇到一个函数时，将它编译为的那段静态指令；

**函数实例化**发生在运行时，对支持一类函数的语言来说，我们需要创建一个真正存在于内存、能够像常规值一样传来传去的结构（闭包），它至少有两个功能：定位到函数（指令）地址和捕获外部的局部变量；

**函数调用**也在运行时，实际调用的是函数实例（闭包），此时调用帧操作数栈顶应该分别是闭包和打包过的参数，调用过程大体如下：

1. 创建新的调用帧，记录当前的`pc`为RA（Return Address）并保存在新调用帧中，将参数推送进新调用帧的操作数栈，旧调用帧操作数栈退栈*2；
2. 从闭包中取出函数地址并设置给`pc`，继续执行直到函数尾部的`RET`指令；
3. 从当前调用帧取出RA并重设`pc`；
4. PUSH当前调用帧数据栈栈顶到上一个栈帧数据栈的顶部作为返回值，然后销毁当前调用帧。

`CALL`指令实现类似这样：

```rust
let params = frame.stack[frame.sp - 1].clone();
let func = frame.stack[frame.sp - 2].clone();

frame.sp -= 2;

let mut frame = CallFrame::new();

frame.ra = *pc;
// always push params as first operand
frame.stack[0] = params;
frame.sp = 1;

vm.push_frame(frame);

// jump to function
*pc = closure.borrow().ip as usize;
```

`RET`指令实现：

```rust
let frame = vm.current_frame();

// jump back
*pc = frame.ra;

let top = frame.top().unwrap_or(&Value::Nil).clone();

vm.pop_frame();

// always return the top value
vm.current_frame().push(top)
```

### 变量捕获、定义与修改的细节

#### 编译阶段

编译阶段的任务是判断哪些变量是当前作用域的局部变量，哪些是待捕获的，并将这些待捕获变量的名字保存到`PUSH_CLOSURE`指令中作为元信息，虚拟机执行到`PUSH_CLOSURE`指令时，将使用这些元信息进行捕获。实现起来也不需要复杂的软件分析，因为从AST上我们可以得知哪些地方是定义变量的，哪些地方是使用变量的，哪些地方开始了一个新的作用域，故只要在指令生成的过程中维护一个作用域栈（注意与运行时的调用帧区分，两者没有什么关联，尽管运作原理相似），生成`STORE`指令的时候记下变量名，就可以在生成`LOAD`指令的时候得知是否需要捕获：

以`if`语句为例，维护作用域栈并记下元信息：

```rust
// 原本条件语句是不需要作用域的，但由于我们将整个`if`当做一次立即执行的函数调用，所以需要一层额外作用域
ctx.borrow_mut().push_scope();
let condition_result = emit_node(input, condition, ctx)?;

let true_branch = expressions.get(2).unwrap();

// 进入 true 分支作用域
ctx.borrow_mut().push_scope();
let true_branch_result = emit_node(input, true_branch, ctx)?;
//  离开 true 分支作用域，captures 中保存有该作用域需捕获的变量名
let mut captures = ctx.borrow_mut().pop_scope();

// ...

if let Some(false_branch) = expressions.get(3) {
    // 进入 false 分支作用域
    ctx.borrow_mut().push_scope();
    let false_branch_result = emit_node(input, false_branch, ctx)?;
    // 离开 false 分支作用域
    captures.extend(ctx.borrow_mut().pop_scope());
    // 离开 if 函数体
    captures.extend(ctx.borrow_mut().pop_scope());

    // ...

    // 生成 PUSH_CLOSURE 指令，并保存待捕获的元信息
    result.push(Inst::PUSH_CLOSURE(Function::ClosureMeta(
        -4 - (condition_len + true_branch_len + false_branch_len),
        captures,
    )));
}
```

生成`STORE`指令的地方，`is_define`根据语法结构区分定义`define`还是赋值`assign`：

```rust
if is_define {
    ctx.borrow_mut().add_local(id.clone());
} else {
    ctx.borrow_mut().mark_if_capture(id);
}

insts.push(Inst::STORE(id.clone()));
```

生成`LOAD`指令的地方，

```rust
ctx.borrow_mut().mark_if_capture(id);
return Ok(vec![Inst::LOAD(id.clone())]);
```

`mark_if_capture`有个注意点，当一个变量被标记待捕获时，从当前作用域一直上溯到该变量定义处之间的所有作用域都需要标记待捕获该变量：

```rust
pub fn mark_if_capture(&mut self, name: &String) {
    // once a value is captured, it will be captured in all upper scopes until where it is defined
    for (locals, ref mut captures) in self.scopes.iter_mut().rev() {
        if !locals.contains(name) {
            captures.insert(name.clone());
        } else {
            break;
        }
    }
}
```

#### 闭包创建阶段

闭包创建和闭包调用可能发生在不同的时机，这就存在一个问题，在调用时，闭包中捕获的局部变量可能因调用帧退栈而被销毁，就像下面这段代码，`foo()`执行完之后，为`foo`创建的调用帧就已经销毁了，但`x`由于捕获却要保持存活：

```js
let foo = () => {
    let x = 42;
    return () => x;
};

let bar = foo();

console.log(bar())
```

为此我们不仅仅要在创建闭包时捕获变量，还要在合适的时间将将被捕获的变量移动到堆上，有两种做法：

1. 在创建闭包并捕获变量的时候就将其移动到堆上；
2. 在调用帧被销毁时检查其局部变量是否被某闭包所捕获，是则移动到堆上。

采取1实现上会简单点，但2的运行时性能更好。Lua采用了2的做法，它将一个捕获变量区分为OPEN和CLOSED两种状态，如果变量被捕获但其所处调用帧还存活，捕获变量的地方看到的只是一个引用（OPEN），按引用捕获也满足了多个闭包捕获同一变量的场景。而当变量作用域因退栈而即将销毁的时候，Lua会将其中被捕获的变量移动到堆上（CLOSED），表现为一个upvalues链表。

然而在Rust中，由于所有权机制的存在，且从前面`CallFrame`定义可以看出我们局部变量`locals`的定义是`HashMap<String, Value>`，是持有值的所有权的，所以要同时在另一个地方创建其引用并不方便，为此我采用了1的做法：首先设计一个`UpValue`类型，通过`Rc<RefCell<T>>`来引用原变量，并在创建闭包的时候将要捕获的变量“升级”为`UpValue`：

```rust
#[derive(Debug, Clone)]
pub enum Value {
    Nil,
    Bool(bool),
    Num(f64),

    // ...

    UpValue(Rc<RefCell<Value>>), // [!code highlight]
}

impl Value {
    pub fn upgrade(&self) -> Value {
        match self {
            Value::UpValue(_) => self.clone(), // Rc::clone
            _ => Value::UpValue(Rc::new(RefCell::new(self.clone()))),
        }
    }
}
```

`PUSH_CLOSURE`就是用来创建闭包的指令，这是其中最核心的捕获变量逻辑：

```rust
// upgrade value to captured
for name in closure.captures.iter().cloned().collect::<Vec<_>>() {
    if let Some(value) = frame.resolve_local(&name) {
        let upvalue = value.upgrade();

        closure.capture(&name, &upvalue);
        frame.insert_local(&name, upvalue.clone());
    } else {
        // else undefined yet, if later be defined in same scope,
        // the value will be updated
        let upvalue = Value::UpValue(Rc::new(RefCell::new(Value::Nil)));

        closure.capture(&name, &upvalue);
        frame.insert_local(&name, upvalue.clone());
    }
}
```

`else`部分值得注意，这里并没有报错“变量未找到”是因为虚拟机实现了类似JS的“作用域提升”机制。下面这段代码，虽然`fn`创建的时候`x`还没有定义，但当该闭包调用的时候，**同一个作用域**里`x`已经有定义了，所以可以正确的输出`42`：

```js
let fn = () => x;
let x = 42;

console.log(fn());
```

此外还存在一个微妙的地方，如果稍加改造，下面这段代码会报错`x is not defined`。其实我们只需牢记一点：**变量捕获本质捕获的是一个作用域环境，只是将整个作用域保存下来太浪费了才选择精准的捕获变量**。`fn`闭包捕获的环境是`fn`所处的那个作用域，以及上游作用域，这些作用域中确实没有定义过`x`：

```js
let fn = () => x;
{
    let x = 42;
    console.log(fn());
}
```

要解释为什么我们的捕获机制不会踩到这个陷阱，还需要进一步弄清楚闭包调用阶段发生了什么。

#### 闭包调用阶段

我们在使用捕获变量的时候，行为与使用当前作用域的局部变量别无二致。如果仔细想一想就会发现，捕获变量、函数参数和局部变量在用法上并无差别，只是存在覆盖关系，函数参数可以理解为函数体开头定义的局部变量，它会覆盖捕获的变量，而函数体中定义的局部变量会进一步覆盖函数参数。所以调用时对捕获变量的处理其实非常简单，只需要在新调用帧投入使用前预先“填充”捕获变量作为局部变量就行了，别忘了，这些捕获变量都是`Rc<RefCell<T>>`，是引用类型，因此对它们的修改可以反馈到其他引用处，也包括实际定义它们的那个作用域。之后无论是局部变量还是捕获变量都简化为当前作用域的查找，免去向上游查找变量的过程，也体现了我们将整个程序运行过程统一为函数调用的好处。缺点自不必说，如果一个变量捕获处与定义处相差的层级比较深，中间每一个层级都持有它的一个引用，无疑会大幅度浪费内存空间，而且一遍遍创建捕获变量引用的过程也很耗时，但正如之前所说的，借助CPS转换和尾调用优化，我们可以始终将运行时的调用帧深度控制在个位数，这些缺陷就不再成为性能瓶颈了。

修改`CALL`指令的实现，只需添加一行代码，将闭包中捕获的变量预填充到新调用帧作为局部变量：

```rust
let params = frame.stack[frame.sp - 1].clone();
let func = frame.stack[frame.sp - 2].clone();

frame.sp -= 2;

let mut frame = CallFrame::new();

frame.ra = *pc;
// always push params as first operand
frame.stack[0] = params;
frame.sp = 1;

// fill up captures
frame.extend_locals(closure.borrow().upvalues.clone()); // [!code ++]

vm.push_frame(frame);

// jump to function
*pc = closure.borrow().ip as usize;
```

定义或赋值变量：

```rust
pub fn assign_local(&mut self, name: &str, value: Value) {
    let new = if let Value::UpValue(new) = value {
        new.borrow().clone()
    } else {
        value
    };

    if let Some(Value::UpValue(old)) = self.locals.get(name) {
        *old.borrow_mut() = new; // upvalue
    } else {
        self.insert_local(name, new); // local
    }
}
```

回过头看看前面的陷阱问题，由于这个“填充”过程，`fn()`调用之后为其创建的调用帧中始终用的是填充进来的当初捕获的`x`，而`{}`作用域中的`x`存在于`{}`自己的调用帧中，与它没有任何关系：

```js
let fn = () => x;
{
    let x = 42;
    console.log(fn());
}
```

高枕无忧了吗？还没有，虽然避免了上述陷阱，但当前实现也有自己的问题，考虑如下代码：

```js
let fn = () => {
  x;
  let x = 24;
  return x;
}

let x = 42;

fn();
```

`fn()`内部`x;`语句处，应该报错`x`未定义，但我们虚拟机实现在指令生成阶段会错误的判断`x`是一个捕获变量，因此执行到此处时`x`是有值的，指向外层的`let x = 42`，随后`let x = 24`便失去了其定义的作用而变成了一个赋值语句，错误的修改了外侧的`x`。实际上变量作用域提升还隐含着一个作用域覆盖的规则：如果一个变量在作用域中定义了，那么同一个作用域及下游作用域所有使用到该变量的地方由于提升始终应该“看到”该定义。体现在指令生成阶段，即使我们一开始标记了一个变量要被捕获，如果后来发现该变量晚些时候在同一个作用域被定义了，应去掉该标记，这个逻辑在前文所述遇到变量定义生成`STORE`指令并添加变量名到当前作用域的时候生效：


```rust
pub fn add_local(&mut self, name: String) {
    self.scopes.last_mut().unwrap().0.insert(name); // [!code --]
    let (ref mut locals, ref mut captures) = self.scopes.last_mut().unwrap(); // [!code ++]
    captures.remove(&name); // scope shadow // [!code ++]
    locals.insert(name); // [!code ++]
}
```

#### 尾调用优化和CPS转换

## 对象的实现

## 延续的实现

