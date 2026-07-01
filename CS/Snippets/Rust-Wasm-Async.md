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

如何利用这么简单的抽象来实现异步编程呢？个人认为，可以把`poll()`返回`Poll::Pending`看做一种让渡线程控制权的尝试，即某种形式的`yield`。而调度设施只是采取某些策略在合适的时机调用任务的`poll`方法，并根据其结果做不同的调度动作。

这么说可能还是有点“空中楼阁”，没关系，我们通过两个例子来进一步说明`Future`的用途。

> 下面案例中的代码主要由GLM-5.2编写。

### 简易单线程“异步”运行时

首先是一个单线程“异步”运行时的例子，这里的“异步”我加了双引号，因为我们要实现的其实是“并行”而非并发，即多个任务同时被调度，但由于是单线程，它们只能各自占据一定的时间片执行，并在**合适的时机**让渡控制权给其他任务，如此交替。这个过程是个黑盒，在外界看起来，它们好像是同时在进行的任务。

此处“_合适的时机_”本质说的就是调度算法。作为示例，我们用一个FIFO的队列来存放任务，每次取队头`poll`一下，如果还在`Pending`就把它丢到队尾，这样任务就会在队头交替执行。

```rust
/// - `Box`：把大小不定的 Future 装箱，让 `Task` 拥有固定大小；
/// - `Pin`：把 Future 「钉」在内存里不许移动，这是 Rust 允许 Future 内部持有自引用的安全前提。
type BoxFuture = Pin<Box<dyn Future<Output = ()>>>;

struct Task {
    future: BoxFuture,
}

struct Runtime {
    queue: VecDeque<Task>,
}

impl Runtime {
    fn new() -> Self {
        Self {
            queue: VecDeque::new(),
        }
    }

    /// 把一段 Future 注册成任务，丢到队尾。
    fn spawn(&mut self, future: impl Future<Output = ()> + 'static) {
        self.queue.push_back(Task {
            future: Box::pin(future),
        });
    }

    /// - [`Poll::Ready`]：任务完成，直接丢弃（已经被 `pop_front` 取出，不再放回）。
    /// - [`Poll::Pending`]：还没完成，丢回队尾，下一轮再来 poll 它。
    fn run(&mut self) {
        while let Some(mut task) = self.queue.pop_front() {
            // 构造一个 Waker 用来创建 Context。这里它是空操作（见下文）。
            let waker = noop_waker();
            let mut cx = Context::from_waker(&waker);

            match task.future.as_mut().poll(&mut cx) {
                Poll::Ready(()) => {
                    // 完成：不再放回队列，task 在此处被 drop。
                }
                Poll::Pending => {
                    // 没完成：放回队尾，等下一轮。
                    self.queue.push_back(task);
                }
            }
        }
    }
}
```

任务被设计为每次运行耗时200ms，需要运行5次才算完成：

```rust
struct WorkTask {
    name: &'static str,
    remaining: u32,
}

impl WorkTask {
    fn new(name: &'static str) -> Self {
        Self {
            name,
            remaining: RUNS,
        }
    }
}

impl Future for WorkTask {
    type Output = ();

    fn poll(mut self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<Self::Output> {
        // 模拟一段「CPU 工作」：它会霸占当前线程 CHUNK_MS 毫秒。
        // 注意这是阻塞调用——单线程运行时在这里什么都做不了，只能干等。
        thread::sleep(Duration::from_millis(CHUNK_MS));
        self.remaining -= 1;

        let done = RUNS - self.remaining; // 刚完成的是第几次（remaining 已经减过了）
        if self.remaining == 0 {
            println!("[{}] run {done}/{RUNS} done (task finished)", self.name);
            Poll::Ready(())
        } else {
            println!("[{}] run {done}/{RUNS} done, returning Pending", self.name);
            Poll::Pending
        }
    }
}
```

创建4个任务A、B、C、D看看效果：

```rust
fn main() {
    println!("=== Part 1: single-thread \"async\" runtime (actually serial) ===\n");

    let mut rt = Runtime::new();
    rt.spawn(WorkTask::new("A"));
    rt.spawn(WorkTask::new("B"));
    rt.spawn(WorkTask::new("C"));
    rt.spawn(WorkTask::new("D"));

    let start = Instant::now();
    rt.run();
    let elapsed = start.elapsed();

    println!("\nTotal elapsed: {:.2?}", elapsed);
    println!(
        "Expected: 4 tasks x {RUNS} runs x {CHUNK_MS}ms = {}ms.",
        4 * RUNS as u64 * CHUNK_MS
    );
}
```

```bash
=== Part 1: single-thread "async" runtime (actually serial) ===

[A] run 1/5 done, returning Pending
[B] run 1/5 done, returning Pending
[C] run 1/5 done, returning Pending
[D] run 1/5 done, returning Pending
[A] run 2/5 done, returning Pending
[B] run 2/5 done, returning Pending
[C] run 2/5 done, returning Pending
[D] run 2/5 done, returning Pending
[A] run 3/5 done, returning Pending
[B] run 3/5 done, returning Pending
[C] run 3/5 done, returning Pending
[D] run 3/5 done, returning Pending
[A] run 4/5 done, returning Pending
[B] run 4/5 done, returning Pending
[C] run 4/5 done, returning Pending
[D] run 4/5 done, returning Pending
[A] run 5/5 done ✅ (task finished)
[B] run 5/5 done ✅ (task finished)
[C] run 5/5 done ✅ (task finished)
[D] run 5/5 done ✅ (task finished)

Total elapsed: 4.00s
Expected: 4 tasks x 5 runs x 200ms = 4000ms.
```

### 简单例子的拓展：使用`Waker`驱动

#### `Waker`

你可能注意到例子中出现了一个`noop_waker`，这是 Rust 异步中另一个重要的抽象。上面的任务并没有用上`Context::from_waker(&waker)`所构造出来的`cx`，运行时自己会主动`poll`队列头部的任务，任务轮询之后自动追加到队尾，这可以看成一种“拉”模型。现实中，更多时候会采用“推”模型，任务在抛出`Pending`的同时保存下`cx.waker().clone()`，然后在合适的时机——比如timer到期、I/O完成时调用`waker.wake()`或者`waker.wake_by_ref()`唤醒并触发调度。

我们用 Waker 来改造上述例子加深理解。鉴于这是单线程 Demo，阻塞代码直接写到了`poll`中，改造后我们也直接在`poll`中调用`wake_by_ref`触发调度，大家只需要知道真实的案例此处应该保存`waker`，异步调用`wake_by_ref`就好了：

+ 任务的`poll`：

```rust
impl Future for WorkTask {
    type Output = ();

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        // 和简单版一样：霸占当前线程 200ms 的「CPU 工作」。
        thread::sleep(Duration::from_millis(CHUNK_MS));
        self.remaining -= 1;

        let done = RUNS - self.remaining; // 刚完成的是第几次（remaining 已经减过了）
        if self.remaining == 0 {
            println!("[{}] run {done}/{RUNS} done (finished)", self.name);
            Poll::Ready(())
        } else {
            // 通常应该是 xxx.waker = Some(cx.waker().clone()) 之类的暂存代码，然后在别处调用 wake()
            cx.waker().wake_by_ref();
            println!("[{}] run {done}/{RUNS} done, yielded via waker", self.name);
            Poll::Pending
        }
    }
}
```

+ Waker 的实现聚焦于其`wake`方法：

| 方法 | 作用 | 常用场景 |
|------|------|----------|
| `fn wake(self)` | 消费自身，将对应任务 **立即** 放入 executor 的就绪队列。 | 事件已准备好且不再需要再次唤醒。 |
| `fn wake_by_ref(&self)` | **不消费** `Waker`，保持可以再次使用。 | 同一任务可能被多次唤醒。 |
| `fn clone(&self) -> Self` | 创建一个新的 `Waker` 实例，内部引用计数+1。 | 当需要把 `Waker` 传给多个持有者时。 |

```rust
const VTABLE: RawWakerVTable = RawWakerVTable::new(clone_raw, wake_raw, wake_by_ref_raw, drop_raw);

unsafe fn clone_raw(ptr: *const ()) -> RawWaker {
    Rc::increment_strong_count(ptr as *const Task); // 复制 Waker：引用计数 +1
    RawWaker::new(ptr, &VTABLE)
}

unsafe fn drop_raw(ptr: *const ()) {
    Rc::decrement_strong_count(ptr as *const Task); // 丢弃 Waker：引用计数 -1
}

unsafe fn wake_raw(ptr: *const ()) {
    // wake 消费 Waker：先调度，再 -1。
    wake_by_ref_raw(ptr);
    Rc::decrement_strong_count(ptr as *const Task);
}

unsafe fn wake_by_ref_raw(ptr: *const ()) {
    // 借用 Waker 的引用来调度，不消费它。
    let rc = Rc::from_raw(ptr as *const Task);
    schedule(&rc);
    mem::forget(rc); // 阻止 Rc::drop 减引用，保持 Waker 持有的引用不变
}

/// 唤醒 = 把任务重新塞回队尾。这就是「Waker 起作用」的地方。
fn schedule(rc: &Rc<Task>) {
    rc.runtime.queue.borrow_mut().push_back(rc.clone());
}
```

+ 运行时不再主动塞回队尾：

```rust
impl Runtime {
    /// 主循环。和简单版的 `run()` 对比着看：唯一区别是 `Pending` 时运行时**什么都不做**——
    /// 任务已经在自己的 poll 里通过 Waker 把自己塞回队尾了。
    fn run(&self) {
        loop {
            let task = self.queue.borrow_mut().pop_front();
            let task = match task {
                Some(t) => t,
                None => break, // 队列空 = 全部完成
            };
            let waker = task.waker();
            let mut cx = Context::from_waker(&waker);
            let _ = task.future.borrow_mut().as_mut().poll(&mut cx);
            // Ready：任务没把自己塞回，本轮结束就被 drop。
            // Pending：任务已经用 waker 把自己塞回队尾了，运行时无需插手。
        }
    }
}

impl Task {
    /// 构造绑定到本任务的 Waker。调它的 `wake()` / `wake_by_ref()` 会把任务重新塞回队尾。
    fn waker(self: &Rc<Self>) -> Waker {
        let ptr = Rc::into_raw(self.clone()) as *const ();
        // SAFETY：ptr 来自 Rc::into_raw。单线程下这把 Waker 不会被送到别的线程，
        // 所以用 `Rc`（而非 `Arc`）是安全的。多线程版要用 `Arc`
        unsafe { Waker::from_raw(RawWaker::new(ptr, &VTABLE)) }
    }
}
```

#### `async/await`语法糖

还有一个东西值得介绍，那就是`async/await`语法糖。从本质上来说，编译器会把每个 `async fn / async { … }` 转换成一个匿名结构体（状态机），该结构体实现 `Future`。因此即使是这个同步的例子，也可以用上该语法糖，看看下面这个毫无意义的`work_task`吧！运行时什么都不需要改动，`main()`中，也只需要把`rt.spawn(WorkTask::new("A"))`改成`rt.spawn(work_task("A"))`即可。

为了便于理解，我将`WorkTask`的`remaining`字段更名为`state`，`poll`实现也更像一个状态机：

```rust
async fn work_task(name: &'static str) {
    WorkTask::new(name).await;
}

struct WorkTask {
    name: &'static str,
    state: u32,
}

impl WorkTask {
    fn new(name: &'static str) -> Self {
        Self {
            name,
            state: 0,
        }
    }
}

impl Future for WorkTask {
    type Output = ();

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        // 因为结构体没有自引用，Pin 对我们是透明的
        let this = unsafe { self.get_unchecked_mut() };

        loop {
            match this.state {
                0..=4 => {
                    thread::sleep(Duration::from_millis(CHUNK_MS));
                    this.state += 1;

                    let i = this.state;
                    println!("[{}] run {i}/{RUNS} done, yielded via waker", this.name);

                    // 把当前任务放回 executor，使其下次再次轮询
                    cx.waker().wake_by_ref();
                    return Poll::Pending;
                }
                5.. => {
                    return Poll::Ready(());
                }
            }
        }
    }
}
```

> 对有前端基础的同学来说，编译器实际上充当了`@bable/plugin-transform-async-to-generator`和`regenerator`的角色，不信你看看[这个例子](https://facebook.github.io/regenerator/)，是不是非常相似。

### 使用“工作窃取”的多线程异步运行时

理解了上述这些概念之后，作为练习，让我们实现一个 Demo 级别的“工作窃取”任务队列，来体验真正的异步。实现起来其实非常简单，`WorkTask`无需改动，只需要改变运行时的同异步原语，以及`run`的时候真的会启动线程并`join`了：

```rust
/// 一个任务。和单线程版的 `Task` 结构同构，只是把 `Rc`/`RefCell` 换成了 `Arc`/`Mutex`：
///
/// - `future` 用 `Mutex` 包：多线程下需要 `Sync` 的内部可变性（`RefCell` 不是 `Sync`）。
///   虽然任意时刻只有一个 worker 在 poll 它，但类型必须能安全地跨线程共享。
/// - `home`：任务的「归属」worker，唤醒时塞回 `home` 队列。本例所有任务 `home = 0`，
///   迫使 worker 1..N 必须「偷」才有活干
struct Task {
    future: Mutex<BoxFuture>,
    home: usize,
    runtime: Arc<Runtime>,
}

struct Runtime {
    queues: Vec<Mutex<VecDeque<Arc<Task>>>>,
    outstanding: AtomicUsize,
}

impl Runtime {
    fn new(workers: usize) -> Self {
        let queues = (0..workers)
            .map(|_| Mutex::new(VecDeque::new()))
            .collect();
        Self {
            queues,
            outstanding: AtomicUsize::new(0),
        }
    }

    /// 投放一个任务。全部塞进 worker 0 的队列，让别的 worker 只能靠「偷」拿到活。
    fn spawn(self: &Arc<Self>, future: impl Future<Output = ()> + Send + 'static) {
        let task = Arc::new(Task {
            future: Mutex::new(Box::pin(future)),
            home: 0,
            runtime: self.clone(),
        });
        self.outstanding.fetch_add(1, Ordering::SeqCst);
        self.queues[0].lock().unwrap().push_back(task);
    }

    /// 启动 `workers` 个 worker 线程，等它们全部结束。
    fn run(self: Arc<Self>, workers: usize) {
        let handles: Vec<_> = (0..workers)
            .map(|id| {
                let sched = self.clone();
                thread::spawn(move || sched.worker_loop(id))
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }
    }

    /// 单个 worker 的主循环。
    fn worker_loop(&self, id: usize) {
        loop {
            // 没有待办任务了 → 全部完成，退出。
            if self.outstanding.load(Ordering::SeqCst) == 0 {
                break;
            }
            if let Some(task) = self.find_task(id) {
                let waker = task.waker();
                let mut cx = Context::from_waker(&waker);
                let poll = task.future.lock().unwrap().as_mut().poll(&mut cx);
                if poll.is_ready() {
                    // Ready：不重新入队，未完成数 -1。此刻本 worker 持有的 Arc 通常是最后一份
                    //（任务没自唤醒），循环结束即被释放。
                    self.outstanding.fetch_sub(1, Ordering::SeqCst);
                }
                // Pending：任务已通过 waker 把自己塞回 `home` 队列，运行时不插手
            } else {
                // 此刻所有队列都空，但 `outstanding > 0`——说明别的 worker 正在 poll，
                // 一会它 self-wake 就会把任务塞回来。让出 CPU 片刻再试。
                thread::yield_now();
            }
        }
    }

    /// 找一个任务来跑：owner 从自己队列【队尾】LIFO 取（和 push_back 同一头）；
    /// 自己空了就从别的 worker 队列【队首】偷一个（另一头）。
    /// 这是标准 Chase-Lev work-stealing 约定：owner LIFO、偷取者 FIFO（拿最老的）。
    fn find_task(&self, id: usize) -> Option<Arc<Task>> {
        // 1) 自己队列，LIFO（pop_back，和 push_back 同一头）。
        if let Some(t) = self.queues[id].lock().unwrap().pop_back() {
            return Some(t);
        }
        // 2) 自己空了：遍历别的 worker，从队首（pop_front）偷一个（另一头，拿最老的）。
        let n = self.queues.len();
        for offset in 1..n {
            let victim = (id + offset) % n;
            if let Some(t) = self.queues[victim].lock().unwrap().pop_front() {
                return Some(t);
            }
        }
        None
    }
}

// ───────────────────────── Waker：RawWaker over Arc<Task> ─────────────────────────
// 和单线程版（Rc<Task>）一一对应，只是把 Rc 的引用计数换成 Arc 的——多线程下 Arc 是原子计数。

impl Task {
    /// 构造绑定到本任务的 Waker；`wake()`/`wake_by_ref()` 会把任务塞回它的 `home` 队列。
    fn waker(self: &Arc<Self>) -> Waker {
        let ptr = Arc::into_raw(self.clone()) as *const ();
        // SAFETY：ptr 来自 Arc::into_raw；Waker 在多线程间传递，用 Arc（原子引用计数）是安全的。
        unsafe { Waker::from_raw(RawWaker::new(ptr, &VTABLE)) }
    }
}

const VTABLE: RawWakerVTable = RawWakerVTable::new(clone_raw, wake_raw, wake_by_ref_raw, drop_raw);

unsafe fn clone_raw(ptr: *const ()) -> RawWaker {
    Arc::increment_strong_count(ptr as *const Task); // 复制 Waker：引用计数 +1
    RawWaker::new(ptr, &VTABLE)
}

unsafe fn drop_raw(ptr: *const ()) {
    Arc::decrement_strong_count(ptr as *const Task); // 丢弃 Waker：引用计数 -1
}

unsafe fn wake_raw(ptr: *const ()) {
    // wake 消费 Waker：先调度，再 -1。
    wake_by_ref_raw(ptr);
    Arc::decrement_strong_count(ptr as *const Task);
}

unsafe fn wake_by_ref_raw(ptr: *const ()) {
    // 借用 Waker 的引用来调度，不消费它。
    let arc = Arc::from_raw(ptr as *const Task);
    schedule(&arc);
    mem::forget(arc); // 阻止 Arc::drop 减引用，保持 Waker 持有的引用不变
}

/// 唤醒 = 把任务塞回它的 `home` worker 队列尾。WORKERS=1 时 home 必为 0、只有一条队列，
/// 这里和 async-await-runtime 的 `schedule`（塞回唯一队列）完全等价。
fn schedule(arc: &Arc<Task>) {
    arc.runtime.queues[arc.home]
        .lock()
        .unwrap()
        .push_back(arc.clone());
}
```

通过调整默认 workers 的数量分别为1、2、3、4，我们将看到总耗时分别为4s、2s、1.4s（20/3*200ms）和1s，符合预期。

## 利用 Web 事件循环实现异步运行时

理解了`Future`和`Waker`的用途，现在我们已经可以利用 Web事件循环在 Rust no_std 环境中实现异步运行时了。想法我们之前都说过了：<Notation type="underline">在`Future`的`poll`中保存下`cx.waker`，然后设法在JS异步方法的回调中`wake_by_ref`就行了</Notation>。为此我们需要在Rust环境（Guest）中放置一张表，用来记录所有的wakers，用一个`waker_id`索引。然后提供工具函数`wake_by_id`给JS环境（Host）使用，这个函数由 Guest 实现，负责根据`waker_id`查找并调用`waker.wake_by_ref()`。

对于要移植到到Rust中的JS原生异步函数，以基于`setTimeout`的`js::sleep`和基于原生`fetch`的`js::fetch`为例，我们做个封装，让封装后函数的入参多一个`waker_id`，它们的回调中使用该id并调用`wake_by_id`。

由于`fetch`带有返回值，我们还需要用`rsp.text()`或者`rsp.blob()`转为字节，并在 Guest 中分配内存存放。同时将用来保存`waker`的表从`Map<u32, Waker>`改为`Map<u32, (Waker, Result)>`，也即多了一个结果插槽（实际上`Result`是一个`Option<Vec<u8>>`用来存放结果字节的地址和偏移量）。

下为 Host 中`js_sleep`和`js_fetch`的实现。`deliver`就是个拓展版本的`wake_by_id`，内部整合了放置结果的逻辑：

```js
const { instance } = await WebAssembly.instantiate(bytes, {
  // ...
  host: {
    // Guest 分配 id 后调 js_sleep(id, ms)；我们排个 setTimeout，到点回调 wake_by_id(id)
    js_sleep: (id, ms) => setTimeout(() => instance.exports.wake_by_id(id), ms),

    // Guest 调 js_fetch(id, urlPtr, urlLen)：我们 fetch，拿到文本后调 alloc 借缓冲、
    // 把字节写进线性内存，再 deliver(id, ptr, len) 把结果送回 Guest 并唤醒它。
    js_fetch: (id, urlPtr, urlLen) => {
      const url = decoder.decode(new Uint8Array(memory.buffer, urlPtr, urlLen));
      fetch(url)
        .then((r) => r.text())
        .then((text) => {
          const enc = encoder.encode(text);
          const ptr = instance.exports.alloc(enc.length);
          new Uint8Array(memory.buffer, ptr, enc.length).set(enc);
          instance.exports.deliver(id, ptr, enc.length);
        })
        .catch((err) => {
          console.error("[host] fetch failed:", err?.message ?? err);
          instance.exports.deliver(id, 0, 0); // 唤醒但不带数据；Guest 拿到空 body
        });
    },
  },
});
```

Guest 中这些方法的定义如下：

```rust
// ════════════════════════ host 导入：JS 注入的能力 ═════════════════════════════════
mod host {
    #[link(wasm_import_module = "host")]
    extern "C" {
        /// 排一个 `setTimeout`：到点宿主会回调导出的 `wake_by_id(id)`。`id` 由 Rust 分配。
        pub fn js_sleep(id: u32, ms: u32);

        /// 发起一次 `fetch`：宿主拿到响应体后回调 `deliver(id, ptr, len)`。
        pub fn js_fetch(id: u32, url_ptr: *const u8, url_len: usize);
    }
}
```

Guest 中用来存放 Waker 和结果的设施，`alloc::collections`中有个现成的`BTreeMap`可以用，因此不必纠结怎么在`no_std`环境实现`Map`了。同时由于`wake_by_id`、`deliver`这些方法都是全局导出供 Host 使用的，注册表`REGISTRY`也需要是全局的：

```rust
struct Entry {
    waker: Waker,
    cell: Option<Rc<RefCell<Option<Vec<u8>>>>>, // ← fetch 才用；sleep 恒为 None
}
static mut REGISTRY: RefCell<BTreeMap<u32, Entry>> = RefCell::new(BTreeMap::new());
```

Task 、Runtime 和 Waker 的实现几乎看不出变化，只不过现在`Future`不是从`std`导入的，而是从`core`导入的，毕竟我们现在处在`no_std`环境。另外与上同理，我们需要实例化一个全局的`RUNTIME`供使用，而方法`rt()`仅仅为了包裹掉`unsafe`块，省得每次都要声明`unsafe`：

```rust
type BoxFuture = Pin<Box<dyn Future<Output = ()>>>;

struct Task {
    future: RefCell<BoxFuture>,
}

struct Runtime {
    queue: RefCell<VecDeque<Rc<Task>>>,
}

impl Runtime {
    const fn new() -> Self {
        Self {
            queue: RefCell::new(VecDeque::new()),
        }
    }

    /// 把一个 future 包成 `Task` 丢进就绪队列。
    fn spawn(&self, future: impl Future<Output = ()> + 'static) {
        let task = Rc::new(Task {
            future: RefCell::new(Box::pin(future)),
        });
        self.queue.borrow_mut().push_back(task);
    }

    /// 把就绪队列里的任务逐个 poll，直到空。`Ready` → 不重新入队（随引用归零 drop）；
    /// `Pending` → 挂起，等外部 `wake_by_id` 把它再塞回来。
    fn tick(&self) {
        loop {
            // 先「取出来」再 poll，绝不在持着队列 borrow 的时候 poll（否则 poll 里一旦
            // 再碰队列就会 RefCell 重入 panic）。和 waker-runtime 同一个规矩。
            let task = self.queue.borrow_mut().pop_front();
            let task = match task {
                Some(t) => t,
                None => break, // 队列空 = 当前没有可推进的任务，把控制权交还事件循环
            };
            let waker = waker_for(&task);
            let mut cx = Context::from_waker(&waker);
            let _ = task.future.borrow_mut().as_mut().poll(&mut cx);
        }
    }
}

/// 全局运行时单例。`const fn new` 让它能直接常量初始化（无需 lazy init / `Option`）。
static mut RUNTIME: Runtime = Runtime::new();

/// 取全局运行时引用。SAFETY 封在内部：单线程 wasm，对 `static mut` 取共享引用无并发风险。
fn rt() -> &'static Runtime {
    unsafe { &RUNTIME }
}

fn waker_for(task: &Rc<Task>) -> Waker {
    let ptr = Rc::into_raw(task.clone()) as *const ();
    unsafe { Waker::from_raw(RawWaker::new(ptr, &VTABLE)) }
}

const VTABLE: RawWakerVTable = RawWakerVTable::new(clone_raw, wake_raw, wake_by_ref_raw, drop_raw);

unsafe fn clone_raw(ptr: *const ()) -> RawWaker {
    Rc::increment_strong_count(ptr as *const Task);
    RawWaker::new(ptr, &VTABLE)
}
unsafe fn drop_raw(ptr: *const ()) {
    Rc::decrement_strong_count(ptr as *const Task);
}
unsafe fn wake_raw(ptr: *const ()) {
    wake_by_ref_raw(ptr);
    Rc::decrement_strong_count(ptr as *const Task);
}
unsafe fn wake_by_ref_raw(ptr: *const ()) {
    let rc = Rc::from_raw(ptr as *const Task);
    rt().queue.borrow_mut().push_back(rc.clone()); // 唤醒 = 重新塞回就绪队列
    mem::forget(rc); // 不减引用：保持 Waker 持有的那份不变
}

```

接着来看看核心技巧`wake_by_id`和`deliver`的实现，留意尾部的`rt().tick()`，还记得开头的疑惑吗：wasm 没有抢占，一个“导出调用”一旦开始，就同步跑到底（要么 return、要么 trap），JS 根本插不进去。所以不存在「挂起执行再重入」。那我们怎么实现`await`等待的效果呢，答案就是<Notation type="underline">把状态流转拆分为一次次独立的`rt().tick()`调用</Notation>。`tick`中，队列中所有任务都 poll 过就退出 wasm （该次导出调用 return 了），但任务状态仍然保存在 wasm 内存中，wasm 实例并没有销毁。然后，借助 Web 事件循环，在异步的 timer 完成、fetch I/O 完成时，通过`wake_by_id() -> rt().tick()`从上次暂存的状态开始重新进入 wasm，之前 Pending 的任务本次可能得到状态更新。

> GLM-5.2 的补充说明，说得很好：
两次调用之间：不是「wasm 暂停了」，而是压根没在执行——实例只是作为数据冻在线性内存里。那什么才是真「暂停」的？是 Rust 的 Future：它们是状态机，停在
.await 那个点上、存在线性内存里，等下次 tick 被 poll 时再「接着往下走」。
> 所以区分一下两层：
> - Future 被暂停了（作为数据，状态机停在中途）；
> - wasm 执行没被暂停——它是间歇性的，要么完整跑完一次 tick，要么根本不跑，没有中间态。
> 
> 程序的「连续感」完全靠那堆持久化的状态机维持，而不是靠一条挂起的执行栈。

```rust
#[no_mangle]
pub extern "C" fn wake_by_id(id: u32) {
    let entry = unsafe { REGISTRY.borrow_mut().remove(&id) }; // 摘掉 = 标记完成
    if let Some(e) = entry {
        e.waker.wake_by_ref(); // 重新入队对应任务
    }
    rt().tick();
}

/// 宿主把 fetch 结果字节写好后调这个：把字节塞进 id 对应 Future 的结果槽，再唤醒 + tick。
#[no_mangle]
pub extern "C" fn deliver(id: u32, ptr: *const u8, len: usize) {
    let entry = unsafe { REGISTRY.borrow_mut().remove(&id) };
    if let Some(e) = entry {
        let Entry { waker, cell } = e;
        if let Some(cell) = cell {
            let bytes = if len == 0 {
                Vec::new()
            } else {
                // SAFETY：[ptr, ptr+len) 是宿主刚写好字节、由上面 alloc 分配的线性内存块。
                let v = unsafe { core::slice::from_raw_parts(ptr, len) }.to_vec();
                // 归还 alloc 借的缓冲（capacity == len）
                unsafe {
                    let _ = Vec::from_raw_parts(ptr as *mut u8, len, len);
                }
                v
            };
            *cell.borrow_mut() = Some(bytes);
        }
        waker.wake_by_ref();
    }
    rt().tick();
}
```

现在只需要定制两个真实任务，分别对应`js_sleep`和`js_fetch`，地位上相当于前面例子的`WorkTask`，它们实现了`Future` trait：

```rust
struct Sleep {
    id: Option<u32>, // None = 还没启动；Some = 进行中（完成与否看 id 还在不在表里）
    ms: u32,
}

impl Future for Sleep {
    type Output = ();

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<()> {
        let id = match self.id {
            None => {
                // 首次 poll：分配 id，把任务 waker 挂上去，再让 JS 排个定时器。
                let id = alloc_id();
                unsafe {
                    REGISTRY.borrow_mut().insert(
                        id,
                        Entry {
                            waker: cx.waker().clone(),
                            cell: None,
                        },
                    );
                    host::js_sleep(id, self.ms); // 同步返回：定时器回调至少要等本栈退栈后才触发
                }
                self.id = Some(id);
                id
            }
            Some(id) => id,
        };
        // 我的 id 还在表里 ⇒ 没到点（Pending）；被 wake_by_id 摘走了 ⇒ 完成（Ready）
        if unsafe { REGISTRY.borrow().contains_key(&id) } {
            Poll::Pending
        } else {
            Poll::Ready(())
        }
    }
}

// ════════════════════════ Fetch：靠 JS fetch 驱动的 Future（oneshot）══════════════════
// 和 Sleep 的差别：要带数据回来。我们把每个异步 JS op 看成一个 oneshot channel——
// Future 自己持有结果槽 `Rc<RefCell<Option<Vec<u8>>>>`（这就是它的状态），首次 poll 时
// 把这个槽的句柄连同 waker 一起挂到 id 下；宿主 `deliver(id,ptr,len)` 直接戳这个槽
// （= 写进 Future 自己的状态），再唤醒。完成判定依旧在 Future 自己手里：槽里有值 ⇒ Ready。
struct Fetch {
    id: Option<u32>,
    cell: Rc<RefCell<Option<Vec<u8>>>>,
    url: &'static str,
}

impl Future for Fetch {
    type Output = Vec<u8>;

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Vec<u8>> {
        if self.id.is_none() {
            let id = alloc_id();
            unsafe {
                REGISTRY.borrow_mut().insert(
                    id,
                    Entry {
                        waker: cx.waker().clone(),
                        cell: Some(self.cell.clone()), // 把结果槽句柄交给 deliver 路径
                    },
                );
                host::js_fetch(id, self.url.as_ptr(), self.url.len());
            }
            self.id = Some(id);
        }
        match self.cell.borrow_mut().take() {
            Some(b) => Poll::Ready(b),
            None => Poll::Pending,
        }
    }
}
```

来看下实际效果：

```rust
const N_TASKS: u32 = 3;

async fn sleep_demo(i: u32) {
    println!("[task {i}] sleep(1s) start @ +{}ms", elapsed_ms());
    Sleep::new(1000).await;
    println!("[task {i}] done @ +{}ms", elapsed_ms());
}

async fn fetch_demo() {
    println!("[fetch] start @ +{}ms", elapsed_ms());
    let url = "https://www.example.com";
    let body = Fetch::new(url).await;
    let text = core::str::from_utf8(&body).unwrap_or("<non-utf8 body>");
    println!(
        "[fetch] done @ +{}ms, {} bytes: {:?}",
        elapsed_ms(),
        body.len(),
        text
    );
}

#[no_mangle]
pub extern "C" fn run() {
    unsafe {
        START_MS.set(now_ms());
    }
    rt().spawn(fetch_demo()); // 一个 fetch + 三个 sleep（~1s）并发跑在一条线程上
    for i in 0..N_TASKS {
        rt().spawn(sleep_demo(i));
    }
    // tick 首轮：任务各排一个 setTimeout/fetch 后挂起，结束 wasm 运行。
    // 之后每个回调会调 wake_by_id/deliver → rt().tick()，驱动任务走向完成。
    rt().tick();
}
```

```bash
[fetch] start @ +1ms
[task 0] sleep(1s) start @ +40ms
[task 1] sleep(1s) start @ +41ms
[task 2] sleep(1s) start @ +41ms
[task 0] done @ +1041ms
[task 1] done @ +1041ms
[task 2] done @ +1041ms
[fetch] done @ +4020ms, 559 bytes: "<!doctype html><html lang=\"en\"><head><title>Example Domain</title><link rel=\"icon\" href=\"data:,\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><style>body{background:#eee;width:60vw;margin:15vh auto;font-family:system-ui,sans-serif}h1{font-size:1.5em}div{opacity:0.8}a:link,a:visited{color:#348}</style></head><body><div><h1>Example Domain</h1><p>This domain is for use in documentation examples without needing permission. Avoid use in operations.</p><p><a href=\"https://iana.org/domains/example\">Learn more</a></p></div></body></html>\n"
```

## 对比`wasm-bindgen`的实现

毫不夸张的说，[wasm-bindgen的实现](https://github.com/wasm-bindgen/wasm-bindgen/tree/main/crates/js-sys/src/futures)原理和我们几乎一致，只是一些传值的机制不像我们这么“原始”，考虑也更加全面。以下是从其源码中摘录的、可以和我们的实现对照理解的内容。

1. wasm-bindgen 没有用全局的注册表，而是把 waker 也存放在了任务中，应该说它的设计更合理：

```rust
struct Inner {
    future: Pin<Box<dyn Future<Output = ()> + 'static>>,
    waker: Waker,
}

impl Inner {
    fn is_ready(&mut self) -> bool {
        let mut cx = Context::from_waker(&self.waker);
        self.future.as_mut().poll(&mut cx).is_ready()
    }
}

pub(crate) struct Task {
    //...

    // The actual Future that we're executing as part of this task.
    //
    // This is an Option so that the Future can be immediately dropped when it's
    // finished
    inner: RefCell<Option<Inner>>,

    // This is used to ensure that the Task will only be queued once
    is_queued: Cell<bool>,
}
```

2. 它没有显式地定义一个 Runtime，而是把这些方法都写在了 Task 上，比如`spawn`和`wake_by_ref`，其 `Task` 可以直接“into” `RawWaker`，并且我们注意到`task.run()`调用`inner.is_ready()`间接调用`future.poll()`，即一次`run()`就是一次`poll()`：

```rust
impl Task {
    pub(crate) fn spawn<F: Future<Output = ()> + 'static>(future: F) {
        let this = Rc::new(Self {
            #[cfg(debug_assertions)]
            console: try_create_task(core::any::type_name::<F>()),
            inner: RefCell::new(None),
            is_queued: Cell::new(true),
        });

        let waker = unsafe { Waker::from_raw(Task::into_raw_waker(Rc::clone(&this))) };

        *this.inner.borrow_mut() = Some(Inner {
            future: Box::pin(future),
            waker,
        });

        crate::futures::queue::Queue::with(|queue| queue.schedule_task(this));
    }

    fn force_wake(this: Rc<Self>) {
        crate::futures::queue::Queue::with(|queue| {
            queue.push_task(this);
        });
    }

    fn wake_by_ref(this: &Rc<Self>) {
        // If we've already been placed on the run queue then there's no need to
        // requeue ourselves since we're going to run at some point in the
        // future anyway.
        if this.is_queued.replace(true) {
            return;
        }

        Self::force_wake(Rc::clone(this));
    }

    // ...
    pub(crate) fn run(&self) {
        let mut borrow = self.inner.borrow_mut();

        // Wakeups can come in after a Future has finished and been destroyed,
        // so handle this gracefully by just ignoring the request to run.
        let inner = match borrow.as_mut() {
            Some(inner) => inner,
            None => return,
        };

        // Ensure that if poll calls `waker.wake()` we can get enqueued back on
        // the run queue.
        self.is_queued.set(false);

        #[cfg(not(debug_assertions))]
        let is_ready = inner.is_ready();

        // If a future has finished (`Ready`) then clean up resources associated
        // with the future ASAP. This ensures that we don't keep anything extra
        // alive in-memory by accident. Our own struct, `Rc<Task>` won't
        // actually go away until all wakers referencing us go away, which may
        // take quite some time, so ensure that the heaviest of resources are
        // released early.
        if is_ready {
            *borrow = None;
        }
    }
}
```

3. 它的“`WorkTask`”等价物，通过`inner.task`保存下`waker`：

```rust
impl<T> Future for JsFuture<T> {
    type Output = Result<T, JsValue>;

    fn poll(self: Pin<&mut Self>, cx: &mut Context) -> Poll<Self::Output> {
        let mut inner = self.inner.borrow_mut();

        // If our value has come in then we return it...
        if let Some(val) = inner.result.take() {
            return Poll::Ready(val);
        }

        // ... otherwise we arrange ourselves to get woken up once the value
        // does come in
        inner.task = Some(cx.waker().clone());
        Poll::Pending
    }
}
```

4. 它的“`wake_by_id`”和“`deliver`”，不同于我们在JS侧封装，wasm-bindgen 实现了直接将`Promise`转为`JsFuture`的逻辑，不过我们还是能看出在`.then/catch`中调用`finish`间接调用`task.wake()`这条链路，别忘了这个`task`虽名为`task`，其实是上面保存的`cx.waker().clone()`：

```rust
impl<T: FromWasmAbi + 'static> From<Promise<T>> for JsFuture<T> {
    fn from(js: Promise<T>) -> JsFuture<T> {
        let state = Rc::new(RefCell::new(Inner::<T> {
            result: None,
            task: None,
            callbacks: None,
        }));

        fn finish<T>(state: &RefCell<Inner<T>>, val: Result<T, JsValue>) {
            let task = {
                let mut state = state.borrow_mut();

                // First up drop our closures as they'll never be invoked again and
                // this is our chance to clean up their state.
                drop(state.callbacks.take());

                // Next, store the value into the internal state.
                state.result = Some(val);
                state.task.take()
            };

            // And then finally if any task was waiting on the value wake it up and
            // let them know it's there.
            if let Some(task) = task {
                task.wake()
            }
        }

        let resolve = {
            let state = AssertUnwindSafe(state.clone());
            Closure::once(move |val: T| {
                finish(&*state, Ok(val));
                Ok(())
            })
        };

        let reject = {
            let state = AssertUnwindSafe(state.clone());
            Closure::once(move |val| {
                finish(&*state, Err(val));
                Ok(())
            })
        };

        let _ = js.then_with_reject(&resolve, &reject);

        state.borrow_mut().callbacks = Some((resolve, reject));

        JsFuture { inner: state }
    }
}
```

5. 它的“`rc().tick`”，或许是差异最大的地方。你可能已经注意到上面的`finish`并没有像我们的`wake_by_id`那样在里面显式调用`rc().tick`，其实只是完整链路太长了：`finish() -> task.wake() -> Task::force_wake() -> queue.push_task() -> queue.schedule_task() -> push_back(task) + queueMicrotask(&self.closure)`，而这个`self.closure`就是`self.stat.run_all`也即我们例子中`rc().tick`等价物。

```rust
impl QueueState {
    fn run_all(&self) {
        // "consume" the schedule
        let _was_scheduled = self.is_scheduled.replace(false);

        // Stop when all tasks that have been scheduled before this tick have been run.
        // Tasks that are scheduled while running tasks will run on the next tick.
        let mut task_count_left = self.tasks.borrow().len();
        while task_count_left > 0 {
            task_count_left -= 1;
            let task = match self.tasks.borrow_mut().pop_front() {
                Some(task) => task,
                None => break,
            };
            task.run(); // inner.future.poll()
        }

        // All of the Tasks have been run, so it's now possible to schedule the
        // next tick again
    }
}

impl Queue {
    // Schedule a task to run on the next tick
    pub(crate) fn schedule_task(&self, task: Rc<crate::futures::task::Task>) {
        self.state.tasks.borrow_mut().push_back(task);
        // Use queueMicrotask to execute as soon as possible. If it does not exist
        // fall back to the promise resolution
        if !self.state.is_scheduled.replace(true) {
            if self.has_queue_microtask {
                queueMicrotask(&self.closure); // 这个closure 就是self.state.run_all，也即一次 tick
            } else {
                let _ = self.promise.then_map(&self.closure);
            }
        }
    }

    // Append a task to the currently running queue, or schedule it
    #[cfg(not(target_feature = "atomics"))]
    pub(crate) fn push_task(&self, task: Rc<crate::futures::task::Task>) {
        // It would make sense to run this task on the same tick.  For now, we
        // make the simplifying choice of always scheduling tasks for a future tick.
        self.schedule_task(task)
    }
}
```

它把 tick 放在`queueMicrotask`（没有时用`promise.then`）里这个行为耐人寻味，根因是为了防止栈溢出。如果没有这个`queueMicrotask`，在某个 JS 回调深处可能 poll → poll 里又调 JS → 又触发回调 → 又 poll，物理栈会越嵌越深。实际上在JS中利用异步来“unwind”调用栈是个常用技巧。

我们的同步 tick 没事，仅仅是因为当前 wake 全来自 JS 宏任务（`setTimeout`/`fetch`）异步回调，不会在 poll 中途同步发生；但我们可以设计一个极端的例子，一个“poll 内自唤醒”的方法，比如下面的`YieldNow`，这个问题就显现了。从这个意义上说，我们把“wake入队”和“next tick”拆开来其实也未必是坏事……

```rust
struct YieldNow {
    yielded: bool,
}

impl Future for YieldNow {
    type Output = ();
    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<()> {
        if self.yielded {
            Poll::Ready(())
        } else {
            self.yielded = true;
            cx.waker().wake_by_ref(); // ← 自唤醒：poll 里把自己塞回同步就绪队列
            rt().tick(); // ！！！递归直到栈溢出
            Poll::Pending
        }
    }
}
```

另外我们还可以注意到，wasm-bindgen 的实现记下了当时的`task_count_left`，确保一次 tick 只运行当时已在队列中的任务，如果运行过程中有新任务入队，将推迟到下一 tick，推测也是为了确保不会出现“poll 自唤醒”或者嵌套程度过深的单次 tick。

