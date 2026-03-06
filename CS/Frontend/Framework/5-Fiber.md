# 解构前端框架之Fiber

<script setup>
import ImageView from '@vp/ImageView.vue'
import reactPerfPanel from './react-perf-panel.webp'
import minePerfV1 from './mine-perf-v1.webp'
import minePerfV2 from './mine-perf-v2.webp'
</script>

前几篇我们完成了VDOM求值、Diff Patch、组件化和状态管理，框架已初具雏形。但当组件树变得足够大时，性能问题便会浮现出来。

作为示例，设计这样一个递归组件，渲染1000层嵌套按钮：

```js
const {div, button, fragment, h, createRoot, useState, useEffect} = window.Demo;

const App = (state) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(state.count);
  }, [state.count]);

  return fragment([
    button(
      [`Depth: ${state.depth}, Count: ${count}`],
      {
        onClick: () => setCount(count + 1),
      },
    ),
    h(App, {
      depth: state.depth + 1,
      count
    })
  ].filter(() => state.depth < 1e3))
};

createRoot(document.body).render(h(App, {depth: 0, count: 0}));
```

下方演示视频中，如果我们在顶层按钮点击，可以看到`count`变化传播的过程明显卡顿，而如果我们在靠后比较浅的层级点击，`count`变化更新就很快了。进一步在顶层按钮连续点击，页面更是直接卡死，完全看不到更新的过程：

<video src="./recursive-block.mp4" controls />

打开性能面板：

<ImageView :src="minePerfV1" />

可以看到脚本执行几乎占满了主线程，期间所有用户交互被阻塞。这是当前实现下，Diff Patch和求值过程都是同步递归执行——一旦开始，必须完成，没法中断进行渲染动作。

作为对比，让我们用真实React跑同样的例子：

```jsx
const App = (state) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(state.count);
  }, [state.count]);

  return <>
    <button onClick={() => setCount(count + 1)}>Depth: {state.depth}, Count: {count}</button>
    {state.depth < 1e3 && (
      <App depth={state.depth + 1} count={count} />
    )}
  </>;
}

createRoot(document.body).render(<App depth={0} count={0} />);
```

同样先在顶层按钮点击看看效果，再看看较后比较浅的层级点击效果，以及顶层按钮快速连续点击的效果——整体交互非常流畅，`count`变化传导的过程清晰可见：

<video src="./react-fiber.mp4" controls />

<ImageView :src="reactPerfPanel" />

从性能图中可以看出来，React把一个大任务拆成多个小任务，每个任务执行完毕后释放主线程，让浏览器有机会处理用户交互。这就是React Fiber的核心目标——<Notation type="circle">异步调度</Notation>。

## 异步任务队列

异步调度听起来深奥，但本着学习和对比的想法，完全可以手写个极简版本：

1. 维护一个任务队列；
2. 每帧执行尽可能多的任务；
3. 每次执行完一个任务进行判断，若帧时间预算耗尽，则暂停调度下一帧继续。

```ts
export class TaskQueue {
  tasks: LinkedQueue<Task>;

  readonly frameLimit: number;

  private channel:MessageChannel;

  constructor(frameLimit = 1000 / 60) {
    this.tasks = new LinkedQueue<Task>();
    this.frameLimit = frameLimit;
    this.channel = new MessageChannel();

    this.channel.port1.onmessage = () => this.flushTask();
  }

  schedule(task: Task) {
    this.tasks.enqueue(task);

    // 首个任务自动开始
    if (task === this.tasks.head) {
      this.flushTask();
    }
  }

  protected flushTask() {
    const start = performance.now();

    while (true) {
      const pending = this.tasks.head;

      if (!pending) break;

      try {
        pending();
        this.tasks.dequeue();
      } catch (e) {
        console.error(e);
      }

      const elapsed = performance.now() - start;

      // 判断任务执行是否超帧预算，超预算则调度一个宏任务下一轮事件循环唤醒`flushTask`，并中断这一帧的执行
      if (elapsed >= this.frameLimit) {
        this.channel.port2.postMessage('');
        break;
      }
    }
  }
}
```

`frameLimit`取值`1000 / 60`，即约16.67ms，作为时间切片的参考阈值——当任务执行超过这个时间，我们主动让出主线程，让浏览器有机会处理其他任务。

::: details 为什么用`MessageChannel`而非`setTimeout`或`requestIdleCallback`？
- `setTimeout(fn, 0)`：浏览器有最小延迟限制（通常4ms），且不同浏览器表现不一致
- `requestIdleCallback`：在帧末尾空闲时执行，但执行时机不可控，可能被延迟很久
- `MessageChannel`：宏任务，下一个事件循环立即执行，时机可控且无最小延迟

React Scheduler正是基于`MessageChannel`实现的时间切片。
:::

## 实现细节：延续传递风格

有了任务队列，下一个问题是如何把同步递归的代码切分成可中断的小任务。

回顾当前的一个求值函数：

```ts
function evalSeq(nodes: VNode[]) {
  return flatten(nodes.map(evalVNode)) as Node[];
}

export function evalButton(node: VNodeButton) {
  const btn = document.createElement('button');

  if (node.attr?.style) {
    bindStyle(btn, node.attr.style);
  }

  if (node.attr?.onClick) {
    btn.addEventListener('click', node.attr.onClick);
  }

  btn.append(...evalSeq(node.children));

  node.output = [btn];

  return btn;
}
```

这是一个典型的递归下降求值器，`evalButton`里面调用`evalSeq`，中途没有暂停机会。要支持中断和恢复，需要改变控制流，你可能想到协程，不过实现起来对框架的侵入太大，这里可以用一个更简单的范式——<Notation type="underline">Continuation-Passing Style (CPS)</Notation>，延续传递风格。核心思想是把"之后做什么"显式作为参数传递，而非依赖调用栈自动返回。用大家更容易理解的方式，就是参数里多一个回调`callback`，`callback`代表未来要做的事情：

::: code-group

```ts [Before]
function evalSeq(nodes: VNode[]) {
  return flatten(nodes.map(evalVNode)) as Node[];
}

export function evalButton(node: VNodeButton) {
  const btn = document.createElement('button');

  if (node.attr?.style) {
    bindStyle(btn, node.attr.style);
  }

  if (node.attr?.onClick) {
    btn.addEventListener('click', node.attr.onClick);
  }

  btn.append(...evalSeq(node.children));

  node.output = [btn];

  return btn;
}
```

```ts [After]
function evalSeq(nodes: VNode[], callback: (output:Node[]) => void) {
  if (nodes.length === 0) {
    callback([]);
    return;
  }

  evalVNode(nodes[0], (firstOutput) => {
    evalSeq(nodes.slice(1), (restOutput) => {
      callback([...firstOutput, ...restOutput]);
    });
  });
}

export function evalButton(node: VNodeButton, callback:(output: Node[]) => void) {
  const btn = document.createElement('button');

  if (node.attr?.style) {
    bindStyle(btn, node.attr.style);
  }

  if (node.attr?.onClick) {
    btn.addEventListener('click', node.attr.onClick);
  }

  evalSeq(node.children, (output) => {
    btn.append(...output);
    node.output = [btn];
    callback(node.output);
  });
}
```

:::

改造后，所有函数不再返回值，而是通过`callback`参数传递结果。`evalSeq`不再一次性处理所有子节点，而是处理完一个后通过`callback`链式处理下一个。

CPS的作用是改变代码结构，把"之后做什么"显式化为callback参数，让我们有机会在执行流程中插入队列调度：

```ts
// 原来：下一步直接执行，无法插入调度
result = nextStep();

// CPS：下一步作为callback传入，可以控制何时执行
function currentStep(nextStep) {
  // ...
  queue.schedule(nextStep);
}
```

改造后`evalSeq`这个例子所要做的只是简单加一个`queue.schedule()`：

```ts
function evalSeq(nodes: VNode[], callback: (output:Node[]) => void) {
  if (nodes.length === 0) {
    callback([]);
    return;
  }

  evalVNode(nodes[0], (firstOutput) => {
    queue.schedule(() => evalSeq(nodes.slice(1), (restOutput) => {
      callback([...firstOutput, ...restOutput]);
    }));
  });
}
```

## 实现细节：竞态问题

改成异步后，在前面的例子中快速连续点击顶层按钮，会发现下层按钮的`count`显示混乱。原因在于多次点击产生多个更新任务排队；后入队的任务可能使用错误的状态值。

问题根源是我们之前实现Hooks时引入的全局变量：

```ts
let currentComponent: VNodeComponent;
let currentHookId = 0;

export const getCurrentComponent = () => currentComponent;
export const getCurrentHookId = () => currentHookId++;
```

一个典型的错误执行流程：

1. 开始渲染组件A，设置`currentComponent = A`，`currentHookId = 0`；
2. 执行到一半，时间耗尽，任务暂停；
3. 用户点击触发组件B的渲染，设置`currentComponent = B`，`currentHookId = 0`；
4. 任务恢复，继续执行组件A的剩余部分；
5. 此时`currentComponent`已是B，Hooks状态错乱。

另一个问题是状态覆盖。连续快速点击时，多个更新任务入队：

```ts
// 第一次点击：count=1
// 第二次点击：count=2
// 第三次点击：count=2或3（可能 Patch count=2 的任务也在排队，基于旧状态count=1再+1得到错误的2）
// 任务执行顺序和预期不一致
```

解决思路是用一个显式栈来模拟之前嵌套调用时的函数栈，不过这个栈只需要维护状态，我们把`currentHookId`和`currentComponent`都放在里面：

```ts
export class EvalContext {
  private static stack: EvalContext[] = [];

  component: VNodeComponent;

  constructor(component: VNodeComponent) {
    this.component = component;
  }

  static enter(component: VNodeComponent): EvalContext {
    const ctx = new EvalContext(component);
    EvalContext.stack.push(ctx);
    component._currentHookId = 0;
    return ctx;
  }

  static exit(): void {
    EvalContext.stack.pop();
  }

  static current(): EvalContext | undefined {
    return EvalContext.stack[EvalContext.stack.length - 1];
  }

  static run<T>(component: VNodeComponent, fn: () => T): T {
    EvalContext.enter(component);
    try {
      return fn();
    } finally {
      EvalContext.exit();
    }
  }

  static nextHookId(): number {
    const ctx = EvalContext.current();
    if (!ctx) {
      throw new Error('useState/useEffect must be called inside a component');
    }
    if (ctx.component._currentHookId === undefined) {
      ctx.component._currentHookId = 0;
    }
    return ctx.component._currentHookId++;
  }

  static getCurrentComponent(): VNodeComponent {
    const ctx = EvalContext.current();
    if (!ctx) {
      throw new Error('Hooks must be called inside a component');
    }
    return ctx.component;
  }
}
```

每次进入组件函数时压栈，退出时出栈。Hooks内部通过`EvalContext.current()`获取当前上下文，而非直接访问全局变量。即使任务被中断、切换，每个任务都能正确找到自己的上下文。

同时，`hookId`其实应该存储在组件实例上：

```ts
export interface VNodeComponent<T> extends VNodeBase<T, 'component'> {
  vdom?: VNode<T>,
  component: (state?: unknown) => VNode<T>,
  state?: unknown,
  _currentHookId?: number,
  // ...
}
```

## 最终效果

改造后再次运行性能测试：

<ImageView :src="minePerfV2" />

这个图和React那张性能图就有点“神似”了。长任务被拆分成多个短任务，每个任务执行时间在帧预算内。主线程有空闲响应用户交互。

## 结语

本章的代码可以在仓库的[fiber](https://github.com/EverSeenTOTOTO/mini-framework/tree/fiber)分支上找到。我们用CPS风格改造和一个基于`MessageChannel`的简单任务队列实现了可中断渲染，但依然存在很多局限。你可能注意到，我们的`TaskQueue`实现中，单个任务执行`pending()`过程依然是不可中断的，这要求我们非常有技巧性地把控任务拆分的粒度，体现在代码中就是要在合适的位置放置`queue.schedule()`，如果粒度控制不对，不仅任务数量爆炸，单个任务的递归深度（ 同步执行耗时）也不合理。比方说，当前实现中，每个子节点求值都会创建延续并调度：

```ts
function evalSeq(nodes: VNode[], callback) {
  evalVNode(nodes[0], (firstOutput) => {
    queue.schedule(() => evalSeq(nodes.slice(1), ...)); // 每个子节点一个任务
  });
}
```

1000层组件树可能产生数千个任务，每个任务涉及`MessageChannel`调度和闭包捕获，开销累积后不可忽视。更重要的是，任务边界不清晰，也难以做优先级调度。

如果你知道怎样借助栈结构把递归改造成遍历实现，你可能已经想到了下一步优化方向：划定更合理的工作单元（比如与组件对应的Fiber），用数据结构（Fiber树）替代嵌套的执行结构，借助更现代化的API（比如`navigator.scheduling?.isInputPending()`）优化用户体验等等。这些都是React作为生产级框架会去做的事情。

熟读前端八股的你，肯定已经知道Fiber是一种显式的工作单元，包含`child`、`sibling`、`return`指针的树形结构：

```ts
interface Fiber {
  type: any,              // 组件函数或DOM标签
  child: Fiber | null,    // 第一个子节点
  sibling: Fiber | null,  // 下一个兄弟节点
  return: Fiber | null,   // 父节点
  memoizedState: any,     // Hooks链表
}
```

这棵树用指针替代了嵌套递归调用栈，使遍历过程可随时暂停和恢复：

```ts
function workLoop() {
  while (nextUnitOfWork && !shouldYield()) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
  }
}
```

这里我想强调的是，和`TaskQueue`只能在`pending()`执行完之后检查类似，Fiber架构的可中断性体现在**Fiber边界**——React在执行完一个Fiber单元后检查是否需要让出主线程，而非在任意代码点都能中断。Fiber内用户代码的执行依然是同步的，假如我们在组件函数中编写代价高昂的计算逻辑，依然可能导致单个Fiber执行的耗时超过时间片合理大小带来卡顿：

```ts
function ExpensiveComponent() {
  // 在组件中编写代价昂贵的计算
  const data = performHeavyCalculation(); // 假设耗时 50ms
  
  return <div>{data}</div>;
}

function performUnitOfWork(fiber: Fiber) {
  // 检查点：Fiber边界
  if (shouldYield()) return null;
  
  beginWork(fiber); // 🚨 Fiber内部无法中断，可能阻塞很久！
  
  // 检查点：Fiber边界
  if (shouldYield()) return null;
  
  return fiber.child;
}
```
