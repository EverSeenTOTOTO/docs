# 解构前端框架之响应式和状态管理

先回顾一下上篇用例中的代码：

```js
const App = () => div([
  h(Counter, state),
  button(
    ['Click Me'],
    {
      onClick: () => {
        state.count += 1;
        render(h(App), document.body); // 手动触发重绘
      },
    },
  ),
]);

render(h(App), document.body);
```

我们说注释很重要很重要，因为它引出了响应性话题：我们需要手动绑定状态改变后的重绘逻辑，这正是jQuery被淘汰的原因。该例子中只要在按钮按下后更新状态还好，假如还有`<input>`标签呢？我们不仅要在状态改变时更改输入框里面的值，还要在用户输入后将输入变化同步给应用状态，即所谓的“<Notation type="circle">双向绑定</Notation>”。一个两个元素都需要手动绑定一组状态更新逻辑，应用复杂之后根本顶不住，稍有疏忽就会产生BUG。因此React和Vue最大的贡献是实现了响应性，我们只需要关注状态变更，由框架完成重绘或同步UI状态给应用状态的操作。

## React

### useState

到目前为止，我们所谓的重绘是将组件函数重新执行了一遍，这建立在组件函数都是纯函数的假设之上，同时框架内部有VDOM缓存，通过比对新旧状态触发Diff Patch，这是典型的React模式。该用例不能自动触发重绘的根源在于：`onClick`里面修改`state`的动作**对框架来说是不可感知的**。还记得我们前面提到的class的坏处吗？`state`是一个数据结构，`render`是操作这个数据结构的一段逻辑，那么`onClick`中`state.count += 1`就是绕过了类设计者的心理预期，“偷偷摸摸”修改状态的行为，下面是便于理解的伪码：

```ts
class AnonymousClass {
  state = { count: 0 };

  render = () => div([
    h(Counter, this.state),
    button(
      ['Click Me'],
      {
        onClick: () => {
          this.state.count += 1; // No, please no!
        },
      },
    ),
  ]);
}
```

要克服这个困难，且不能由用户每次手动去绑定重绘逻辑（不然就倒退成了jQuery），那就抽象出一个方法，用户只能使用这个方法修改状态，否则不保证响应性，方法里面封装了触发重绘的逻辑。显然不可能每个类都编写这样的方法，于是提炼到基类中，最好由框架提供。这就是我们熟知的`setState`，伪码如下：

```ts
class React.Component {
  setState(state) {
    if (!shallowEquals(state, this.state)) {
      this.state = state;
      triggerRerender(); // 触发重绘
    }
  }
}

class AnonymousClass extends React.Component {
  state = { count: 0 };

  render = () => div([
    h(Counter, this.state),
    button(
      ['Click Me'],
      {
        onClick: () => {
          this.setState({ count: this.state.count + 1 });
        },
      },
    ),
  ]);
}
```

笔者接触React的时间其实要晚于Vue，那时已经是React Hooks元年了。所以我几乎没怎么书写过class组件。那么在函数式组件中，要怎么达成同样效果呢？答案已经呼之欲出了，状态在外面放哪儿根本无所谓，重点是提供一个包装过的方法，这个方法看起来只是修改状态的，其实里面还封装了触发重绘的逻辑，这不就是`useState`吗！

于是我们可以做一件有趣的事情，抛开React官方的`useState`，自己造个一次性青春版，这是在真实的React项目中编写的例子，你会发现它产生重绘的效果和官方的`useState`几乎一致：

```ts
import { createRoot } from 'react-dom/client';

let memo: unknown;
function useState<T>(init: T): [T, (value: T) => void] {
  const setState = (state: T) => {
    if (memo !== state) {
      memo = state;
      root.render(<App />); // trigger rerender
    }
  };

  if (!memo) setState(init); // initialize

  return [memo as T, setState];
}

const App = () => {
  const [state, setState] = useState(0);

  return <>
    <div>{state}</div>
    <button onClick={() => setState(state + 1)}>Increment</button>
  </>;
};
const container = document.getElementById('root');
const root = createRoot(container!);

root.render(<App />);
```

### useEffect

JS并非纯函数式语言，我们在实际应用中也不可避免地和外部状态打交道，函数中操作外部状态的行为称之为“副作用（Effect）”。React模式每次渲染会将组件函数重新执行一遍，这就不可避免地带来一个问题：有时我们希望组件的副作用只在特定情况下执行，比如使用Timer，我们很可能希望`setTimeout`只在组件初始化的时候执行一次，以后除非`timeout`变化了，否则都不该执行：

```ts
const Foo = () => {
  const [timeout] = useState(1000);

  setTimeout(bar, timeout); // ???

  return <></>;
}
```

像上面这样不能达成目标，即使`timeout`不变，其他因素引起`Foo`重绘，每次执行都会挂载一个Timer，也没有清理掉之前的Timer。解决方案依然是在函数外设置缓存，记下Timer ID和上次的`timeout`值，`Foo`里面通过与缓存的比对判断是否需要执行`setTimeout`：

```ts
let lastTimeoutId;
let lastTimeoutValue = 1000;

const Foo = () => {
  const [timeoutValue] = useState(lastTimeoutValue);

  if (!lastTimeoutId || lastTimeoutValue !== timeoutValue) {
    clearTimeout(lastTimeoutId);
    lastTimeoutId = setTimeout(() => console.log('trigger'), timeoutValue);
  }

  return <></>;
}
```

显而易见，这又是一个应该由框架封装的能力，我们将副作用用一个函数包裹，并告知框架在哪些状态变化时才执行之。理解这一点之后，在刚刚绕过`React.useState`的基础上，我们也可以“淘汰”`React.useEffect`自己实现一个低配版：

```ts
let memo: unknown;
+ const changedStates: unknown[] = [];

export function useState<T>(init: T): [T, (value: T) => void] {
  const setState = (state: T) => {
    if (memo !== state) {
      memo = state;
      changedStates.push(memo); // collect changed states // [!code ++]
      root.render(<App />);     // trigger rerender 
    }
  };

  if (!memo) setState(init);

  return [memo as T, setState];
}
```

```ts
let initOrClear: (() => void) | boolean = false; // 一个清理副作用的函数或者表示已初始化的true

export function useEffect<T>(effect: () => void | (() => void), deps: Array<T>): void {
  if (!initOrClear || deps.find((dep) => changedStates.includes(dep))) { // if any deps has changed
    if (typeof initOrClear === 'function') initOrClear();

    initOrClear = effect() ?? true;
    changedStates.splice(0, changedStates.length);
  }
}

const App = () => {
  const [timeoutValue, setTimeoutValue] = useState(1000);

  useEffect(() => {
    const timeoutId = setTimeout(() => console.log('timeout'), timeoutValue);

    return () => clearTimeout(timeoutId);
  }, [timeoutValue]);

  return <>
    <button onClick={() => setTimeoutValue(timeoutValue + 1)}>Increment</button>
  </>;
};

```

`useState`和`useEffect`可以作为很多其他Hooks实现的基石。现在我们要做的，就是汇总以上知识，在自己的微型React框架中实现真正可复用的Hooks，而不是上面的一次性“青春版”。

实现的难点其实是怎么封装“青春版”Hooks用到的那些全局变量，比如`memo`和`initOrClear`，因为我们不知道用户会调用多少次Hook，不可能预先准备足够的全局变量。那用数据结构吧，因为有一个查找旧状态进行比对的过程，首先想到哈希表，但是用什么作为键呢？我最初的想法是直接`WeakMap`用状态作为键，值代表状态是否`dirty`，很快意识到思路不对，例如`useState([])`，别忘了组件函数每次都会重新执行，所以每次都会创建一个新的`[]`，和上次的`[]`不是一个东西。而且我一开始并没有想到将状态存在组件VNode上，反而想偷懒，用一个全局状态存储，每一项代表一个Hook创建的状态，那么每一项都需要和其所在的组件关联起来，`useEffect`的实现也变复杂了。尝试了各种方法都不太对劲，最后翻了一下Preact的源码才恍然大悟：<Notation>将状态存在组件上，设置两个全局变量`currentComponent`和`currentHookId`，每次组件函数执行之前将`currentComponent`设置为该组件，将`currentHookId`置`0`，这样组件内部调用Hook时就能通过`currentComponent`拿到当前组件，通过`currentHookId`拿到Hook所创建状态的编号并作为哈希表的键</Notation>，这很好地解释了：

1. React要求Hooks只能在组件内部执行，否则拿不到`currentComponent`；
2. React要求Hooks不能放置在分支语句下面，必须是函数体top level，因为走不同分支可能导致`currentHookId`错位。

> 据说最新v19+的React，这些限制已经放松了，有空我们再来深入研究下。

```ts
export type UseStateHookState = { type: 'useState', state: unknown, dirty: boolean }; // [!code ++]
export type UseEffectHookState = { type: 'useEffect', clearEffect?: () => void }; // [!code ++]

export interface VNodeComponent<T> extends VNodeBase<T, 'component'> {
  vdom?: VNode<T>,
  component: (state?: unknown) => VNode<T>,
  state?: unknown,
  hookState: Map<number, UseStateHookState | UseEffectHookState>, // [!code ++]
}

 let currentComponent: VNodeComponent; // [!code ++]
 export const getCurrentComponent = () => currentComponent; // [!code ++]

 let currentHookId = 0; // [!code ++]
 export const getCurrentHookId = () => currentHookId++; // [!code ++]

export const h = (component: (state: unknown) => VNode, state?: unknown) => {
  const vnode: VNodeComponent = {
    tag: 'component',
    component, // [!code --]
    component: (s?: unknown) => { // [!code ++]
      currentComponent = vnode; // [!code ++]
      currentHookId = 0; // [!code ++]
      return component(s); // [!code ++]
    }, // [!code ++]
    hookState: new Map(), // [!code ++]
    state,
  };
  return vnode;
};
```

完整的Hooks实现代码见[这里](https://github.com/EverSeenTOTOTO/mini-framework/blob/main/src/react/index.ts)。

## Vue

class组件将一个数据结构和它相关的逻辑内聚在一起本意是好的，响应式的问题其实只是我们按照符合自己思维模式的方式`this.state.count += 1`改变状态的时候，框架不知道我们做了这样的改变。如果，我是说如果，有一个框架能够让我们以这种更自然的方式编写代码，一个状态更新了，那么所有关联的状态和副作用都自动更新或触发，不需要手动声明依赖关系，你会更青睐这个框架吗？

没错，这样的框架是存在的，它就是<Notation type="cross">Svelte</Notation> <Notation type="cross">Mobx</Notation> <Notation type="cross">Valtio</Notation> Vue。实现这个机制的关键在于两个设计模式：**代理模式和观察者模式**。如果说React是对人们修改状态的方法做了限制（`setState`），那么Vue就是对我们初始化状态的方法做了限制（`ref`）。我们使用框架API初始化状态之后拿到的其实是一个代理对象，而这个代理本身又是一个被观察的目标，当它改变时，会主动推送更改至所有观察者。由于初始化只要做一次，心智负担通常轻很多。

JS从语言层面支持对象代理，我们用一小段代码就可以说清楚Vue的响应式原理：

```ts
type Effect = (oldVal: unknown, newVal: unknown) => void;

const observers: Effect[] = [];
const target = { value: 42 };

// Vue3
const proxy = new Proxy(target, {
  set(t, p, newValue) {
    const oldValue = Reflect.get(t, p);
    const result = Reflect.set(t, p, newValue);

    observers.forEach((ob) => ob(newValue, oldValue));

    return result;
  },
});


// Vue2
// const proxy: Record<string | symbol, unknown> = {};

// Object.defineProperty(proxy, 'value', {
//   set(newValue) {
//     const oldValue = target.value;
//
//     target.value = newValue;
//     observers.forEach((ob) => ob(newValue, oldValue));
//   },
//   get() {
//     return target.value;
//   },
// });

const watch = (callback: Effect) => {
  observers.push(callback);

  return () => observers.splice(observers.indexOf(callback), 1);
};

const unwatch = watch((o, n) => console.log(`oldValue: ${o}, newValue: ${n}`));

proxy.value = 0; // oldValue: 42, newValue: 0

unwatch();

proxy.value = 42; // silent
```

现在我们作为框架的实现者，要做的就是把上面这段代码进一步抽象，使之成为用户可用的API。用户初始化状态时，在API内部，创建代理对象，并预设一些触发Diff Patch的`observers`，最后返回这个代理给用户即可。通过在状态初始化时做一点额外工作，以后更改状态时就能“精确定位”到关联的VDOM、衍生状态、副作用等等。

Vue3说它的Hooks只需要执行一次，这是针对`setup`函数只需要执行一次来说的。在去掉所有的语法糖之后，`setup`返回的那个函数（在Vue语境中称为渲染函数）才真正和React语境中的函数组件是等价的。因此，得益于我们的微型React和Vue使用同一套VDOM后端，在我们的框架中可以写出这样一段“疯狂”的代码：

```ts
const counter = {
  setup() {
    const ref = vue.ref(0);

    vue.watch(ref, (n) => console.log(`Outside: ${n}`));

    return () => {
      const [count, setCount] = react.useState(ref.value);

      react.useEffect(() => console.log(`Inside: ${count}`), [count]);

      return fragment([
        div([`${ref.value}`, `${count}`]),
        button(['Outside'], {onClick: () => {ref.value += 1;}}),
        button(['Inside'], {onClick: () => setCount(count + 1)}),
      ]);
    };
  },
};
```

把使用Vue Hooks定义的状态理解为类的数据，返回的渲染函数理解为操作数据的类成员函数，React Hooks提供了在纯函数内部定义状态和副作用的手段，理清楚这一点之后应该不难理解`setup`其实是个变相的constructor：

```ts
class Counter {
  state = { vue hook states },
  render = () => {
    react hooks;

    return vdom;
  }
}
```

具体实现上有一个注意点：Vue Hook定义的状态可能与渲染函数无关，当它们改变时不需要触发渲染函数的重新执行。解决方案也很简单，渲染函数要用到的状态，在渲染函数被执行时一定会`get`它的值，因此我们只在`getter`里面增加状态改变触发Diff Patch的观察者，这也是Vue原理所说的先触摸（<Notation type="circle">touch</Notation>）再追踪（<Notation type="circle">track</Notation>）。其他实现细节和React组件大同小异，甚至因为`setup()`返回的渲染函数就是一个React语境中的组件函数，可以直接复用之前的`VNodeComponent`类型而不用额外定义一个新的`VNode`类型。完整代码在[这里](https://github.com/EverSeenTOTOTO/mini-framework/blob/main/src/vue/index.ts)。

