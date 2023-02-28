# NodeJS

## 模块机制

### 缓存

NodeJS的导入的模块默认都会被缓存，因此一个模块多次导入得到的是同一个模块对象。

```js
const d = require('./d'); 
const d2 = require('./d'); 

console.log(d == d2); // true
```

通过调整`require.cache`，可以控制缓存刷新，但简单地清除一个模块的缓存有很多注意点，例如在Windows上文件名是不区分大小写的，而NodeJS以文件名标识模块，仅清除`d.js`并不会导致`D.js`模块缓存被清理：

+ d.js

    ```js
    console.log(`${require.main.filename} loading ${__filename}`);
    ```

+ c.js

    ```js
    require('./d.js'); // c.js loading d.js
    require('./D.js'); // c.js loading D.js

    delete require.cache['d.js'];

    require('./D.js'); // no effect
    require('./d.js'); // c.js loading d.js
    ```

> 在v14+的NodeJS中，可以通过`node:`前缀跳过缓存直接访问到NodeJS原生模块。Mock原生模块的时候可能会用到。

再如，多进程架构中，往往清理一个进程的模块缓存还不够，要同步使其他进程的缓存失效，这个问题与清除多核CPU缓存面临的问题是一样的：

+ c.js

    ```js
    const cp = require('child_process');

    require('./d'); // c.js loading d.js

    cp.fork('a.js', { stdio: 'inherit' });

    require('./d'); // no effect
    ```

+ a.js

    ```js
    require('./d'); // a.js loading d.js

    delete require.cache['d.js']
    ```

### 钩子函数

在NodeJS生态经常看到各种各样的Registers可以控制NodeJS加载模块的行为，是通过修改`require.extensions`来指示NodeJS如何处理某类后缀的文件实现的，社区也有[pirates](https://github.com/danez/pirates)这样的工具库，修改的是`Module._extensions`，其实是等价的：

```js
const m = require('module');

console.log(require.extensions === m._extensions, require.extensions === m.Module._extensions); // true true
```

例如，要改动NodeJS加载`.js`文件时的默认动作，并支持加载`.txt`文件：

```js
const fs = require('fs');
const oldJSLoader = require.extensions['.js'];

require.extensions['.js'] = function(module, filename) {
  console.log(`loading ${filename}`);
  oldJSLoader(module, filename); // fallback
};
require.extensions['.txt'] = function(module, filename) {
  console.log(fs.readFileSync(filename, 'utf8'));
}

require('./d.js'); // 空文件
require('./e.txt'); // 文件内容为 hello world
```


```
loading d.js
hello world
```

不过NodeJS长期将这种机制标记为废弃，并明确指出会降低性能或造成微妙的BUG。在ESM模块中，NodeJS又提供了一套实验性的[Loader API](https://nodejs.org/docs/latest-v14.x/api/esm.html#esm_loaders)，我还没有用过。

## `spawn`、`fork`和`exec`

`spawn`用来创建一个子进程，而`fork`和`exec`可以当作在`spawn`上的二次封装，其中`exec`会创建一个新的shell并在其中执行命令，而`fork`会创建一个新的NodeJS进程并建立一条父子进程之间的IPC信道，创建的子进程是完全独立的，有自己的事件循环、内存空间和v8实例。故`exec`可理解为`spawn('sh')`而`fork`可理解为`spawn('node')`。

虽然名字是`exec`，但`exec`与POSIX系统调用`execve(2)`截然不同，`execve`会替换掉当前进程所执行的程序，包括整个程序的栈、堆和数据段：

```c 
char* args[] = {"", "hello world", NULL};

execve("/bin/echo", args, envp); // hello world
printf("will not print because current process is replaced");
```

而child_process的`exec`只不过是在子进程中运行shell。如果要执行的本身就是个可执行文件，还可以跳过shell这一层，直接使用`execFile`执行，获得少量的性能提升。

虽然名字是`fork`，但`fork`和POSIX系统调用`fork(2)`也截然不同，`fork(2)`会克隆当前进程的内存空间，因此才有关于`fork`的经典问题：

```c
int i;
for (i = 0; i < 2; ++i) {
  fork();
  printf("-");
}
wait(NULL);
```

`i=0`的时候主进程`fork`了一个子进程，子进程的状态也是`i=0`，随后执行`printf`打印两个`-`，接着`i=1`，两个进程各自又克隆了两个子进程，于是打印四个`-`，所以理论上应该输出6次`-`，但实际上执行这段程序通常只有很小的概率能得到6个`-`，更多时候是8个。这是因为标准输出的缓存区也会被克隆，故第一次克隆后缓存区有两个，各放入一个`-`，第二次克隆后缓存区是四个，又放入一个`-`共计8个`-`，只有极少数情况下刚好在第一次`printf`之后，第二次`fork`前发生了缓冲区flush才能得到6个`-`的输出，我们也可以主动在`printf`语句后面加入`fflush(stdout)`来冲刷缓冲区。

所以child_process中的`fork`只是个借名。真说起来，和`fork(2)`行为有点类似的反而是`cluster`，下面代码会输出6个`-`，但是它输出6个`-`的原因和`fork(2)`也不能一概而论，这里只有主进程会调用`fork`，共创建了两个，主进程自己打印了两次`-`，两个子进程各自重新执行此文件也打印了两次，共计6次：

```js
const cluster = require('cluster');

for (let i = 0; i < 2; ++i) {
  if (cluster.isMaster) {
    cluster.fork();
  }
  process.stdout.write("-");
}
```

## child_process、cluster和worker_threads

## stream

“流”这个名词出现太多次了，以至于如果问我到底什么是“流”我觉得我答不上来。我倾向于把“流”当作是一种“抽象”，当出于性能或其他考虑，不是对事物的整体进行处理，而是一次处理一点点的时候，流这个概念就应运而生了。它可以是利用有限缓冲区处理大文件的文件流、亦或是在迭代器与生成器抽象上实现的生产者、甚至是《SICP》中那种利用惰性求值实现的工厂函数。NodeJS中的流以第一类字节流居多，出于本身的高度抽象有好用的一面，但我特别想吐嘈的是stream模块糟糕的API设计，一会儿`read`一会儿`_read`一会儿`push`一会儿`unshift`的，让人眼花缭乱。

steam模块提供了三种流的抽象：可读流`Readable`、可写流`Writable`以及双工流`Duplex`，还有一种转换流`Transform`建立在`Duplex`的抽象之上。

`Writable`流比较值得一提的是`drain`事件，该事件在流遇到“背压”（backpressure，由于内部缓冲区达到预设容量`highWaterMark`）失去流动性，之后又变得可用时触发，因此常被用于避免在背压期间写入流可能导致的内存问题（在背压期间试图写入流的数据并不会丢失，而是会被缓存起来，造成大量的内存浪费及GC问题）：

```js
function write(data, cb) {
  if (!stream.write(data)) {  // 背压
    stream.once('drain', cb); // 恢复流动性之后调用cb
  } else {
    process.nextTick(cb);     // 一轮IO结束
  }
}

// Wait for cb to be called before doing any other write.
write('hello', () => {
  console.log('Write completed, do more writes now.');
});
```

`Readable`流提供了两个模式：`flow`和`paused`，其实就是观察者模式的推模型和拉模型，前者一旦数据就绪就会通过`data`事件提供出去（或者pipe到一个`Writable`），后者需要自己主动调用`read`从流中读取数据。两种模式可以视情况[相互转换](https://nodejs.org/docs/latest-v14.x/api/stream.html#stream_two_reading_modes)。`Readable`也有背压问题，在实现`Readable`时，若调用`push`方法返回`false`，就说明内部缓冲区已满，应该暂停给`Readable`提供数据。

`Duplex`实现了`Writable`和`Readable`的全部接口，其中读写端是相互独立的，包括内部的缓冲区也是独立的，因为读写速度未必一致。而`Transform`则在`Duplex`上再封装了一层，适合用于实现流的过滤和转换等。

## async_hooks

上面刚提到NodeJS异常处理的时候容易遗漏，对于处在异步作用域里面的异常，尽管可以用`unhandledRejection`和`uncaughtException`兜底，但捕获到的异常会丢失整个调用栈，这使得定位错误链路非常麻烦，比如下面这个例子：

```js
const ah = require('async_hooks');

process.on('unhandledRejection', reason => console.error(reason));

function foo() {
  console.log(`foo ${ah.executionAsyncId()}, caller ${ah.triggerAsyncId()}`);
  Promise.reject(new Error('foo'));
}

(function main() {
  console.log(`main ${ah.executionAsyncId()}, caller ${ah.triggerAsyncId()}`);
  setTimeout(foo);
})()
```

```
main 1, caller 0
foo 5, caller 1
Error: foo
    at Timeout.foo [as _onTimeout] (demo.js:7:18)
    at listOnTimeout (node:internal/timers:564:17)
    at process.processTimers (node:internal/timers:507:7)
```

由于`foo`在`setTimeout`创建的异步上下文中执行，尽管最终打印出了报错点`demo.js:7:18`，却丢失了相应的`main() -> foo()`调用栈，非常鸡肋。于是NodeJS提供了`async_hooks`可以追踪异步资源生命周期与异步上下文信息。所谓异步资源是NodeJS对那些运行时资源的抽象，通常都有一个相关联的回调，例如各种Timer、`net.createServer(cb)`、`fs.open(cb)`、`stream.write(cb)`等，这些方法会都创建和操作一些底层资源，操作完成后执行回调`cb`。这些回调执行时所处的环境与注册回调时所处的环境通常是不同的，这里的环境即所谓的“上下文”，像这样非阻塞地安排各种任务，由底层事件循环调度执行并在完成后回调的异步执行流在NodeJS中相当古老。像上面的例子，我们使用`executionAsyncId`获取当前执行上下文的id，用`triggerAsyncId`获取创建此上下文的上层环境的id，很容易推测出`0`是顶层执行上下文，`0`创建了上下文`1`并异步调用`main`，`main`同步调用`setTimeout`，`setTimeout`创建上下文`5`并异步调用`foo`，如此一来整条链路就清晰了。

### Continuation Local Storage

借助`async_hooks`，我们可以创建类似“线程局部存储”的东西，只不过把这里的“线程”换成了“执行上下文”。通常用追踪Express服务器链路耗时举例，当然也有很多异步场景存在类似需求：

```js
const ah = require('async_hooks');
const express = require('express');

const app = express();
const sym = Symbol();

ah.createHook({
  init(asyncId, type, triggerAsyncId, resource) {
    const cr = ah.executionAsyncResource();

    if (cr) {
      resource[sym] = cr[sym]; // 在同一链路的上下文之间用相同的键sym传递信息
    }
  },
}).enable();

let i = 0;
app.use((req, res, next) => {
  ah.executionAsyncResource()[sym] = { start: performance.now() }; // 记录链路开始时间

  setTimeout(next, ++i % 2 === 0 ? 0 : 300); // 模拟业务耗时
});

app.use((req, res, next) => {
  next();

  const state = ah.executionAsyncResource()[sym]; // 获取该链路开始时间

  console.log(`elapsed: ${performance.now() - state.start}ms`);

  res.end();
});

app.listen(8080);
```

随便找个压测工具访问5次，观察打印的链路用时：

```js
❯ node demo.js
elapsed: 303.07601998746395ms
elapsed: 1.1405540108680725ms
elapsed: 301.2219209969044ms
elapsed: 1.1689050048589706ms
elapsed: 301.8494890034199ms
```

使用`executionAsyncResource`的优点是不用我们自己去区分每个请求的链路，假设我们使用一个`Map`记录请求开始的时机，那么每个请求都得生成唯一的一个键，以便区分每个请求触发的链路。换句话说使用`Map`是在一个存储中存放不同的Id以区分请求，而使用`executionAsyncResource`则每个请求的中间件执行链路相互独立，我们为每条链路创建一个存储，这些存储中统一使用键`sym`记录请求开始时机，应该说是有点反直觉的。

