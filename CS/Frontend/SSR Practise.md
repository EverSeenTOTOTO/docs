# SSR实践

此文是我在进行SSR（服务端渲染）技术调研以及实现一个粗糙的[SSR模板项目](https://github.com/EverSeenTOTOTO/browser-app-boilerplate)过程中积累的经验总结。虽然直到离职SSR方案都没有落地，但这个过程中有很多东西值得记录一下。没有落地的原因是原公司的后端以Java技术栈为主，往nodejs服务端迁移步子跨得有点大。我们也讨论过一些解决方案，例如将nodejs服务仅作为一个中间的渲染层，或者是非js运行时的渲染服务，但最终考虑到运维压力和团队的技术积累还是搁置了。

文中假设你对CSR、SSR这两种渲染方式有一定认识，如果还不是很清楚，可以先去看这里列举的几篇很详实的文档，同时也假设你对时下常用的webpack、vite等前端构建工具有一定了解。

*   <https://web.dev/rendering-on-the-web/>

*   <https://github.com/reactwg/react-18/discussions/37>

*   <https://prateeksurana.me/blog/future-of-rendering-in-react/>

## 为什么SSR技术值得关注

1.  SSR以及进阶的SSR是前端渲染技术发展的趋势

    俗话说天下大势合久必分分久必合，前端应用的渲染方式也逃不过这一规律。如果将古老（笑）的jsp和php服务端渲染方式看作“分”，CSR时期完全由客户端脚本控制渲染过程视为“合”的话，那么从React18新特性到Next.js、Nuxt.js等框架的演进来看现在的前端应用又一次经历应用碎片化各单元独立渲染甚至双端渲染的“分”这一阶段，而这一次演化正是由SSR技术在实践中的发展而来，后文谈到React18时我们还会再提及。

2.  SSR是前端工程化技术的集大成者，也是前端性能优化的深水区

    这里不妨说一说我的亲身经历。我们注意到页面性能问题并开始考虑优化是在将公司的老旧jsp页面向React Native（几个高频首页）和Vue（多数页面）等现代化框架迁移之后，大致可以划分为四个阶段：

    1.  第一阶段，页面性能评分标准设施的搭建

        光凭体感说慢说优化了当然缺乏说服力，因此需要建立一个能够同时运行在开发测试和生产环境，从前端归集数据到数据中心处理到后端大屏展示乃至通知预警的这么一条回路。后端的设施我了解不多，只大概知道采用的是ELK技术栈，这一阶段与前端有关的是一些埋点、异常与性能采集公共组件的开发，记忆犹新的名词有`web performance API`、`web vitals`、`sourcemap`等，网上有不少关于大厂团队如何建立自己的前端异常性能监控体系的文章，值得一看；

    2.  第二阶段，纯前端的优化

        顾名思义，在这个阶段进行的优化都是只靠前端自身就能够完成的，耳熟能详的名词有懒加载、组件瘦身（按需加载）、图片压缩等等。这一时期主要考验的是前端人对web渲染机制和各种工程化工具的了解，以及一些具体到业务层面的技术细节，例如`v-if`和`v-show`、`visibility: hidden`和`display: none`、 `<KeepAlive />`、`React.memo`等。我提及一些名词，从事过相关需求的同学大约都能够会心一笑：`webpack-bundle-analyzer`、`svg-sprite-loader`、`image-minimizer-webpack-plugin`、`babel-plugin-import`、`GPU accelerate`、`prerender`、`dynamic polyfill`……。

    3.  第三阶段，原生支持的优化

        在经历了第二阶段之后，影响前端App的主要因素已经是CSR框架的固有缺陷了。除了利用更好的缓存（比如ServiceWorker）和CDN策略做一定改良之外，在移动端领域还有一个行之有效的方向就是向原生求助，我们就曾采取过在App启动以及WebView容器加载时做一些预拉取和缓存的方案，实际效果几乎可以与ReactNative页面媲美。更进一步有两个方向，一是利用无头浏览器技术做更多的测试、采集和分析工作，二是从业务需求出发，找到一些有原生参与能够减轻前端负担的点，比如老大难的返回到路由栈合适位置的问题，不过这已经上升到用户体验层面了。

    4.  第四阶段，服务端支持的优化

        兜兜转转，也伴随着社区技术的发展，最后我们都不约而同回想起了被jsp统治的恐惧🐶。比较有趣的是一开始我们并不想把步子迈得太大，而是希望实现某种“带有生产数据的预渲染”，介于应用构建时缺胳膊少腿的预渲染和生产实时的服务端渲染之间。因为我们的很多页面说它动态也没有那么动态，虽然数据是要从后端拿的，但往往都是些产品介绍信息，在很长一段时间内变化都不大。因此可以设法在一个准生产环境拉取生产数据进行渲染并发布到CDN。这一方案的优势之处在于这层计算密集型渲染服务不必对客，做好降级到客户端渲染的准备，生产运维的压力很小。

        最后才是我视为皇冠上之明珠的服务端渲染，也是百尺竿头迈出的更进一步。即使最终因其他原因离职没有看到相关技术的落地，整个技术调研的过程也给予了我很多启发，以及有关前端应用架构的新视角，个中写demo的经历也是本文的由来。

## 实现要点

### 项目结构

已经跑题很远了，还是赶紧回到正题吧。项目结构看起来是很个性化的东西，这里介绍的是我从网上各种博客教程乃至一些框架的官方实例中总结的通用结构，理解这个模块划分还是很有帮助的。

SSR之所以成立，是因为不管是React、Vue还是Svetle等，这些框架都具备将View层转化为原始HTML的能力。以往CSR模式，这一过程发生在用户的浏览器上，要在用户加载了框架代码之后才发生。而web渲染的顺序包括生成DOM树->生成CSSOM树->合并成最终的DOM结构，这一过程中如果有需要加载和执行的js脚本将大幅度阻塞渲染进度，如果脚本中操作DOM的话还会破坏已经生成的DOM树导致重复工作，这也是为什么我们通常将stylesheet放在`<head>`中而scripts放在HTML文档的尾部，可以说js脚本在关键渲染路径中的次序相对靠后。在纯粹的CSR模式下，用户拿到的DOM主体空空荡荡，只有一个应用的挂载点`<div id="root"></div>`，真正的页面要到框架代码完全加载并执行之后才渲染出来挂载到该`<div>`上，这期间用户看到的都是白屏，造成不良用户体验。

既然前端框架具备直接将VDOM转为HTML文本的能力，一个优化的思路就是回到以前jsp的时代，在服务端预先填充数据并渲染出最终的HTML，交付给用户。但这并不意味着CSR的过程就不会发生了，在用户的浏览器上客户端渲染还会进行，因此自然就会产生一个疑问：在服务端渲染了一遍，客户端拿到静态资源之后还会再渲染一次，不会产生冲突吗？于是引出两个名词：“**同构应用（isomorphic application）**”和“**水化（hydrate）**”。

同构应用很好理解，以往我们只需要将应用构建为跑在web环境的静态资源就行了，现在还需要将应用构建成能够跑在服务器环境（假定是nodejs）的一份，并且对应用中只能运行在某一端的部分做特别处理，例如用到web或nodejs特定API的代码。但总体上这两端的渲染功能都是相同的，因此称为同构应用。而客户端浏览器拿到已经渲染的结果之后，也不必从零开始渲染，而是利用该结果仅做一些添加事件句柄等页面活化工作即可，这个过程被称为“水化”。可以将渲染好的静态HTML文档想象成是干涸的土地，水化之后能够响应用户操作的页面才是有了水生态而生机勃勃的土壤。

下一个问题是服务端应用如何嵌入到服务器中？主流的做法是以中间件的形式。因此我们的应用至少被划分成了三个部分：客户端应用代码、服务端应用代码、服务器代码，并且为了构建配置的方便通常各自设置一个入口，体现在我的模板项目中就是`index.server.ts`、`index.client.ts`和`server/index.ts`，在后文中我也会使用`clientApp`、`serverApp`和`server`来指代这三个入口。

*   最终运行在客户浏览器上的`index.client.ts`：

    ```js
    import createApp from './main.ts';

    const app = createApp();

    app.mount(document.getElementById('root'));
    ```

*   运行在服务器上的`index.server.ts`，以中间件形式提供渲染能力，这种方式能够很好地融入常见的nodejs后端框架，如Express、Koa、Egg.js和Nest.js等：

    ```js
    import { renderToString } from 'framework';
    import createApp from './main.ts';

    export const render = (req, res) => {
        const app = createApp();

        // 定位到所访问的页面
        navigate(app, req,url);

        res.setHeader('Content-Type', 'text/html');
        res.end(renderToString(app);
    }
    ```

    这里有一个注意点是我们在每个请求到来时都会创建一个应用实例，因为不同的用户访问的页面和具有的服务端状态都不同，使用单例显然会造成问题。而客户端代码运行在用户的浏览器上，看似单例，其实也是多例。

*   服务器代码，以express为例

    ```js
    const render = require('dist/index.server.js');
    const server = express();

    // 提供除index.html之外的其他静态资源，如图片、css文件等
    server.use(express.static('dist', { index: false }));
    server.get('*', render);
    ```

### 双端路由

既然在服务端同构应用里仍然要先定位到用户所访问的页面再进行渲染，也就意味着应用的路由功能需要同时在web端和nodejs端发挥作用。好在主流的路由方案都提供了双端的实现，我们要做的就是根据所在环境的不同使用不同的实现：

```js
function createRouter() {
    return isBrowser() ? createClientRouter() : createServerRouter(),
}
```

问题还没完，正如马上就要提到的，为了渲染出真实的页面，我们往往还需要在渲染之前进行页面数据的预取（prefetch），于是获知当前正在访问的是哪个页面并执行它的状态预取逻辑就成了必要的需求。如果是`vue-router`，它提供了`router.currentRoute.value.matched`来获取当前访问的组件实例（`vue-router@3`的API稍有不同），但React侧我常用的`react-router-dom`却没有找到相应的API。这个问题的一种常见解决方案是利用约定式路由，规定页面级组件都放置在`pages/`根目录下，然后配合构建工具拿到页面所实现的状态预取接口。例如vite提供了一个方便的`import.meta.glob`方法：

```js
const pages = import.meta.globEager('../pages/*.tsx');

const routes = Object.keys(pages).map((path) => {
  const name = path.match(/\.\.\/pages\/(.*)\.tsx$/)![1];

  return {
    name,
    path: name === 'Home' ? '/' : `/${name.toLowerCase()}`,
    component: pages[path].default,
    // ssr prefetch hook defined in component file
    prefetch: pages[path].prefetch,
  };
});
```

### 状态预取

有了路由支持，有了状态预取，看起来似乎万事大吉了，其实还早，别忘了，我们的客户端只拿到了基于服务端预取数据渲染的静态HTML文档，但是却没有预取的数据，而获取数据的逻辑无疑要等到js脚本加载完毕才会执行，于是我们的应用会经历一个由完整数据渲染页面（服务端）——直接展示渲染好的页面（客户端）——由空数据更新页面（客户端）——由完整数据更新页面（客户端）的阶段，这不太对劲。因此还需要设法将预取的数据放置到渲染好的静态HTML文档中，常见的方案是将js对象序列化之后挂载到`window`对象上：

*   服务端应用：

```js
import serializeJavascript from 'serialize-javascript';
import { renderToString } from 'framework';
import createApp from './main.ts';

const serialize = (state) => `<script>;window.__PREFETCHED_STATE__=${serializeJavascript(state)};</script>`;

export const render = (req, res) => {
    const app = createApp();

    // 定位到所访问的页面
    navigate(app, req.url);
    // 预取数据
    prefetch(app);

    const html = renderToString(app);

    // 注入数据
    injectHtml(html, serialize(app.state));

    res.setHeader('Content-Type', 'text/html');
    res.end(html);
}
```

*   客户端应用

```js
import createApp from './main.ts';

const app = createApp();

if (window.__PREFETCHED_STATE__) {
    // 合并预取的数据，根据状态管理库的选择实现上各有不同，例如React可以考虑createContext
    mergeState(app, window.__PREFETCHED_STATE__);
    delete window.__PREFETCHED_STATE__;
} else {
    // fallback client fetch
    prefetch(app);
}

app.mount(document.getElementById('root'));
```

## 构建配置要点

最基础的SSR实现已经介绍完毕，现在我们来讨论真正折磨人的构建配置——

### 三个入口的输出格式

这个简单，理清楚就行了。`clientApp`还是和以前一样，构建为面向客户端的静态资源，而`serverApp`和`server`都是要在服务端运行的，因此应该构建为面向nodejs环境的cjs包。此外后两者的npm依赖可以考虑都设置为外部依赖（external），加快构建速度。

### 服务端渲染时样式文件、图片等资源的处理

两种方案，一种是置之不理，例如在webpack中可以直接使用`null-loader`无视掉导入的样式资源，这要求我们用于服务端渲染的HTML模板是`clientApp`已经构建好的产物，这样`<head>`中已经嵌入了相关资源的链接，服务端渲染仅仅是填充页面主体而已，这可以避免先加载文档主体再加载样式导致的闪烁问题。但对于一些比较动态的样式库，其样式在渲染过程中随着组件代码的执行动态生成，就需要采用第二种方案，手动收集渲染过程中产生的样式代码并和应用状态一样嵌入到HTML文档中交付给客户端。比如[emotion](https://emotion.sh/docs/ssr#on-server)，提供了`extractCriticalToChunks`、`constructStyleTagsFromChunks`之类的API来收集样式。手动嵌入的时候要特别留意`<style>`标签顺序可能导致的问题。

> 有时我们将整个HTML都用JSX编写，但对vite这种以index.html为入口的工具来说不太友好，这里不做讨论。

### 开发调试与HMR

如果仅仅是生产构建还好，要实现开发调试阶段的HMR（热更新）尤其是服务端同构应用的HMR就没有那么简单了。主要面临三个问题：1. 我们的应用分为了三个需独立构建的入口，分别使用工具构建的话，在开发阶段它们都放置在不同的memfs中，没法相互访问；2. 开发服务器自成一体，和我们的服务器的角色重合了，那么，究竟应该使用哪个服务器才好呢？3. 如果使用构建工具提供的服务器，并且还想要在开发阶段也能预览SSR效果，就不能让开发服务器发送客户端构建产生的HTML而要走我们的SSR中间件，这需要深入开发服务器的肌理。

问题的实质是开发调试模式的选型，这里有两种可行的方案，各有优劣：

1.  使用我们自己的服务器，这其实要求我们重新实现一个webpack-dev-server或者vite-dev-server。对于webpack，我们可以参考webpack-dev-server的实现并复用其中的webpack-dev-middleware和webpack-hot-middleware；对于vite，由于vite提供了一个middleware模式，要轻松一点（真的只有一点）。这种方案的优势在于能够获得完全的控制权，例如提前创建好memfs，然后分别提供给构建三个入口的compiler，同时中间件的顺序和行为都是可控的，问题2和3都迎刃而解了；其缺点在于比较考验团队的技术力和人力，我这里三言两语，真要实现出与webpack-dev-server相当的效果也不容易，devServer还有很多其他的问题要考虑，比如静态资源的部署、publicPath、history fallback、proxy等等。vite官方的SSR示例采用了这种方案，~虽然官方demo写得也是乱七八糟的~；

2.  使用构建工具提供的服务器，在原有`clientApp`开发服务器的基础上，放弃`server`的HMR，仅考虑`serverApp`。我们可以借助构建工具的配置选项，将构建后memfs中的`serverApp`以中间件的形式注入到开发服务器中，在webpack@5中可用的配置选项有`devServer.setupMiddleware`，在vite中是`vite.middleware.use`。这种方案的优势是较为简单，并且适合迁移已有的配置，在模板应用中我采用的就是这种方案；其缺点自然是不便调试`server`代码。

    ```js
    const createDevSSRMiddleware = (devServer) => (req, res) => {
        const ofs = devServer.compiler.outputFileSystem;

        try {
            // 需要能从内存文件系统加载模块的patchedRequire
            const { render } = await patchedRequire(ofs, 'dist/index.server.js');

            await render({ req, res });
          } catch {
            next();
          }
    }

    // webpack@5 config
    module.exports = {
        devServer: {
             setupMiddlewares: (middlewares, devServer) => {
                middlewares.push(createDevSSRMiddleware(devServer));

                return middlewares;
            },
        }
    }
    ```

## React18带来的变化

### 流模式

在介绍React18之前，先简单介绍一下React18之前业已存在现已废弃的一个API：`renderToNodeStream`，类似API也存在于`vue/server-renderer`之中。前文使用的`renderToString`需要将整个DOM结构渲染成字符串之后再发送给客户端，而HTTP是支持流式传输的，因而可以考虑边渲染边传输内容，小幅度提升性能：

```js
export const render = (req, res) => {
    // ...

    renderToStream(app).pipe(res);
}
```

但这又带来了新的问题，上面我们提到，通常会采用客户端已构建好的HTML作为渲染模板，渲染后还有手动嵌入序列化好的状态与样式字符串的需求，改成流式之后，如何能在合适的地方嵌入内容呢？当然是自己写入`res`流了：

```js
export const render = (req, res) => {
    // ...
    // 将模板html划分为头和尾两个部分
    const [headPart, tailPart] = splitTemplateHtml();

    // first send head part
    res.write(headPart.trim());
    stream.on('end', () => {
      // finally send rest of template
      res.write(serialize(app.state));
      res.write(tailPart.trim());
      res.end();
    });
    // then rendered content
    stream.pipe(res);
}
```

在React18之前，服务端渲染是无法处理`<Suspense>`内容的，只能得到`Error: ReactDOMServer does not yet support Suspense.`这样的错误。更核心的是，无论`renderToString`还是`renderToStream`，都逃不过一种自顶向下的视角，渲染的整个流程是数据预取——服务端渲染——客户端渲染——静态资源加载——水化，每个阶段之间泾渭分明，必须等待上一个阶段完成才能进行，其缺点在开头贴出的文档中有详细介绍。而现实中即使是一个应用内部，各部分渲染的开销和加载速度也是不一样的，有些相对静态的展示内容渲染起来很快，而诸如评论之类的区域可能很慢需要作为异步组件。React18拓展了`<Suspense>`的能力，引领我们**将应用分割成一个个相对独立的渲染单元**，React会首先渲染出同步加载的页面主体并写入流中，`<Suspense>`边界内的懒加载组件这时被渲染为`fallback`内容及一些占位符，随后**在同一个流中**，等到组件加载完毕之后React会对其进行渲染，并将渲染结果写入流中，这些片段包含有将占位符替换为最终渲染结果的代码。这个过程不必按照组件层级的顺序，甚至不必等待客户端js脚本的加载。不仅如此，React还实现了被他们称之为“**Selective Hydration**”的技术，真正做到哪个部分就绪了就优先水化哪个部分（例如该部分的js代码先于整个流完工就已加载完成），用户操作哪里就优先水化哪里。

让我们用模板项目中的例子来做具体说明，在`Home.tsx`中我们使用了一个懒加载组件`<Hello />`，`Hello.tsx`平平无奇，会在获取到自身需要的数据之后就绪：

*   Home.tsx

    ```js
    import { lazy, Suspense } from 'react';

    const Hello = lazy(() => import('./comonents/Hello'));

    const Home = () => {
      return <div>
            <button>about</button>
            <Suspense fallback={<div>Loading...</div>}>
                <Hello />
            </Suspense>
        </div>;
    };

    export default Home;
    ```

*   Hello.tsx

    ```js
    import { useStore } from '@/store';
    import { observer } from 'mobx-react-lite';

    const Hello = observer(() => {
      const home = useStore('home');

      // Suspense allows you throw promises from your React components when
      // it needs something that is not ready yet (fetching data, lazily importing components, etc).
      // These promises are caught at the “Suspense boundary” — whenever a promise
      // is thrown from rendering a Suspense sub-tree, React pauses rendering
      // that sub-tree until the promise is resolved, and then tries again.
      if (!home.name) throw home.fetchName(); // simulate context.read() in react official demo

      return <div>hello {home.name}</div>;
    });

    export default Hello;
    ```

下面是我们打印出的依次写入到HTML流中的内容，`<!--$?-->`和`<!--/$-->`都是占位符的标记，用于表示一个“Suspense Boundary”的起始和终止，而其中的`<template>`就是待替换的占位符。我们可以清晰地看出最开始只渲染了同步加载的应用主干，而`<Suspense>`里的组件还未就绪，渲染的是其`fallback`的内容。随后`<Hello />`组件就绪，于是React又向流中写入了待替换为的`<Hello />`组件渲染结果以及替换代码：

```html
<div>
    <button>about</button>
    <!--$?-->
    <template id="B:0"></template>
    <div>Loading...</div>
    <!--/$-->
</div>

<div hidden id="S:0">
    <div>hello
    <!-- -->
    react and vite!
    <!-- -->
    </div>
</div>
<script>
    function $RC(a, b) { /* 用于替换模板的辅助函数 */ }
    ;$RC("B:0", "S:0")
</script>
```

替换后的结果如下：

```js
<div>
    <button>about</button>
    <!--$-->
    <div>hello
    <!-- -->
    react and vite!
    <!-- -->
    </div>
    <!--/$-->
</div>
```

### 增量收集与注入

还有什么问题吗？仔细想一想，我们的应用现在是渐进式渲染的，而且即使是懒加载的组件，渲染结果也会写入同一个流中。故全流程中需要被收集的style和state是动态变化的，不再像以前那样整体渲染好之后一次性收集并注入流就可以的了，因此现在每次增量渲染之间都需要收集样式乃至状态的差异并写入流中：

> 此处伪代码来自<https://github.com/reactwg/react-18/discussions/110>。

```js
const createStream = (res: Response) => new Writable({
  write(chunk, encoding, callback) {

  let rules = generateNewStyleRulesSinceLastCall();
  if (rules) {
    // Write it before the HTML to ensure that the CSS is available and
    // blocks display before the HTML that shows it.
    res.write('<style>' + rules + '</style>');
  }

    res.write(chunk, encoding, callback);
  },
});
```

实际上，新的`renderToPipableStream`API带来的问题远不止如此，一直打开的HTML流改变了我们习以为常的关键渲染路径。这里列举有当前遇到的几个问题：

1.  由于现在整个流的生命周期是不确定的，只有React知道和控制什么时候流会终止，我们希望像以前那样在HTML文档流结束之前嵌入一些内容就很困难了。甚至在官方的[Library Upgrade Guide](https://github.com/reactwg/react-18/discussions/114)中也只有修改HTML首部的教程。对vite这样的构建工具来说就更不友好了。在模板项目中，我选择的是提前写入文档尾部内容，因此整个流的内容大致是`<html><head><body><sync ssr content></body></html><async ssr content>`，目前还没有找到更好的解决方案；

    ```js
    const stream = ReactDOMServer.renderToPipeableStream(
        <App />,
        {
          onShellReady() {
            res.statusCode = didError ? 500 : 200;
            res.setHeader('Content-type', 'text/html');

            wrappedRes.write(headPart.trim());
            stream.pipe(wrappedRes);
            // FIXME: <html><head><body><sync ssr content></body></html><async ssr content>
            wrappedRes.write(tailPart.trim());
          },
          onShellError(error) {
            console.error(error);
            res.statusCode = 500;
            res.send(ctx.template); // fallback to csr
          },
          onError(error) {
            didError = true;
            console.error(error);
          },
        },
    );
    ```

2.  和1的原因一致，由于无法修改HTML文档流的尾部，我们原本嵌入到文档末尾的`<script>`便有点不知道该放到哪里了，React似乎也考虑到了这个问题，于是他们在`renderToPipableStream`的选项中添加了一个`bootstapScripts`属性，然而这个选项对常常要使用工具构建并且带有版本hash（因为要考虑生产回滚和客户端缓存）的应用来说实在显得幼稚……看起来React团队的目标是“to make it so that you don't have to manually inject script tags into the stream and that React just does all of that out of the box.”

3.  以页面为单元进行数据预取的概念已经名存实亡了。现在的数据获取逻辑分散在各个渲染单元内部独立进行，我们之前的`prefetch`架构需要做出调整~直接废稿~，不过这倒不是坏事。

4.  问题1的Library Upgrade Guide中还有一些关于`defer`、`async`和`preload`的内容，这里不做赘述了。

### Server Component

一个同样利用了流模式、现在还处在alpha阶段但值得期待的渲染机制，因为我还没有入坑，只能贴两个链接了。React团队值得钦佩的地方就在于他们总能提出一些让你一拍大腿就应该这样办的东西，以前的hooks是这样，现在的Server Component也是这样：

*   <https://github.com/josephsavona/rfcs/blob/server-components/text/0000-server-components.md>
*   <https://www.plasmic.app/blog/how-react-server-components-work>

## 踩过的坑

记录一些实践中踩的坑。

### 渲染结果不匹配

指前后端渲染结果不一致，客户端水化失败。大概是最常见的问题了。

1.  空白字符导致的mismatch

    这个问题遇到过两次，一次是由于IDE自动对模板HTML进行了格式化，在`<div id="root"><!--app-html--></div>`中的占位符注释前面进行了换行，而vue在水化的时候会拿`container.firstChild`进行比对，于是拿到的vnode是空白字符，比对失败；另一次则是换行符`\r\n`差异导致的问题，排查了半天。一般来说多多`trim`总没错。

2.  `HtmlWebpackPlugin`自动清理模板文件注释导致的mismatch

    因为我喜欢用HTML注释作为替换占位符，而`HtmlWebpackPlugin`在构建的时候默认会清理掉注释，故后端没有做替换注入，造成不匹配。这个只要配置下`removeComments: false`就行了。

3.  `vue-loader`对scoped css处理导致的mismatch

    如果查看`vue-loader`源码的话，会发现它在开发和生产环境下给组件`scoped css`计算unique id的方式不同，于是某一次因为我的配置失误，两端构建时的环境变量不同，导致`data-v-[id]`不同，匹配失败。这也提醒了我们，如果有类似的生成unique id的行为，要特别注意保持在双端渲染过程中的一致性。

4.  `publicPath`导致的路由匹配问题

    前文我们提到了会利用`router.currentRoute.value.matched`之类的API与`req.url`进行匹配从而获取当前要渲染的组件实例，但如果我们应用部署的`publicPath`不是`/`而是其他的路径的话，就需要注意拿来匹配的应该是`req.url`还是`req.originalUrl`，否则可能拿不到正确的组件。

### 环境变量的注入

这个问题和SSR关联不大，不过我们经常会配置诸如`process.env.SSR`这样的环境变量，因此要特别注意这些环境变量起作用的时机，是在构建时还是运行时，避免混淆。

### 开发阶段样式闪烁

在开发阶段我们可能会采用`style-loader`这类东西来处理css模块，这时候生成的代码完全是js文件，样式内嵌在其中，于是页面要等到js加载执行后才有完整样式，造成闪烁。这个问题在生产构建换用`MiniCssExtractPlugin.loader`提取出css样式之后就自行解决了。

## 其他

1.  构建工具选型一定要做足够的功课，自行封装脚手架也注意做好隔离与防腐。🦊痛，太痛了！

2.  设计时考虑缓存，在预取数据不变的情况下可以绕过渲染，既能减轻服务端计算压力又能提高性能。

3.  在服务端代码前端有份的情况下，实现根据用户UA按需加载polyfill、推送特定assets之类的需求也方便很多。
