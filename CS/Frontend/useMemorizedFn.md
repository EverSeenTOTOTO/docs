<script setup>
import UseMemorizedFn from '@vp/page-only/UseMemorizedFn.vue';
</script>

# useMemorizedFn

将事件回调包裹在`useCallback`中通常会带来一个两难抉择：如果将`useCallback`的依赖数组置空以确保回调函数对象一直不变，可以避免不必要的重绘，但函数中访问的状态由于闭包捕获将不再更新；如果对React“诚实”，将函数所依赖的状态完整声明在`useCallback`数组中，则每次状态变更时我们都会得到一个新的回调方法，间接导致所有依赖此方法的组件重新渲染或者副作用重新执行。

示例中将`TestBtn`组件用`React.memo`包裹，这意味着除非`TestBtn`的`props`发生变化（浅比较不等），否则组件不会重新渲染：

```tsx
const TestBtn: React.FC<{ onClick(): void, children: React.ReactNode }> = React.memo(({ onClick, children }) => {
  console.log(`rerender: ${children}`);

  return <button
    type="button"
    onClick={onClick}>
    {children}
  </button>
})
```

随后中创建三个“典型”回调，`setCountNaive`每次`Demo`渲染（重新执行组件方法）都会实例化一个，`setCountNoDep`不变，而`setCountWithDep`只会在`count`改变时重新实例化：

```tsx
const Demo = () => {
  const [count, setCount] = useState(0);

  const setCountNaive = () => setCount(count + 1);
  const setCountNoDep = useCallback(() => {
    setCount(count + 1)
  }, []);
  const setCountWithDep = useCallback(() => {
    setCount(count + 1);
  }, [count]);

  return <div>
    <TestBtn onClick={setCountNaive}>Inc</TestBtn>
    <TestBtn onClick={setCountNoDep}>IncNoDep</TestBtn>
    <TestBtn onClick={setCountWithDep}>IncWithDep</TestBtn>
    <div>
      {count}
    </div>
  </div>
};
```

如前文所述，当我们点击按钮调用`setCountNaive`或`setCountWithDep`的时候，`count`会不断累加，触发`Demo`的渲染，间接导致三个`TestBtn`重新渲染，由于`TestBtn`被`React.memo`包裹，因此实际只有`setCountNaive`、`setCountWithDep`所属的`TestBtn`会重绘并在控制台打印：

    rerender: Inc
    rerender: IncWithDep

假如点击`setCountNoDep`，由于函数实例化时捕获的`count`为`0`，因此它只会不断地将`count`设置为`1`。这不是我们想要的，有没有什么方法，能够既保证函数对象不变，又能保证函数执行时访问到的状态总是最新的呢？其实很简单，涉及到“不变”的时候通常会用到`useRef`或者其他绕过浅比较的机制，这里我们只需要将`setCountNaive`用`ref`包裹，真正返回的是一个提取`ref.current`进行调用的包裹方法，再将这个方法用`useCallback`记住，ahooks 中的`useMemoizedFn`正是这样实现的：

```ts
const useSmartCallback = <T, P>(fn: (...params: P[]) => T) => {
  const fnRef = useRef<typeof fn>(fn);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn])

  return useCallback((...params: P[]) => fnRef.current(...params), []);
}
```

```tsx
export default () => {
  const [count, setCount] = useState(0);

  const setCountNaive = () => setCount(count + 1);
  const setCountNoDep = useCallback(() => {
    setCount(count + 1)
  }, []);
  const setCountWithDep = useCallback(() => {
    setCount(count + 1);
  }, [count]);
  const setCountSmart = useSmartCallback(() => { // [!code ++]
    setCount(count + 1) // [!code ++]
  }) // [!code ++]

  return <div>
    <TestBtn onClick={setCountNaive}>Inc</TestBtn>
    <TestBtn onClick={setCountNoDep}>IncNoDep</TestBtn>
    <TestBtn onClick={setCountWithDep}>IncWithDep</TestBtn>
    <TestBtn onClick={setCountSmart}>IncSmart</TestBtn> // [!code ++]
    <div>
      {count}
    </div>
  </div>
};
```

下面例子在检测到重绘时将变更背景色，300ms之后才重置。点击各按钮并观察发生重绘的组件，IncSmart应当保持不变：

<UseMemorizedFn />
