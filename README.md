# About

## 这是谁？

一个普通人，可以在[这里](https://github.com/EverSeenTOTOTO)找到我。热爱读书、写作、游戏与代码。对自己的十二字评价是“恋玩物，不学术，溺情色，难齐家”。出身贫寒，天资平庸，没有耀眼的经历，显赫的学历和出色的简历，却有着一个凡人所可能具有的种种缺陷特质。

荒废半生，懵懵懂懂随波逐流，直到二十五岁时才有大彻大悟之感。亡羊补牢，尤为未晚，如今正在为实现自己的理想而学习着。期待有一天能够获得个人（而非社会）意义上的成功，因为那时我将不必让自己的双脚站在这充满油污的地板上。

### 人生信条/编码哲学

1. 事物是普遍联系着的。

    与其说“隔行如隔山”，我更宁愿相信“他山之石，可以攻玉”。个人的学习方法也偏向“博观约取，厚积薄发”。优点是善于联想类比、归纳总结，缺点是不善于演绎推理，推陈出新。

2. 每个人都是一座孤岛。

    人与人是无法相互理解的，可以试着去理解别人，但不要因为别人无法理解你而生气。接受他人的不痛不痒的问候与异样眼神，时刻反思你是否太过关注自我了，试着从先贤的书中找到那一丝宁静。

3. 人们为了避免真正的思考会做任何事。

    用无止境的思考代替无止境的争吵，用无止境的探索代替无止境的怀疑。

4. 如无必要，勿增实体。

    警惕那些人为制造的复杂度（以及制造这些复杂度的人），我们的一生都在与熵增作对抗。在日常中，即使是写demo和草稿也要尽可能认真一点。

## 关于此博客

此博客（~严格来说不是一个博客~）使用[pen](https://github.com/EverSeenTOTOTO/pen-middleware)搭建。pen是一个简易的cli工具，可以实时编辑预览markdown文件。默认集成了katex、copy等功能。**近期更新了v5版本，你可以在[这里](/CS/Frontend/Pen.md)看到一些细节**。

### 基于GFM

输入：

```
* [ ] todo
* [x] done

| it | supports | GFM | table |
| - | :- | -: | :-: |
```


输出：

* [ ] todo
* [x] done

| it | supports | GFM | table |
| - | :- | -: | :-: |

### 使用highlight.js

```typescript
console.log("Things are widely connected.");
```

```diff
- const a = 2;
+ const a = 3;
```

### 支持katex

输入：

```latex
$H_2O$
$H^2$

$\sqrt{3x-1}+(1+x)^2$
```

输出：

$H_2O$
$H^2$

$\sqrt{3x-1}+(1+x)^2$

### 支持vuepress风格的container

输入：

```
:::warn
warn
:::
```

输出：

:::warn
warn
:::

当然还有error和info：

:::info
皖ICP备20013181号
:::
