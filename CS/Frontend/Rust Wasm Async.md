# Rust 与 Wasm 中的异步

如果你使用过 [wasm-bindgen](https://rustwasm.github.io/docs/wasm-bindgen/introduction.html)，那你也许注意到，wasm-bindgen 如今可以与JS中的`Promise`协作。也就是说，像下面这段Rust代码，假如编译成 WebAssembly 并在Web或Node.js环境执行，它确实可以在`await?`处等待异步任务`fetch`完成，程序表现得像是阻塞了一样：

```rust
// JS: fetch
let promise = window()?.fetch_sth(&request); // 返回 Promise<Response>

// Rust: await
let resp_value = JsFuture::from(promise).await?;
let resp = web_sys::Response::from(resp_value);
```

但是，如果你了解相关背景的话，你会知道当下浏览器中 WebAssembly 的执行**无法被中断**（trap除外），更不用说过一会再从中断位置恢复执行了。同时，Rust编译为 WebAssembly 基本意味着要面对一个`no_std`环境，至少在浏览器中一般情况下没法直接使用操作系统层面的线程、进程等异步设施。所以`wasm-bindgen`是怎么实现这么神奇的功能的呢？我们猜测`wasm-bindgen`背后应该利用了Web环境的事件循环，自己实现了一个Rust异步运行时。带着这样的猜测，让我们来探究下相关的实现。

> 注意：“_当下 WebAssembly 的执行无法被中断_”这个说法并不准确，借助[JSPI](https://github.com/WebAssembly/js-promise-integration/tree/main)，我们能够在 WebAssembly 中中断执行并等待宿主环境的异步操作。但这依然是一个实验性的feature，浏览器尚需要打开一些配置才能支持，至少可以肯定`wasm-bindgen`底层没有使用它。

## Rust 中的异步运行时

首先，需要对Rust中的异步运行时做一定程度的的介绍。所谓**异步运行时**可以理解为一套能够驱动非阻塞I/O并调度大量任务的逻辑。Rust的标准库并不包含异步运行时，它只提供了一些更基础的设施（比如锁和线程）、`async/await`语法糖和抽象（比如`Future`、`Waker`等）。开发者需要使用这些基础设施，自己去实现各种异步调度执行工作。例如，你可以看看[tokio](https://github.com/tokio-rs/tokio)、[async-std](https://github.com/async-rs/async-std)或者[smol](https://github.com/smol-rs/smol)等库，这些都是社区实现的主流异步运行时，提供了在不同业务场景下的选择。

### `Future`

这里我们提到了`Future`，`Future`可以说是理解Rust异步编程的核心，也是串联应用层实现和语言底层设施的关键桥梁。从本质上说，`Future`只是一个定义了`poll`方法的`trait`（类比Typescript中的接口）：

```rust
pub trait Future {
    /// Future完成后产生的值的类型
    type Output;

    /// 尝试轮询Future以获取结果
    /// 
    /// 如果Future已完成，则返回Poll::Ready(result)
    /// 如果Future还未完成，则返回Poll::Pending
    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output>;
}
```

如何利用这么简单的抽象来实现异步编程呢？个人建议，可以把`poll`返回`Poll::Pending`看做一种让渡线程控制权的尝试，即某种形式的`yield`。而调度设施只是采取某些策略在合适的时机调用任务的`poll`方法，并根据其结果做不同的调度动作。

这么说可能还是有点“空中楼阁”，没关系，我们通过两个例子来进一步说明`Future`的用途。

> 下面案例中的代码主要由Kimi-K2和K2.5编写。

### 简易单线程“异步”运行时

首先是一个单线程“异步”运行时的例子，这里的“异步”我加了双引号，因为我们要实现的其实是“并行”而非并发，即多个任务同时被调度，但由于是单线程，它们只能各自占据一定的时间片执行，并在**合适的时机**让渡控制权给其他任务，如此交替。这个过程有点黑盒，在外界看起来，它们好像是同时在进行的任务。

此处“_合适的时机_”本质说的就是调度算法。作为示例，我们采用一个简单的“合作式调度”。我们将会创建两个任务，它们的`poll`方法每次被执行时会直接阻塞100ms，然后返回`Pending`，直到该任务总共阻塞了2000ms之后再返回`Ready`。

这时调度器的实现就非常简单了，用一个FIFO的队列来存放任务，每次取队头`poll`一下，如果还在`Pending`就把它丢到队尾，这样我们的两个任务就会依次出现在队头交替执行。

### 使用“工作窃取”的多线程异步运行时

#### `Waker`

#### `async/await`语法糖

## 利用 Web 事件循环实现异步运行时

### `Promise`的抽象

## 对比`wasm-bindgen`的实现
