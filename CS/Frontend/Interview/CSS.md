# CSS

## 选择器优先级

内容基本来自<https://developer.mozilla.org/zh-CN/docs/Learn/CSS/Building_blocks/Cascade_and_inheritance>，[这里](https://specifishity.com/)有个有趣的图示。

以下选择器优先级是递增的：

1. 元素选择器，例如`h1`，伪元素`::before`；
2. 类选择器，例如`.class`，属性选择器`[type="radio"]`，伪类`:hover`；
3. ID选择器，例如`#id`；
4. 内联样式`style="color: red"`总会覆盖外部样式表的任何样式，因此可以看作是具有最高的优先级；
5. `!important`例外规则将覆盖任何其他声明，冲突时按照优先级进行采纳。

通用选择器`*`、组合运算符`+`、`>`等不会影响优先级，`:where()`简写也不会影响选择器优先级。否定选择器`:not()`和匹配选择器`:is()`本身不影响，但它们的参数中，对优先级算法有贡献的参数优先级的最大值将作为该伪类选择器的优先级。

对于复合选择器，其优先级由三个不同的值（或分量）组成，这三个值来自ID、类（属性、伪类）、（伪）元素选择器：

| 选择器 | ID | 类 | 元素 | 优先级 |
| ---- | ---- | ---- | ---- | ---- |
| `h1 + p::first-letter` | 0 | 0 | 3 | 0-0-3 |
| `li > a[href*="en-US"] > .class` | 0 | 2 | 2 | 0-2-2 |
| `button:not(#id, .class)` | 1 | 0 | 1 | 1-0-1 |

比较时，按照从左到右，同级别数字先比较，相等才到下一个级别，如果全部相等，则按照出现在文档中的顺序，越靠后优先级越高。高优先级的样式并不是完全替代低优先级的样式，而是会覆盖冲突的属性。

## 盒模型与布局流

每个CSS元素都被一个个“盒子”所包裹，这些盒子在页面流中占据重要地位。有两种盒子：块级盒子（block box）和内联盒子（inline box）。

块级盒子：

+ 在内联方向上拓展，并占据父容器在该方向的所有可用空间，直观理解就是默认占据`100%`宽度；
+ 每个盒子都会换行；
+ `padding`、`margin`、`border`会将周边盒子“推开”。

在没有特殊指定的情况下，典型的块级元素有`<p>`、`<div>`等。

下面Vue代码片段中，两个盒子各自占满一行（在内联方向上拓展，每个盒子都换行），且之间的空隙是`10px`（`margin`推开其他元素，且发生了外边距折叠）。

```html
<template>
  <div>
    first
  </div>
  <div>
    second
  </div>
</template>
<style lang="scss" scoped>
div {
  margin: 10px;
}
</style>
```

内联盒子：

+ 盒子不会换行；
+ `width`和`height`属性不起作用；
+ 垂直方向的`padding`、`margin`及`border`会叠加而不是将其他内联盒子推开，我理解应该说的是内联盒子竖直方向上设置`padding`、`margin`、`border`等不会顶起行高；
+ 水平方向的`padding`、`margin`及`border`会将其他内联盒子推开。

在没有特殊指定的情况下，典型的内联元素有`<a>`、`<span>`等。

下面Vue代码片段中，给`<span>`设置`width`不会起作用，同时每个`<span>`之间的水平缝隙是`20px`（水平方向的`margin`会推开其他内联盒子，但无外边距重叠）。

```html
<template>
  <span>first</span>
  <span>second</span>
</template>
<style lang="scss" scoped>
span {
  margin: 10px;
}

span:first-child {
  width: 400px; /* not work! */
}
</style>
```

完整的盒子模型主要用于块级盒子，内联盒子只用到了模型中的一部分内容。一个块级盒子从内到外分别是：content、padding、border、margin。默认情况下给盒子设置`width`和`height`设置的是content box，计算整个盒子的大小时还会加上盒子的`padding`与`border`。可以通过设置`box-sizing`来控制这一行为，默认值是`content-box`，可设置为`border-box`不计入padding box。

下面的例子中第二个`div`设置了`border-box`，因此padding box限制在宽高所定义的矩形内：

```html
<template>
  <div>
    first
  </div>
  <div>
    second
  </div>
</template>
<style lang="scss" scoped>
div {
  width: 200px;
  height: 100px;
  padding: 50px;
  border: 4px solid black;
  margin: 50px;
  background-color: grey;
}

div:last-child {
  box-sizing: border-box;
}
</style>
```

### 外边距重叠

外边距重叠指的是块的上外边距和下外边距有时合并（折叠）为单个边距，取其中较大值的现象，浮动元素和绝对定位元素不会产生外边距重叠行为。

1. 同一层相邻元素之间，前面已经给过例子；
2. 没有内容将父元素和后代元素分开，比较典型的例子是父元素和最后一个子元素的`margin-bottom`；
3. 空的块级元素，即该元素的上下`margin`直接贴合的时候。

### BFC和默认流

默认模式下：

1. 块级元素的内容宽度是父元素的100%，高度由内容高度确定；
2. 内联元素的宽高均与内容一致且无法修改。如果想控制内联元素的尺寸，需要设置`display: block`或`display: inline-block`等；
3. 在自上而下、水平书写的模式里，块级元素是垂直组织起来的。内联元素不会另起一行，只要在其父级块元素宽度内有足够的空间，就会放在同一行，空间不够才溢出换行。

BFC我看了很多博客，以及MDN文档，貌似都没有给出一个明确的定义。更像是对一种现象的陈述。BFC是一个类似于CSS沙盒的东西，一个BFC块就是一个按照默认布局流来布局元素的小单元。典型的会创建BFC的元素比如`<html>`，绝对定位元素等。

## `display`属性

只列举了常用的几个：

+ `block`：元素会生成块级盒子；
+ `inline`：元素会生成内联盒子；
+ `inline-block`：我理解为不会换行的“块级盒子”，可以设置`width`和`height`，设置`margin`会撑起行高。

## `position`属性

只列举了常用的几个：

+ `static`：默认值，处在正常的文档流中，这样的元素（及无`position`设置的元素）称为无定位元素；
+ `relative`：处在正常的文档流中，但可以通过`top`、`left`等设置相对于应有位置的偏移；
+ `absolute`：元素脱离正常的文档流，默认相对于其位置最近的祖先而定位。通过`top`、`left`等可以设置相对于包含元素边界的偏移，包含元素的判定方法如下：
    1. 如果所有的父元素都没有显式地定义`position`属性（都是默认值`static`），那么会将初始包含容器作为包含元素，简单理解就是在`<html>`元素外面，相对视口进行定位；
    2. 如果某个父元素设置了相对位置`positon: relative`，那么该元素会成为包含元素，如果多个父元素都设置了，则最近的祖先会成为包含元素。

    下面Vue代码片段中，`.container`容器内第二个`<div>`被设置为绝对定位元素，将脱离文档流并排布在祖先`.container`后面：

    ```html
    <template>
      <div>
        row
      </div>
      <div class="container">
        <div>
          row
        </div>
        <div>
          row
        </div>
      </div>
    </template>
    <style lang="scss" scoped>
    div {
      padding: 10px;
      border: 1px solid black;
      margin: 10px;
    }

    .container div:last-child {
      position: absolute;
    }
    </style>
    ```

    <img src="./position-absolute-default.webp" />

    但该元素的包含容器并不是`.container`容器，而是初始包含元素，因此如果我们设置`top: 0`的话，将被移动到顶端：

    ```diff
    .container div:last-child {
      position: absolute;
    +  top: 0;
    }
    ```

    <img src="./position-absolute-top0.webp" />

    如果我们给直接父元素设置`position: relative`，则包含元素变为`.container`元素，`top: 0`也是相对于它来说的：

    ```css
    .container {
      position: relative;
    }
    ```

    <img src="./position-absolute-relative.webp" />

+ `fixed`：默认相对于其位置最近的祖先而定位。通过top、left等可以设置相对于视口边界的偏移；
+ `sticky`

## `z-index`和层叠上下文

默认情况下，当没有元素包含`z-index`属性时，元素按照如下方式从z轴自下而上堆叠：

1. 根元素的背景和边界；
2. 普通流里面的块元素（`position`为默认值）按照HTML里面的出现顺序堆叠；
3. 定位元素按HTML中的出现顺序堆叠。

`z-index`只对设置了`position`的元素有效，`z-index`值从小到大依次接近观察者，默认为第0层。在同一层内，将按照上面的默认规则进行布局。

`z-index`能调整某些元素的渲染顺序，有时又不能，其根本原因是为这些元素设置`z-index`值将创建一个独立的层叠上下文。层叠上下文的概念和图层比较类似，具有以下特点：

1. 层叠上下文可以嵌套，在父层叠上下文中可以创建多个子级层叠上下文并形成层叠上下文的层级；
2. 每个层叠上下文是自包含的，当在父层叠上下文中发生层叠时，该层叠上下文会被看成一个整体进行层叠。

典型的会创建层叠上下文的元素有：

1. 文档根元素`<html>`；
2. `position`为`absolute`或`relative`，且`z-index`值不为`auto`的元素；
3. `position`为`fixed`或`sticky`的元素；
4. `flex`或`grid`容器的子元素，且`z-index`不为`auto`；
5. `opacity`小于1的元素；
6. `transform`、`filter`、`clip-path`等属性值不为`none`的元素。

下面Vue代码片段中，C排布在A和B的中间。一共存在有三个层叠上下文，A没有特别设定，处在`<html>`所创建的层叠上下文中，B和C是定位元素，且设置了不为`auto`的`z-index`值，故各自创建了一个层叠上下文，根据各自的`z-index`值在根层叠上下文中堆叠：

```html
<template>
  <div class="a">
    A
    <div class="b">
      B
    </div>
  </div>
  <div class="c">
    C
  </div>
</template>
<style lang="scss" scoped>
div {
  padding: 50px;
  border: 1px solid black;
  margin: 10px;
}

.a {
  background-color: #ffffaf;
}

.b {
  position: relative;
  z-index: 2;
  background-color: #5fffff;
}

.c {
  position: absolute;
  z-index: 1;
  top: 000200px;
  left: 100px;
  width: 200px;
  background-color: #ffbfff;
}
</style>
```

<img src="./z-index-C-B.webp" />

假如我们删掉`.b`的`position: relative`，则B退化为普通非定位元素，`z-index`值不起作用，和A处在同一个层叠上下文中，而C作为定位元素处在更高的层叠上下文中，故C会移动至B的上面。

```diff
.b {
-  position: relative;
  z-index: 2;
  background-color: #5fffff;
}
```

<img src="./z-index-B-C.webp" />

假如我们给`.a`添加`position: relative`和不为`auto`的`z-index`，则A也会创建一个层叠上下文，并且由于B是A的子级，B所创建的层叠上下文是A所创建层叠上下文的子级，形成如下结构：

```
- Root
  - A
    - B
  - C
```

假如给A设置的`z-index`值为`-1`，即使B设置的`z-index`是`2`，由于其作为A整体的一部分与C进行堆叠，依然处在C的下方：

```diff
.a {
+  position: relative;
+  z-index: -1;
  background-color: #ffffaf;
}
```

