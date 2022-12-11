# 《Software Design for Flexibility -- How to Avoid Programming Yourself into a Corner》

听说是《SICP》的精神续作，重点是出版于2021年，很新。半年前就说想看，今天终于开始了。

> 唯一要吐嘈的是作者使用的是我不太熟悉的MIT Scheme，而且似乎Lisp编写者的风格一直是连字符标识符，这样大段的代码看起来很费劲。在IDE里面有缩进辅助线还好一点，在书里面就很伤眼睛了。

## Foreword

1. Don't just use functions; use _generic_ functions.
2. Keep functions small.
3. Often the best thing for a function to return is another function.
4. Be prepared to treat data as code, perhaps even to the extreme of creating a new embedded programming language within your application if necessary.
5. Be prepared to replace a data structure with a more general data structure that subsumes the original and extends its capabilities.
6. Use automatic constraint propagation to avoid a premature commitment to which data items are inputs and which are outputs.

## Preface

+ It is hard to build systems that have acceptable behavior over a
larger class of situations than was anticipated by their designers.
**The best systems are evolvable**: they can be adapted to new
situations with only minor modification. 

+ **Flexibility is as important an issue as efficiency and correctness**.

## Flexibility in Nature and Design

这一章介绍了自然界可以给我们软件设计上的一些启示，例如宽进严出、模块化（组件化）、分层架构、泛化、专用化、冗余、退化（degeneracy）、Test and Fail模式等。其中冗余的讨论让人想到了RAID，干细胞与计算机的对比也很有启发性，而退化这一节对氨基酸编码的讨论则让人联想到汉明码……Test and Fail是我一直采纳的学习方式，遇到搞不懂的就控制变量、写demo多折腾折腾，旁敲侧击总能获得一点信息。看到满屏的红色报错不会心慌慌火急火燎就是了。

本章我最深以为然的是对于灵活性、效率和安全性的讨论，我们经常局限于眼前的复杂度，在没有建立其对软件系统的全面认识时就过早优化，从而忽视了项目长期迭代维护的代价。我们总是对软件工程报有天真的假设，例如团队是稳定的、网络是可靠的、文档是完善的且总是可用的等等等等。这又让我想起那个著名的“如果项目Leader被巴士创死”的段子。

+ An implementation should be conservative in its sending behavior, and liberal in its receiving behavior.

+ The principal cost of software is the time spent by
programmers over the lifetime of the product, including
maintenance and adaptations that are needed for changing
requirements.

+ **The real cost of a system is the time spent by programmers—
in designing, understanding, maintaining, modifying, and debugging
the system**. A system that is easily adapted and maintained eliminates
one of the largest costs: teaching new programmers how the
existing system works, in all its **gory detail**, so that they know where
to reach in and modify the code.

    > “gory detail”乐死我了。

## Domain-Specific Languages

这一章首先通过正则表达式生成和量纲转换的例子介绍了组合器（combinator），封装器（wapper）的概念。组合器的抽象我们并不陌生，在很多语言的工具库中都可以看到诸如`compose`、`flattern`、`filter`等函数组合器的身影，而封装讲得是逻辑抽象，能够理解适配器的概念就不难理解文中量纲的例子。随后给出了DSL的一些说明和一个象棋游戏的例子。在第一套代码中，模型抽象和控制逻辑还存在耦合，因此值得改进；改进的模型中将模型与逻辑进一步分离，同时将棋子的移动规则提炼为各种控制原语的组合、封装，这里我学到的点是：DSL并非一定要是具有明确语法语义的某种语言，在提炼领域模型时就体现出了业务逻辑的一些基本、可组合的元素（原语，或者其他的一些常常出现在“meta-”后面的词），我们可以使用这些元素和组合器等工具形成更复杂的逻辑，同时保持了拓展性：

The domain model provides a set of
primitives that are combined to make the rules, giving us a language
for expressing the rules. The application of the rules is sequenced by
the control-structure executive. This combination forms the essence
of a domain-specific language for expressing the rules of checkers-like board games.

文中也提到了这种基于组合的逻辑存在的一些负面问题，例如对于以`compose`组合起来的若干个函数，它隐含着前一个函数的结果类型是后一个函数参数类型子类型的约束。在现实中，这并不是很容易，往往需要通过封装成类似context的数据结构来解决：

This is a general mis-feature of
rule-based systems: every rule must be able to accept the output of
any rule; this is normally handled by encoding the control state in
the data the rules are applied to.

## Variations on an Arithmetic Theme

这一章看得比较粗略，因为之前使用c++的运算符重载和类型元编程实现过[自动求导](/CS/Type%20Metaprogram.md)，所以大致能揣摩到作者想要表达的点。运算符重载可以看成是给现有语言添加语义的过程，应当做到不改变原有语义。为了实现这一点，文中采用了一种我理解为“广义的模式匹配”的方法，因为从根本上说，我们要做的只是根据输入所具备的某些模式，在示例中表现为是否符合一些predicate，然后进行相应的动作。而这种predicate到action的机制被实现为某种拓展（extension），而原始的系统，则被抽象为一个通用的，根据所安装的拓展进行匹配和分派的控制器。我将其理解为广义的模式匹配，是因为这种机制在很多语言中都可以看到，只是名字不同，例如c++模板中的tag dispatch和偏特化，typescript中的conditional type，racket中宏展开的机制等等。而第四章就是关于Pattern Matching的讨论应该说也印证了我的思路。

## Pattern Matching

4.4以类型推断为例子讲述将模式匹配这个概念泛化之后的能量，我觉得可以和虎书第16章结合起来看。

类型推断实现过程中的一个重要方法是`unify`函数，类比虎书的算法16-2。一种可能的，用伪typescript进行模拟的代码是：

```ts
type unify<T, U> = T extends App<infer TyCon, infer TList>
    ? U extends App<TyCon, infer UList>
        ? unify_each<TList, UList> // 算法16-2 规则1
        : never
    : TyCon extends TyFun<infer TyVarList, infer Ty>
        ? unify<subst<Ty, make_subst_rules<TyVarList, TList>>> // 算法16-2 规则2
        : ...
            : T extends Var<infer B> and U extends Var<B> // 算法16-2 规则6
                ? "OK"
                : "Error"
            : ...
```

这段伪码与书中示例的区别在于我们并没有给出一个指示如何分派的`dict`，而是借助typescript的条件类型实现，万变不离其宗，不管是`subst`还是`unify`，都是一个对参数进行模式匹配然后分派给相应处理函数的过程，只是各自的功能不同，`subst`（对应本节`do-substitude`函数）做变量替换，`unify`（对应本节`unify`函数）进行类型等价性测试，终极目标是对类型方程进行求解，方程的未知数在虎书上记作`Var<T>`，在本节中记作`(? name)`。

所以到底如何进行类型推断？先揣测类型检查的过程：为了检查函数声明`function f<z>(x: t1): t2 = e`的类型，这里的`z`是一个类型变量，我们将`f`转化为形参为`z`的`Poly`类型：`Poly<z, App<Arrow, [t1, t2]>>`。当我们遇到一个函数调用`f<int>(a)`之后，首先在环境中查找`f`的类型，再用`int`替换`t1`和`t2`中的`z`，然后检查`a`是否具有类型`t1`，并将`t2`作为函数调用的返回类型，显然“检查”、“替换”正是`unify`和`subst`发力的地方。虎书贴心的给出了代码，这里做了一些裁剪和修改：

```ts
transdec(env, function f<z>(x: t1): t2 = e) = 
    ...
    // 更新env
    env' = env + { f -> Poly<z, App<Arrow, [t1, t2]>>, x -> t1 }
    // 检查e的类型
    t3 = transexp(env', e)
    // 比对t2和t3
    unify(t2, t3)

// transexp也是匹配分派的模式，以整型加和带类型实例的函数调用为例说明transexp的作用
transexp(env, e1 + e2) = 
    // 递归下降对两个子项进行检查
    unify(transexp(env, e1), App<Int, []>)
    unify(transexp(env, e2), App<Int, []>)
    // 构造返回类型
    App<Int, []>

transexp(env, e1<ty>(e2)) = 
    check that e1 = Poly<z, App<Arrow, [t1, t2]>>
    // 检查参数类型
    unify(e2, subst(t1, { z -> ty }))
    // 构造返回类型
    subst(t2, { z -> ty })
```

为了进行类型推断，可以在需要类型的地方先放置一些占位符（Placeholder，或虎书称之为元变量Metavar），随后根据类型的约束关系将元变量实例化，例如在了解到元变量`a = list<n>`时，我们将`a -> App<list, [Meta<n>]>`加入到环境中，这个过程创建了一个新的元变量`n`，如果最终发现`n`是自由的，那么应该将这个类型泛化（通用化）为`Poly<T, App<list, [Var<T>]>>`。

那么如何“了解”元变量的类型呢？方法是修改`unify`的实现，想想占位符的含义是什么，就是这地方放啥都行，因此当我们需要用`unify`比对一个占位符和其他类型的时候，隐含的意思就是这个占位符最好可以容纳下目标类型。虎书的说明我理解如下：对于`unify(a, t)`，其中a是一个元变量，如果a已经被实例化为某个类型u，那么我们需要对u和t进行比对，否则，将a实例化为t。同时如果u和t比对后相互兼容，那应该将a的实例修改为其中范畴较大（还是小？？？）者，也即虎书所说的“若有可能，`unify`还会修改全局状态，将这两个类型标记为同一类型”，这也是`unify`为什么叫`unify`而不是`compare`、`match`之类的原因。
