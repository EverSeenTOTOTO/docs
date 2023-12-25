# 事件循环相关

## Web平台

宏任务的概念实际上并不存在，只是为了和微任务对应而附会的一个概念。[浏览器标准](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)中相关的概念应该是Task，代表了诸如事件调度、timers回调、DOM、网络等任务。重点在8.1.7.3节Processing Model，每次完成一个任务会有一个微任务检查点，如果当前微任务队列不为空，则持续运行微任务直到队列为空，然后才会做一次Update the rendering。

在屏幕上有一个绝对定位的按钮，像下面这段代码，点击按钮能明显看到按钮闪烁了一下，如果将`setTimeout`改为`queueMicrotask`则不会，这或许能作为Task和Microtask执行时机的一个例子，变更DOM是一次Task，执行完之后有一个微任务检查点，因此使用`queueMicrotask`的话会先处理掉`btn.style.left = null`的回调再作渲染。而`setTimeout`创建的是Task，排在本轮渲染之后。用`MessageChannel`和`setImmediate`是同样的效果。比较特殊的是`requestAnimationFrame`，虽然是宏任务，但从标准中可以看出它运行在渲染阶段，处在Layout/Paint小阶段之前，所以如果用`requestAnimationFrame`也不会闪烁。

```js
const btn = document.querySelector('button')!;

btn.style.left = '100px';
setTimeout(() => { btn.style.left = null; });
```

进一步验证，在改变按钮位置后为`100px`后先调用`setTimeout`确保渲染到屏幕上，然后重置按钮位置，但重置后立刻做一个无限嵌套自身的微任务，这时可以观察到主线程直接卡住且按钮的重置并没有被渲染出来。

```js
const btn = document.querySelector('button')!;
const block = () => queueMicrotask(block);

btn.style.left = '100px';

setTimeout(() => {
  btn.style.left = null;
  block();
});
```

常见的宏任务API：timers、`requestAnimationFrame`、`requestIdleCallback`、`MessageChannel`等。

常见的微任务API：`process.nextTick()`、`Promise.then()`、`queueMicrotask`、`MutationObserver`等。

## NodeJS平台

下面这段来自NodeJS[官方文档](https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick/)，不过这篇文章挺毒的，很多地方没说清楚：

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

NodeJS自己也吐嘈了，它的`nextTick`有立即执行的作用，而`setImmediate`却有下一个“tick”才执行的作用，这都是历史遗留的因素。按照官方的文档，不管当前是事件循环的哪一个阶段，nextTickQueue会在当前“操作”完成后立即处理，这里“操作”是来自NodeJS底层的概念，我推测代表的就是“宏任务”或者浏览器标准中的Task，一个Task之后清空微任务队列。故nextTickQueue作为微任务队列总是在进入下一个Task前处理完，因此如果递归`nextTick`的话可能因为迟迟进入不了poll阶段造成I/O“饥饿”，和前文`block`的效果类似。

作为微任务，`process.nextTick()`优先级甚至比`Promise`还高，下面的代码会先输出`2`再输出`1`。

```js
Promise.resolve().then(() => console.log('1'));

process.nextTick(() => console.log('2'));
```

在有了`queueMicrotask`之后，`process.nextTick()`已经不推荐使用了，`queueMicrotask`创建的是和`Promise`同等优先级的微任务，便于梳理程序执行流。

特别一提，现在还能找到一些文章说NodeJS的事件循环和浏览器的事件循环不同，NodeJS会在每轮事件循环之间才检查微任务队列，而非在一个宏任务之后就有一个微任务检查点，这是NodeJS\@11版本之前的行为，[早改了](https://github.com/nodejs/node/pull/22842)。
