# Vue nextTick

`nextTick`常用于获取状态更新后最新的DOM。在一轮JS代码执行后（注意这是一个HTML事件循环标准中的“Task”），用户使用`nextTick`注册的回调会添加到一个任务队列中，在Task之后的微任务检查点一次性flush掉，这可以保证`nextTick`里拿到更新后的DOM。但由于浏览器重绘阶段在微任务检查点后面，如果我们在`nextTick`里面阻塞住的话，也是看不到更新后的DOM被绘制到屏幕上的。

有个我之前一直没有真正搞清楚的问题：我们在改变状态后立即打印`this.$el`上的属性，看到的是旧值，说明内部DiffPatch将状态更新反馈到DOM结点上是一个异步的过程，既然是异步的，那也需要某种机制实现，而`nextTick`注册的回调也是异步的，它们之间是如何确保先后关系的呢？容易想到的解释是Vue内部也用了和React `setState`类似的合并状态更新并批量处理的机制，带着这个想法去读源码可以找到[证据](https://github.com/vuejs/vue/blob/7161176cd0dff10d65ab58e266018aff2660610f/src/core/observer/scheduler.ts#L166)，`queueWatcher`在[watcher](https://github.com/vuejs/vue/blob/7161176cd0dff10d65ab58e266018aff2660610f/src/core/observer/watcher.ts#L196)中依赖变化时调用，其flush副作用队列的行为抽象为一个回调`flushSchedulerQueue`，在内部也是使用的`nextTick`进行调度，和用户注册的`nextTick`回调处在同一个队列中。

基于这个理解，我们可以推测并验证`watch`和`nextTick`触发的顺序。下面的代码片段中，打印的顺序是`nextTick 1`、`watcher`、`nextTick 2`，因为第一个`this.$nextTick`注册的回调先于随后状态改变导致的`watch`回调入队。如果将`this.msg = 'hello world'`语句调整到第一个`this.$nextTick`前，则打印的顺序是`watcher`、`nextTick 1`、`nextTick 2`。

```html
<script>
export default {
  data() {
    return {
      msg: 'vue',
    };
  },

  watch: {
    msg() {
      console.log('watcher');
    },
  },

  methods: {
    onClick() {
      this.$nextTick(() => {
        console.log('nextTick 1');
      });

      this.msg = 'hello world';

      this.$nextTick(() => {
        console.log('nextTick 2');
      });
    },
  },
};
</script>

<template>
  <div @click="onClick">
    {{ msg }}
  </div>
</template>
```

`nextTick`还有一个使用场景是父子组件的状态通信，下面的例子中，如果我们在子组件`this.$emit('click')`之后直接打印父组件传下来的`props`，会发现仍是旧值，但如果用`this.$nextTick`或者其他异步任务，则打印出来的是新值。

::: code-group
```html [父组件]
<script>
import Demo from './Demo.vue';

export default {
  components: {
    Demo,
  },

  data() {
    return {
      text: 'blue',
    };
  },

  methods: {
    onClick() {
      this.text = 'red'; // 监听到子组件click事件后，更新props
      queueMicrotask(() => {
        console.log('parent async');
      });
    },
  },
};
</script>

<template>
  <demo
    :text="text"
    @click="onClick"
  />
</template>
```

```html [子组件]
<script>
export default {
  props: ['text'],
  emits: ['click'],

  methods: {
    onClick() {
      this.$emit('click');
      console.log(`child sync: ${this.text}`); // 旧值

      queueMicrotask(() => {
        console.log(`child async: ${this.text}`); // 新值
      });
    },
  },
};
</script>
<template>
  <button @click="onClick">
    {{ text }}
  </button>
</template>
```
:::

这说明Vue的双向数据流也是异步的，不过这个数据流分为两个步骤，一个是子组件`$emit('click')`事件冒泡上去，一个是父组件监听到事件后更改`props`并传播下来，这两个步骤都是异步的吗？还真不是，上面代码片段中，会先打印`parent async`再打印`child async`，这说明“冒泡”过程是同步的，否则没有任何理由紧随着子组件`$emit('click')`同步安排的微任务会晚于父组件`onClick`里面安排的微任务。我们只需要在子组件里增加一行代码就可以验证这一点，在子组件`$emit('click')`之后立即打印父组件的状态，会发现是最新值：

```js
onClick() {
  this.$emit('click');

  console.log(this.$parent.text); // 新值  // [!code ++]
  console.log(`child sync: ${this.text}`); // 旧值

  queueMicrotask(() => {
    console.log(`child async: ${this.text}`); // 新值
  });
},
```

Vue中的`nextTick`与`process.nextTick`的区别在于，它的实现曾经在宏任务和微任务之间反复横跳。各有缺点，微任务由于在每个Task之后都有检查点，可能在诸如事件传播等内部Task之前触发，典中典是这个[issue](https://github.com/vuejs/vue/issues/6566)：

```html
<div v-if="expand">
  <i @click="expand = false">Expand is True</i>
</div>
<div v-else @click="expand = true">
  <i>Expand is False</i>
</div>
```

在Vue早期版本，`nextTick`是微任务，点击`<i>`始终只能看到`Expand is True`字样，因为`nextTick`微任务在事件冒泡到外层`div`之前触发，由于VDOM结构相同，Vue会复用原有的DOM，仅仅在Patch的时候给`<div>`加上`@click`句柄，当事件传过来之后，`<div>`的回调被触发于是`expand`依然被设置为`true`，触发第二次更新，之后才有浏览器重绘。当时可行的解决方案是使用`key`来告知Diff算法将它们视为两个不同的结点。

中期Vue尝试过宏任务实现或者微/宏任务混用的策略，宏任务的问题就更明显了，根据浏览器时间循环，每个Task执行完都有一个微任务检查点和一次Update the Rendering的机会，很可能由于宏任务的低优先级出现样式闪烁。

现在`nextTick`的[实现](https://github.com/vuejs/vue/blob/main/src/core/util/next-tick.ts)已经稳定在微任务版本，只有需要fallback的时候才会切换到宏任务。并且对事件回调做了[特殊处理](https://github.com/vuejs/vue/blob/main/src/platforms/web/runtime/modules/events.ts#L56)，让事件回调只可能被它`attach`之后才产生的事件触发，这就避免了刚才被触发两次的问题。
