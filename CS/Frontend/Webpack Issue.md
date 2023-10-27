# 记一次Webpack踩坑

一个有关External配置的BUG，综合性挺强，我花了整整一个下午才找到问题的根源。找出原因之后可以用如下简化的`main.js`文件及`webpack.config.js`复现问题：

*   main.js

    ```js
    import('./lazy')
    ```

*   webpack.config.js

    ```js
    module.exports = {
      mode: 'development',
      entry: './main.js',
      output: {
        chunkFilename: '[name].[contenthash:8].js'
      },
      externals: /lazy/,
    }
    ```

此时进行构建，将得到牛头不对马嘴的报错`Cannot convert undefined or null to object`：

```bash

❯ npx webpack
Version: webpack 4.46.0
Entrypoint main =
[./lazy] external "./lazy" 42 bytes {main} [built]
[./main.js] 17 bytes {main} [built]

ERROR in chunk main [entry]
Cannot convert undefined or null to object

ERROR in chunk main [entry]
main.js
Cannot convert undefined or null to object
```

如果将`main.js`中的导入改为同步导入，或者让`webpack.config.js`中`output.chunkFilename`配置不要使用`contenthash`占位符，就可以解决问题。错误的原因其实挺好理解，当试图给异步模块`lazy`的构建产物计算`contenthash`时，由于`lazy`恰好被标记为`externals`，压根没参与打包，就没有所谓的`contenthash`可言了，若同步加载通常不会生成额外chunk文件刚好跳过了这段逻辑。解决之道在于别让External模块成为chunk中的唯一模块，就算是也别计算`contenthash`。Webpack5貌似已经修复了这个问题。

真实情况当然要复杂很多，上面给出的`output.chunkFilename`其实是`@vue/cli@3`的默认配置，我们有一个项目模板基于`@vue/cli@3`，某业务开发团队同事使用该项目模板时遭遇此问题，提交Issue之后我感到非常奇怪，因为这个模板已经存在很久了一直蛮正常的，我自己现场克隆仓库也没复现问题。于是和该同事沟通确实能100%复现并给了个分支给我们，对方拉取模板之后作了一些变更，但只是写了些业务代码，也没有动过构建配置，看起来和其他使用该模板的应用别无二致。那就没什么办法了，先用`git bitsect`和“控制变量法”找到最早出问题的变更，比对更改，各种尝试大致推断出和某模块引入与否（其实是代码规模）有关，再根据报错信息尝试去找Webpack中出错的源头，然而`Cannot convert undefined or null to object`甚至不是Webpack源码的一部分，而是JS的一个常见报错，比如`Object.keys(undefined)`。这种情况下只有从Webpack的统计信息查起，以`webpack/lib/Stats.js`为起点通过打印日志一点点往上找，在`stats.toJson`函数适当位置添加`console.log(compilation.errors)`才算有了点眉目，原始的报错堆栈其实是这样：

```
ChunkRenderError: Cannot convert undefined or null to object
    at Compilation.createHash (/node_modules/webpack/lib/Compilation.js:1981:22)
    at /node_modules/webpack/lib/Compilation.js:1386:9
    at AsyncSeriesHook.eval [as callAsync] (eval at create (/node_modules/tapable/lib/HookCodeFactory.js:33:10), <anonymous>:6:1)
    at AsyncSeriesHook.lazyCompileHook (/node_modules/tapable/lib/Hook.js:154:20)
    at Compilation.seal (/node_modules/webpack/lib/Compilation.js:1342:27)
    at /node_modules/webpack/lib/Compiler.js:675:18
    at /node_modules/webpack/lib/Compilation.js:1261:4
    at AsyncSeriesHook.eval [as callAsync] (eval at create (/node_modules/tapable/lib/HookCodeFactory.js:33:10), <anonymous>:15:1)
    at AsyncSeriesHook.lazyCompileHook (/node_modules/tapable/lib/Hook.js:154:20)
    at Compilation.finish (/node_modules/webpack/lib/Compilation.js:1253:28)
```

从`Compilation.createHash`开始将添加打印日志和盲猜出错可能并修改配置验证结合起来，又过去很长时间，中途一度自闭到想放弃，应该说最终能找出问题本质有很大的运气成分，也多亏Webpack源码没有压缩混淆。Issue上我给出的复盘如下：

1.  我们在`@vue/cli`配置的基础上，对Webpack的`splitChunks`配置及`externals`配置做了进一步修改，一些模块会被打包到同一个chunk里面去以减少网络请求数，还有些模块被设置为`externals`由App原生缓存预拉取；
2.  该项目有两个异步模块A和B刚好被归类到同一个`cacheGroup`内，不过模块A被标记为`externals`，所以产物chunk里面只有模块B，`contenthash`也是根据B计算的；
3.  最近一次变更模块B新增了很多内容，超出了该`cacheGroup`的文件大小要求，现在该`cacheGroup`只有模块A，而模块A又是个`externals`依赖，于是寄了；
4.  问题难以定位一来是因为该报错会打断Webpack构建，没有构建产物可以分析比对，而业务开发团队的行为一切正常；另外就是那个让人摸不着头脑的报错信息，Webpack对出错信息的处理掩盖了最初的错误堆栈，进一步增加了排查难度……
5.  为了减少影响面，同时也观察到他们这个场景其实有很多巧合，我给出的修复方案是在该项目内对`splitChunks.cacheGroups`配置稍作修改，覆盖模板项目的默认配置，后面模板项目迭代的时候再将相应配置调整集成进去。
