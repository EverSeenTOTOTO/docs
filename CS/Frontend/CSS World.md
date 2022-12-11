# 《CSS世界》阅读笔记

一句话读后感：愿天堂没有IE。仔细一想不对，IE已经在天堂等着我们了😃。

## 布局

+ `width: auto`隐含的四种宽度模式：

    1. 充分利用可用空间：`fill-available`，即100%于父级容器，如`<div>`、`<p>`的默认表现；
    2. 收缩与包裹：`shrink-to-fit`，元素尺寸由内部元素决定，但总是小于“包含块”容器的尺寸（除非容器尺寸小于元素的“首选最小宽度”），例如浮动、绝对定位、`inline-block`或`table`元素。`<button>`默认就是`inline-block`的，因此如果文字足够多，则会在容器的宽度处自动换行。
    3. 收缩到最小：不怎么常见；
    4. 超出容器限制：`max-content`，通常由于连续单词与数字的无法换行导致超出父级容器宽度，例如被设置了`white-space: nowrap`的内联元素。

+ `display: block`可以被看作是`display: block-block`。

+ 使用外部尺寸的块级元素应避免设置宽度，否则会造成流动性的丢失，不能自适应容器大小。必要时遵循宽度分离原则，在上层容器设置宽度限制，下层容器自适应宽度。

    > 联想到有关浏览器渲染的一句名台词：My width depends on my parent. My height depends on my children. …so calculate width top-down, then calculate height bottom-up.

    > 块元素用于排版布局，内联元素用于图文展示。

+ `box-sizing`就是用来改变`width/height`所作用的盒子的。

+ `<textarea>`属于替换元素，替换元素的宽度不受`display`水平影响，因此下面的写法无法让`<textarea>`的尺寸100%自适应父容器：

    ```css
    textarea {
      display: block;
    }
    ```

    因此这时候只能使用`width: 100%`，但往往为了美观会给`<textarea>`设置`padding`以防止光标贴着边框，两者共存就会带来宽度计算上的麻烦，最终的解决之道是`box-sizing: border-box`：

    ```css
    textarea {
      width: 100%;
      box-sizing: border-box;
    }
    ```

    > 替换元素即可以通过修改某个属性值替换呈现内容的元素，`content` 属性生成的内容都是替换元素。

+ 绝对定位的宽高百分比计算是相对于 padding box 的，也就是说会把容器的 `padding` 大小值计算在内，但是，非绝对定位元素则是相对于 content box 计算的。

+ 为了避免图片在移动端展示过大影响体验，常常会有下面的 `max-width` 限制：

    ```css
    img {
     max-width: 100%;
     height: auto!important;
    }
    ```
 
    `height: auto` 是必需的，否则，如果原始图片有设定 `height`，`max-width` 生效的时候， 图片就会被水平压缩。强制 `height` 为 `auto` 可以确保宽度不超出的同时使图片保持原来的比 例。但这样也会有体验上的问题，那就是在加载时图片占据高度会从 0 变成计算高度，图文会有明显的瀑布式下落。

## 排版

+ 内联元素没有可视宽度和可视高度的说法（`clientHeight` 和 `clientWidth` 永远是 0），垂直方向的行为表现完全受 `line-height` 和 `vertical-align` 的影响，视觉上并没有改变和上一行下一行内容的间距，因此，给我们的感觉就会是垂直 `padding` 没有起作用。例如书中的例子，虽然不影响上下元素的布局，但在垂直方向上出现了层叠，可以利用这个特性来增加按钮的点击区域大小，还可以修复`sticky`标题导致其他元素滚动后被遮盖的问题。

    实际上，对于非替换元素的内联元素，不仅 `padding` 不会加入行盒高度的计算，`margin` 和 `border` 也都是如此，都是不计算高度，但实际上在内联盒周围发生了渲染。

+ `padding` 百分比值无论是水平方向还是垂直方向均是相对于**宽度**计算的。

+ `<button>`的`padding`行为存在浏览器兼容性问题，必要时可以通过`<a>`或`<label>`进行模拟。

+ 只能使用子元素的 `margin-bottom` 来实现滚动容器的底部留白，`padding-bottom`存在兼容性问题。

+ `margin`合并只针对**块级元素**，只发生在垂直方向。常见以下三种：

    1. 相邻兄弟元素；
    2. 父级元素与第一个/最后一个子元素；
    3. 空块级元素的上下`margin`合并。

    第三点告诉我们，对于常遇到的列表排版，可以放心地在上下两个方向上设置`margin`，这样可以避免因列表的元素被移除或调换位置而改变布局：

    ```css
    .list {
        margin-top: 15px;
        margin-bottom: 15px; 
    }
    ```

+ 对于非替换元素的纯内联元素，其可视高度完全由 `line-height` 决定。`line-height`对于块级元素不起作用，我们平时改变 `line-height`， 块级元素的高度跟着变化实际上是通过改变块级元素里面内联级别元素占据的高度实现的。

## 流之外

+ `position`设置为`absolute`或`fixed`的元素和`float`元素的行为有相似之处，都具有“块状化”（指`display`变成`block`或`table`）、“包裹性”（自适应子元素大小）、“破坏性”（独立于文档流）的特点。

+ 包含块的计算规则：

    1. 根元素（很多场景下可以看成是`<html>`）被称为“初始包含块”，其尺寸等同于浏览器可视窗口的大小；
    2. 对于其他元素，如果该元素的 `position` 是 `relative` 或者 `static`，则“包含块”由其最近的块容器祖先盒的 content box 边界形成；
    3. 如果元素 `position: fixed`，则“包含块”是“初始包含块”；
    4. 如果元素 `position: absolute`，则“包含块”由最近的 `position` 不为 `static` 的祖先元素建立，具体方式如下：
        + 如果该祖先元素是纯 `inline` 元素：
            - 假设给内联元素的前后各生成一个宽度为 0 的内联盒子（inline box），则这两个内联盒子的 padding box 外面的包围盒就是内联元素的“包含块”；
            - 如果该内联元素被跨行分割了，那么“包含块”是未定义的，也就是 CSS2.1 规范并没有明确定义，浏览器自行发挥。
        + 否则，“包含块”由该祖先的 padding box 边界形成。
    5. 如果没有符合条件的祖先元素，则“包含块”是“初始包含块”。

+ 添加 `white-space: nowrap`，可以让宽度表现从“包裹性”变成“最大可用宽度”。

+ `overflow`元素想要裁剪`absolute`元素，要么它自己是`absolute`元素的定位元素，要么它有子元素是定位元素。想要裁剪`fixed`元素，可以借助`clip`。

+ 蒙层弹窗禁止滚动：蒙层经常使用`position: fixed`元素实现，这时下面页面的滚动条还在，于是我们可能想到设置`overflow: hidden`来禁止页面滚动，但这又会导致滚动条消失导致页面抖动，一种方法是利用同等宽度的 border 代替消失的滚动条，在移动端还可以直接禁用`touchmove`事件。

## 层叠上下文

+ 一般而言，装饰属性、布局属性和内容属性的层叠顺序依次增加。

+ `z-index` 一旦变成数值，哪怕是 0，就会创建一个层叠上下文。

+ CSS3会创建层叠上下文的一些属性：

    1. 元素为 flex 布局元素（父元素 ` display: flex|inline-flex`），同时 `z-index` 值不是 `auto`；
    2. 元素的 `opacity` 值不是 1；
    3. 元素的 `transform` 值不是 `none`；
    4. 元素 `mix-blend-mode` 值不是 `normal`；
    5. 元素的 `filter` 值不是 `none`；
    6. 元素的 `isolation` 值是 `isolate`；
    7. 元素的 `will-change` 属性值为上面 2～6 的任意一个（如 `will-change:opacity`、 `will-chang:transform` 等）；
    8. 元素的`-webkit-overflow-scrolling` 设为 `touch`。

    `transform: scale(1)`不影响视觉表现，比较好用。

+ `z-index` 负值元素的层级是在层叠上下文元素上面、block 元素的下面，也就是 `z-index` 虽然名为负数层级，但依然无法突破当前层叠上下文所包裹的小世界。可以说，`z-index` 负值渲染的过程就是一个寻找第一个层叠上下文元素的过程，然后层叠顺序止步于这个层叠上下文元素。

## 杂项

+ 单行文字溢出省略效果。虽然效果的核心是 `textoverflow: ellipsis`，效果实现必需的 3 个声明如下：

    ```css
    .ell {
         text-overflow: ellipsis;
         white-space: nowrap;
         overflow: hidden;
    }
    ```

    这 3 个声明缺一不可。目前，对`-webkit-`私有前缀支持良好的浏览器还可以实现多行文字打点效果，但是却无须依赖 `overflow: hidden`。比方说，最多显示 2 行内容，再多就打点的核心 CSS 代码如下：

    ```css
    .ell-rows-2 {
         display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
    } 
    ```

+ `all: unset`可以让任意一个元素样式表现和`<span>`元素一样。`all: revert`可以让元素恢复成浏览器默认的样式。

+ 黏性定位和相对定位相似的地方：

    1. 元素发生偏移的时候，元素的原始位置是保留的。
    2. 创建了新的绝对定位包含块，也就是黏性定位元素里面如果有绝对定位的子元素，那这个子元素设置`left`属性、`top`属性、`right`属性和`bottom`属性时的偏移计算是相对于当前黏性定位元素的。
    3. 支持设置`z-index`属性值来改变元素的层叠顺序。

  不同的地方：

    1. 偏移计算元素不一样。相对定位偏移计算的容器是父元素，而黏性定位偏移计算的元素是层级最近的可滚动元素（`overflow`属性值不是`visible`的元素）。如果一个可滚动元素都没有，则相对浏览器视窗进行位置偏移。
    2. 偏移定位计算规则不一样。黏性定位的计算规则比较复杂，涉及多个黏性定位专有的概念。
    3. 重叠表现不一样。相对定位元素彼此独立，重叠的时候表现为堆叠；但是黏性定位元素在特定布局结构下，元素重叠的时候并不是表现为堆叠，而是会有A黏性定位元素推开B黏性定位元素的视觉表现。

+ `background-clip`配合透明`border`也可以扩大点击区域。

+ 父、子元素同时设置半透明时，半透明效果是叠加的（乘法）。

+ 设置了`transition`过渡效果的元素应用`display: none`时，过渡效果会被瞬间中断，导致`transitionend`事件不会被触发
