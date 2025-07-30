# 事件循环相关

## Web平台

宏任务（Macrotask）与微任务（Microtask）是理解 Web 平台异步行为的关键。实际上，[WHATWG 规范](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)中并没有“宏任务”这个术语，而是称之为 <mark>Task</mark>。为了便于理解，社区普遍采用“宏任务”来与“微任务”进行区分。

每次事件循环（Event Loop）只会执行一个宏任务。在该宏任务执行完毕后，会立即处理所有在当前任务执行期间产生的微任务，直到微任务队列（Microtask Queue）为空。只有在微任务队列清空后，浏览器才会进行必要的渲染更新（Update the rendering）。

一个清晰的例子是 `setTimeout` (宏任务) 和 `Promise.then` (微任务) 的执行顺序：

```js
console.log('script start');

setTimeout(() => {
  console.log('setTimeout');
}, 0);

Promise.resolve().then(() => {
  console.log('promise1');
}).then(() => {
  console.log('promise2');
});

console.log('script end');

// 输出顺序:
// script start
// script end
// promise1
// promise2
// setTimeout
```

`requestAnimationFrame` (rAF) 的执行时机比较特殊。它被设计用来在下一次浏览器重绘（repaint）之前执行，因此非常适合用于动画。尽管它被归类为宏任务，但其调度优先级非常高，由浏览器保证在渲染之前调用，从而避免丢帧和不必要的计算。

如果微任务队列持续不断地添加新的微任务，事件循环将无法进入下一个宏任务或渲染阶段，这会导致页面“卡死”。例如，以下代码会阻塞主线程，使页面无响应：

```js
const block = () => queueMicrotask(block);
block();
```

常见的宏任务API：timers、`requestAnimationFrame`、`requestIdleCallback`、`MessageChannel`等。

常见的微任务API：`process.nextTick()`、`Promise.then()`、`queueMicrotask`、`MutationObserver`等。

## NodeJS平台

:::info
[这个仓库](https://github.com/EverSeenTOTOTO/eventloop-in-lua)有笔者基于luv（Lua的libuv绑定）模拟`async/await`语法并模仿NodeJS事件循环的尝试，也许有所帮助。
:::

下面这段来自NodeJS[官方文档](https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick/)，不过这篇文章读起来挺费劲的，很多地方没说清楚，需要读者对libuv有一些了解：

       ┌───────────────────────┐
    ┌─>│        timers         │
    │  └──────────┬────────────┘
    │  ┌──────────┴────────────┐
    │  │   pending callbacks   │
    │  └──────────┬────────────┘
    │  ┌──────────┴────────────┐
    │  │     idle, prepare     │
    │  └──────────┬────────────┘      ┌───────────────┐
    │  ┌──────────┴────────────┐      │   incoming:   │
    │  │         poll          │<─────┤  connections, │
    │  └──────────┬────────────┘      │   data, etc.  │
    │  ┌──────────┴────────────┐      └───────────────┘
    │  ┌──────────┴────────────┐
    │  │        check          │
    │  └──────────┬────────────┘
    │  ┌──────────┴────────────┐
    └──┤    close callbacks    │
       └───────────────────────┘

这里对应的正是libuv一次事件循环的几个阶段，可以在libuv[源码](https://github.com/libuv/libuv/blob/8861a97efac54a9ab17e8174cc826a0ca1804e41/src/unix/core.c#L415C1-L480C2)中找到踪迹：

```c
int uv_run(uv_loop_t* loop, uv_run_mode mode) {
  int timeout;
  int r;
  int can_sleep;

  r = uv__loop_alive(loop);
  if (!r)
    uv__update_time(loop);

  /* Maintain backwards compatibility by processing timers before entering the
   * while loop for UV_RUN_DEFAULT. Otherwise timers only need to be executed
   * once, which should be done after polling in order to maintain proper
   * execution order of the conceptual event loop. */
  if (mode == UV_RUN_DEFAULT && r != 0 && loop->stop_flag == 0) {
    uv__update_time(loop); // [!code focus]
    uv__run_timers(loop); // [!code focus]
  }

  while (r != 0 && loop->stop_flag == 0) {
    can_sleep =
        uv__queue_empty(&loop->pending_queue) &&
        uv__queue_empty(&loop->idle_handles);

    uv__run_pending(loop); // [!code focus]
    uv__run_idle(loop); // [!code focus]
    uv__run_prepare(loop); // [!code focus]

    timeout = 0;
    if ((mode == UV_RUN_ONCE && can_sleep) || mode == UV_RUN_DEFAULT)
      timeout = uv__backend_timeout(loop);

    uv__metrics_inc_loop_count(loop);

    uv__io_poll(loop, timeout); // [!code focus]

    /* Process immediate callbacks (e.g. write_cb) a small fixed number of
     * times to avoid loop starvation.*/
    for (r = 0; r < 8 && !uv__queue_empty(&loop->pending_queue); r++)
      uv__run_pending(loop);

    /* Run one final update on the provider_idle_time in case uv__io_poll
     * returned because the timeout expired, but no events were received. This
     * call will be ignored if the provider_entry_time was either never set (if
     * the timeout == 0) or was already updated b/c an event was received.
     */
    uv__metrics_update_idle_time(loop);

    uv__run_check(loop); // [!code focus]
    uv__run_closing_handles(loop); // [!code focus]

    uv__update_time(loop); // [!code focus]
    uv__run_timers(loop); // [!code focus]

    r = uv__loop_alive(loop);
    if (mode == UV_RUN_ONCE || mode == UV_RUN_NOWAIT)
      break;
  }

  /* The if statement lets gcc compile it to a conditional store. Avoids
   * dirtying a cache line.
   */
  if (loop->stop_flag != 0)
    loop->stop_flag = 0;

  return r;
}
```

每轮循环有图中几个阶段（Phase，每个方框代表一个阶段），每个阶段都有一个FIFO队列存放待处理的回调。

*   timers: 已到期的`setTimeout`、`setInterval`回调在这里执行；
*   pending callbacks: 系统调用的结果回调，例如试图上报TCP错误`ECONNREFUSED`的行为；
*   idle, prepare: NodeJS内部使用；
*   poll: 取回新的I/O事件，处理除了`close`、timer和`setImmediate`回调之外几乎所有的I/O回调；
*   check: `setImmediate`回调在这里执行；
*   close callbacks: `close`事件有关的回调，例如`socket.on('close', callback)`。

其中最核心的阶段是poll，如果进入poll阶段时poll队列为空，或者poll队列执行到为空，都会在此处等待：

1.  若有`setImmediate`回调则进入check；
2.  若没有`setImmediate`回调则会在此处一直等待，随后可能发生的情况是：计时器到期，则有回调进入timers队列，于是“折返”到timers阶段进行新一轮循环。

通过一些例子加深理解：

1.  下面这段代码中，`setImmediate`始终在`setTimeout`前面执行：

    ```js
    fs.readFile('some file', () => {
      setTimeout(() => console.log('setTimeout'));
      setImmediate(() => console.log('setImmediate'));
    });
    ```

    `readFile`的回调在poll阶段执行，随后poll队列为空，但是回调执行过程中调用了`setImmediate`，check队列不为空，于是进入check阶段，下一轮再执行`setTimeout`的回调。

2.  如果去掉外侧的`readFile`则不一定了，下面代码`setTimeout`有可能在`setImmediate`前面执行：

    ```js
    setTimeout(() => console.log('setTimeout'));
    setImmediate(() => console.log('setImmediate'));
    ```

    `setTimeout`默认的等待间隔为1ms，主线程执行后，开始事件循环进入timers阶段时，如果还没到1ms，则timers队列为空，依次进入剩余阶段，先执行`setImmediate`回调，反之先执行`setTimeout`的回调。

3.  下面这个例子说明了`setTimeout`设定的等待间隔并不可靠，NodeJS只保证到时间后timer回调被”尽快“地执行：

    ```js
    const scheduledTime = performance.now();

    setTimeout(() => {
      console.log(`elapsed time: ${performance.now() - scheduledTime}ms`);
    }, 300);

    fs.readFile('a big file', () => {
      const start = performance.now();

      while (performance.now() - start < 1000);
      console.log('called');
    });
    ```

    这里让`readFile`读取一个大文件，耗时在200ms左右。因此poll阶段等待一段时间后`readFile`完成，其回调进入poll队列，回调也执行完成后才进入下一轮循环执行timers，最终先输出`called`，随后打印的耗时在1200ms左右；极小的情况下，可能由于磁盘缓存原因`readFile`比预期的慢，超过300ms，则poll等待过程中`setTimeout`先到期了，将“折返”（wrap back）到timers阶段执行timer回调，然后依次又一次进入poll阶段，这时打印的耗时是300ms多，随后才输出`called`。

### `process.nextTick()`

`process.nextTick()` 在概念上虽然是微任务，但它有自己独立的队列（`nextTickQueue`），并且优先级高于 `Promise` 的微任务队列。Node.js 会在当前操作（例如一个阶段的回调执行）完成后、进入事件循环的下一个阶段之前，清空 `nextTickQueue`。这意味着 `nextTick` 的回调会比 `Promise.then` 的回调更早执行。

```js
Promise.resolve().then(() => console.log('promise'));
process.nextTick(() => console.log('nextTick'));

// 输出顺序:
// nextTick
// promise
```

由于这种特殊的行为，官方现在更推荐使用 `queueMicrotask`，它能提供一个与 `Promise` 行为一致的标准微任务，从而使代码逻辑更清晰、更易于跨平台（Web 和 Node.js）复用。