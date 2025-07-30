# 解构前端框架之Fiber

<script setup>
import ImageView from '@vp/ImageView.vue'
import reactPerfPanel from './react-perf-panel.webp'
import minePerfV1 from './mine-perf-v1.webp'
import minePerfV2 from './mine-perf-v2.webp'
</script>

```js
const {div, button, fragment, h, createRoot, useState, useEffect} = window.React;

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

<video src="./recursive-block.mp4" controls />

<ImageView :src="minePerfV1" />

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

<video src="./react-fiber.mp4" controls />

<ImageView :src="reactPerfPanel" />

::: code-group

```ts [Before]
function evalSeq(nodes: VNode[]) {
  return flatten(nodes.map(evalVNode)) as Node[]; // flattern
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

```ts
export type Task = {
  priority: number;
  job: () => void
};

export class TaskQueue {
  tasks: PriorHeap<Task>;

  readonly frameLimit: number;

  private channel:MessageChannel;

  private running = false;

  constructor(frameLimit = 1000 / 60) {
    this.tasks = new PriorHeap<Task>([], (a, b) => a.priority < b.priority);
    this.frameLimit = frameLimit;
    this.channel = new MessageChannel();

    this.channel.port1.onmessage = () => this.flushTask(); // [!code focus]
  }

  schedule(task: Task['job']):void;
  schedule(task: Task):void;
  schedule(task: any) {       // [!code focus]
    if (typeof task === 'function') {
      this.tasks.push({ job: task, priority: /* lowest */ Number.MAX_SAFE_INTEGER });
    } else {
      this.tasks.push(task);
    }
    this.flushTask();         // [!code focus]
  }                           // [!code focus]

  protected flushTask() {
    if (this.running) return;
    this.running = true;

    const start = Date.now(); // [!code focus]

    while (true) {
      const top = this.tasks.pop();

      if (!top) {
        this.running = false;
        break;
      }

      top.job();

      if (this.tasks.length === 0) {
        this.running = false;
        break;
      }

      const elapsed = Date.now() - start;     // [!code focus]

      if (elapsed >= this.frameLimit) {       // [!code focus]
        // shedule next loop                  // [!code focus]
        this.channel.port2.postMessage('');   // [!code focus]
        this.running = false;
        break;
      }
    }
  }
}

```

```ts
function evalSeq(nodes: VNode[], callback: (output:Node[]) => void) {
  if (nodes.length === 0) {
    callback([]);
    return;
  }

  evalVNode(nodes[0], (firstOutput) => {
    evalSeq(nodes.slice(1), (restOutput) => {     // [!code --]
    queue.schedule(() => evalSeq(nodes.slice(1), (restOutput) => { // [!code ++]
      callback([...firstOutput, ...restOutput]);
    }));
  });
}
```
<ImageView :src="minePerfV2" />
