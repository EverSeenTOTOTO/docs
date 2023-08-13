# 浏览器渲染引擎的实现

最近看了一些关于浏览器实现的知识，资料主要来源于火狐一个实验性项目servo的[Wiki](https://github.com/servo/servo/wiki)。另有这几篇文章推荐：

*   <http://taligarsiel.com/Projects/howbrowserswork1.htm>

*   <https://wpewebkit.org/blog/03-wpe-graphics-architecture.html>

*   <https://www.cmyr.net/blog/gui-framework-ingredients.html#painting>

## DOM Tree

解析HTML标签构建的树，树的结构和HTML标记基本一致。

HTML由于其容错设计实际上超出了上下文无关文法（CFG）的范畴，用常规的解析上下文无关文法的技术不足以处理之。词法分析和构建树的算法直接定义在了[HTML5标准](http://www.w3.org/TR/html5/syntax.html#html-parser)中。

浏览器在遇到不规范的HTML标记时，可能将其进行修复，例如这个例子：

```html
<table>
	<table>
		<tr><td>inner table</td></tr>
         </table>
	<tr><td>outer table</td></tr>
</table>
```

在Chrome中修复为：

<table>
	<table>
		<tr><td>inner table</td></tr>
         </table>
	<tr><td>outer table</td></tr>
</table>

```html
<table></table>
<table>
    <tbody><tr><td>inner table</td></tr></tbody>
</table>
outer table
```

此外解析时通常不会关闭`<html>`标记和`<body>`标记，因为经常有网站在HTML文档真正结束之前就关闭它们。我们应该尽可能书写合规的HTML文档。

## Render Tree

给DOM树附加样式信息，实质是一些带有**可视**属性的矩形集合，组织成树的结构。一个典型的树结点可能定义如下：

```cpp
class RenderObject{
	virtual void layout();
	virtual void paint(PaintInfo);
	virtual void rect repaintRect();
	Node* node;  //the DOM node
	RenderStyle* style;  // the computed style
	RenderLayer* containgLayer; //the containing z-index layer
}
```

矩形并不能表示所有DOM元素，例如`<select>`、宽度不够导致的换行、在内联元素中混合出现的块级元素和内联元素，这些情况会创建额外的渲染对象。

### 对`<style>`和`<script>`标签的处理

CSS和JS都是正经CFG，可以用能处理CFG的Parser生成器生成的Parser去解析它们。

对`<script>`代码块的处理是同步的。遇到一个`<script>`标记后，对HTML文档的解析将被暂停，直到`<script>`代表的资源下载和解析执行完成才会继续，这是为了防止脚本中对DOM的操作破坏HTML解析的结果，因此`<script>`脚本引用通常放在`body`尾部。可以用`defer`或者`async`对一些`<script>`进行标记，以便让它们不会阻塞HTML文档的解析。

一个优化手段是在处理`<script>`标签时对HTML文档的剩余部分进行投机解析（Speculative parsing），然后找出还有哪些资源需要额外下载从而并行地处理它们。投机解析器并不操作DOM，只处理对外部资源的引用。

理论上层叠样式表并不直接修改DOM结构，应该可以在解析HTML的同时去处理它们，实际上由于`<script>`中有访问DOM样式的需求，而`<script>`是同步的，如果在执行脚本的时候样式还没有准备好将导致错误结果。Webkit采用的做法是当一个`<script>`试图操作特定样式属性时，阻塞这块代码直到层叠样式表处理完毕。所以通常`<style>`放在`body`前面，和HTML并行解析。

:::info
想到两个点，一是投机解析HTML并不操作DOM，但保留结果，在确定了`<script>`不会改变DOM时可以直接复用之；另一点是看起来`<script>`也可以采用相同的思路，和HTML一起解析，要操作DOM时阻塞其执行。
:::

### Render Tree和DOM Tree

Render Tree和DOM Tree对应但不完全相等，不可见元素等不会被插入到Render Tree上，例如`<head>`元素、`display: none`，但是`visibility: hidden`仍在树上。

对`<html>`和`<body>`标记的处理将构造Render Tree的根结点，对应CSS标准称之为“包含块”的东西，最上面的块将包含其他的块。

### 样式计算

很显然，构建Render Tree需要计算出每一个结点的可视属性，这一步骤通过对每一个元素计算样式属性完成。

样式有很多来源，除了`<style>`之外，HTML也支持内联样式，一些HTML标记还有像`width`、`height`这样的属性，后者实际上会被转换为CSS样式属性。

样式计算的难点：

1.  出于内存的考虑，不可能保存每个元素的所有样式属性数据；
2.  CSS选择器的匹配性能；
3.  按照正确的级联顺序应用CSS规则也很复杂。

Firefox的Rule Tree和Style Context Tree：

Rule Tree储存CSS规则，在避免重复计算的同时共享上层数据。Rule Tree中的层级越深，优先级越高。整个计算过程是惰性的，只有需要计算结点样式的时候才添加到树中。Style Context按照领域划分为不同的结构，例如有的负责`color`于是只有一个属性，有的负责`margin`因此有四个属性。一个结构体中的属性要么是继承的，要么是非继承的（有定义，或者`reset`使用默认值）。

根据Rule Tree构建Style Context Tree，~结合文章中的例子看都有点云里雾里~：

When computing the style context for a certain element, we first compute a path in the rule tree or use an existing one. We then begin to apply the rules in the path to fill the structs in our new style context. We start at the bottom node of the path - the one with the highest precedence (usually the most specific selector) and traverse the tree up until our struct is full. If there is no specification for the struct in that rule node, then we can greatly optimize - we go up the tree until we find a node that specifies it fully and simply point to it - that's the best optimization - the entire struct is shared. This saves computation of end values and memory.
If we find partial definitions we go up the tree until the struct is filled.

If we didn't find any definitions for our struct, then in case the struct is an "inherited" type - we point to the struct of our parent in the context tree, in this case we also succeeded in sharing structs. If its a reset struct then default values will be used.

If the most specific node does add values then we need to do some extra calculations for transforming it to actual values. We then cache the result in the tree node so it can be used by children.

In case an element has a sibling or a brother that points to the same tree node then the entire style context can be shared between them.

Webkit的做法：按照规则优先级遍历四遍，后来居上。

早在CSS规则解析之后，规则就按照选择器分类（id，class，tag name...）存放到若干个hash表中，在规则匹配的阶段可以直接取用。

## Layout

也叫做Reflow，给Render Tree的结点计算在屏幕上的合适大小和位置，我们常说的CSS流模型便是在这里起作用。通常是递归下降的过程，从左到右，从上到下，也有例外，例如`<table>`可能需要扫描不止一遍。

坐标系统的原点在左上，尺寸即视窗大小。

采用“dirty bit”以避免小改动也要重做整个布局。

布局可能是全局的，当：

1.  全局样式属性变化，例如`font-size`；

2.  窗口大小变化。

也可以是局部的，只有带“dirty bit”的RenderObject会被处理，称之为“增量式布局”。这种布局是异步的。

### 布局过程

1.  Parent renderer determines its own width.

2.  Parent goes over children and:

    1.  Place the child renderer (sets its x and y).
    2.  Calls child layout if needed(they are dirty or we are in a global layout or some other reason) - this calculates the child's height.

3.  Parent uses children accumulative heights and the heights of the margins and paddings to set it own height - this will be used by the parent renderer's parent.

4.  Sets its dirty bit to false.

宽度计算时遇到换行：传播给上级，上级会新建RenderObject。

## Composition

合成不是浏览器渲染引擎特有的名词，将在同一个视口渲染的不同内容（可能有交疊）合并为一张图像，典型需求如透明度、CSS动画等，含义和合并图层类似。

### 对层叠上下文的处理

Webkit的RenderLayer树：看成是Render Tree的合并，处于同一层级的Render Object合并到一个RenderLayer结点中，RenderLayer可以分离内容有变化的结点和不变的结点，减少工作量，要做的只是合成。合成工作可以丢给GPU。

为了避免给每一个RenderLayer配备一个buffer造成浪费，又出现了GraphicsLayers树，一个RenderLayer只有在确切需要独立buffer的时候才往自己的buffer上绘制，其它时候都绘制到上层结点的buffer。

## Painting

将计算好的像素信息交给底层渲染库渲染，常见的渲染库有Skia、Cairo、Direct2D、CoreGraphics、Metal、DirectX、Vulkan等。

和Layout一样，Painting也可以分为全局的和增量式的。CSS标准中定义了Painting的顺序。

### 动态改变造成的影响

即什么时候回流什么时候重绘：

1.  Changes to an elements color will cause only repaint of the element.

2.  Changes to the element position will cause layout and repaint of the element, its children and possibly siblings.

3.  Adding a DOM node will cause layout and repaint of the node.

4.  Major changes, like increasing font size of the "html" element, will cause invalidation of caches, relayout and repaint of the entire tree.

## 主流浏览器信息

| 浏览器 | 渲染引擎 | JS运行时 |
| ---- | ---- | ---- |
| Chromium, Chrome, Microsoft Edge | Blink | V8 |
| Gecko, Servo, Firefox | WebRender | SpiderMonkey |
| Webkit, Safari | Webkit | JavascriptCore |
| Android WebView | | |
| WKWebView | | |
| Microsoft Edge Webview2 | | |
