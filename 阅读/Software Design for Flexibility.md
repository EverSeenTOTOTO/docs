# Software Design for Flexibility <Badge type="warning" text="施工中" />

听说是《SICP》的精神续作，重点是出版于2021年，很新。半年前就说想看，今天终于开始了。

> 唯一要吐嘈的是作者使用的是我不太熟悉的MIT Scheme，而且似乎Lisp编写者的风格一直是连字符标识符，这样大段的代码看起来很费劲。在IDE里面有缩进辅助线还好一点，在书里面就很伤眼睛了。

## Foreword

1.  Don't just use functions; use *generic* functions.
2.  Keep functions small.
3.  Often the best thing for a function to return is another function.
4.  Be prepared to treat data as code, perhaps even to the extreme of creating a new embedded programming language within your application if necessary.
5.  Be prepared to replace a data structure with a more general data structure that subsumes the original and extends its capabilities.
6.  Use automatic constraint propagation to avoid a premature commitment to which data items are inputs and which are outputs.

## Preface

*   It is hard to build systems that have acceptable behavior over a
    larger class of situations than was anticipated by their designers.
    **The best systems are evolvable**: they can be adapted to new
    situations with only minor modification.

*   **Flexibility is as important an issue as efficiency and correctness**.

## Flexibility in Nature and Design

这一章介绍了自然界可以给我们软件设计上的一些启示，例如宽进严出、模块化（组件化）、分层架构、泛化、专用化、冗余、退化（degeneracy）、Test and Fail模式等。其中冗余的讨论让人想到了RAID，干细胞与计算机的对比也很有启发性，而退化这一节对氨基酸编码的讨论则让人联想到汉明码……Test and Fail是我一直采纳的学习方式，遇到搞不懂的就控制变量、写demo多折腾折腾，旁敲侧击总能获得一点信息。看到满屏的红色报错不会心慌慌火急火燎就是了。

本章我最深以为然的是对于灵活性、效率和安全性的讨论，我们经常局限于眼前的复杂度，在没有建立其对软件系统的全面认识时就过早优化，从而忽视了项目长期迭代维护的代价。我们总是对软件工程报有天真的假设，例如团队是稳定的、网络是可靠的、文档是完善的且总是可用的等等等等。这又让我想起那个著名的“如果项目Leader被巴士创死”的段子。

*   An implementation should be conservative in its sending behavior, and liberal in its receiving behavior.

*   The principal cost of software is the time spent by
    programmers over the lifetime of the product, including
    maintenance and adaptations that are needed for changing
    requirements.

*   **The real cost of a system is the time spent by programmers—
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

这一章看得比较粗略，因为之前使用c++的运算符重载和类型元编程实现过[自动求导](/CS/Snippets/Type%20Metaprogram.md)，所以大致能揣摩到作者想要表达的点。运算符重载可以看成是给现有语言添加语义的过程，应当做到不改变原有语义。为了实现这一点，文中采用了一种我理解为“广义的模式匹配”的方法，因为从根本上说，我们要做的只是根据输入所具备的某些模式，在示例中表现为是否符合一些predicate，然后进行相应的动作。而这种predicate到action的机制被实现为某种拓展（extension），而原始的系统，则被抽象为一个通用的，根据所安装的拓展进行匹配和分派的控制器。我将其理解为广义的模式匹配，是因为这种机制在很多语言中都可以看到，只是名字不同，例如c++模板中的tag dispatch和偏特化，typescript中的conditional type，racket中宏展开的机制等等。而第四章就是关于Pattern Matching的讨论应该说也印证了我的思路。

## Pattern Matching

常规的模式匹配将带有占位符（变量）的模式与明确的数据相比对，模式与目标之间泾渭分明。如果放开这个限制，允许数据中也出现变量呢？这时模式与数据没有明显的界限，每个条目都可能蕴含一定的信息和未知数，我们的目标是比对各个模式之间相对应的部分，消除未知，汇总为最为明确的一个版本。这种拓展的模式匹配被称为 unification。

书中的 unify 实现读起来比较晦涩，一方面是用了CPS风格，另一方面使用了大量没有给出具体实现的工具函数，需要结合完整源代码才能阅读。因此这里给出我自己实现的版本，其核心都在`dispatch`函数的实现上，它是典型的匹配——动作过程。其核心思路是用一个`dict`记下变量的值，特别是当一个变量`Var`和一组表达式`Term`匹配的时候，我们需要像解方程一样用`Term`来表示这个变量`Var`，并且确保`Term`中没有`Var`（否则将导致递归定义）。每次有变量的值确定后，都要回过头来更新`dict`中的值。

```ts
const dispatch = (
  term1: Expr,
  term2: Expr,
  dict: Dict,
  onSuccess: () => Expr[] | void,
  onFail: (e: Error) => void,
): Expr[] | void => {
  return match(term1, term2, [
    [Const, Const,
      (c1, c2) => (isConstEqual(c1, c2) ? onSuccess() : onFail(new Error(`${c1} !== ${c2}`)))],

    [Const, Var,
      (c1, v2) => {
        if (dict.has(v2.name)) {
          return dispatch(c1, dict.get(v2.name)!, dict, onSuccess, onFail);
        }

        dict.forEach((value, key) => {
          if (value instanceof Term) {
            dict.set(key, new Term(value.atoms.map((atom) => replaceVariable(atom, v2, c1))));
          }
        });
        dict.set(v2.name, c1);

        return onSuccess();
      }],

    [Const, Term,
      (c1, t2) => onFail(new Error(`match constant and term\n\t${c1}\n\t${t2}`))],

    [Var, Const,
      (v1, c2) => dispatch(c2, v1, dict, onSuccess, onFail)],

    [Var, Var,
      (v1, v2) => {
        if (dict.has(v1.name)) {
          return dispatch(dict.get(v1.name)!, v2, dict, onSuccess, onFail);
        }
        if (dict.has(v2.name)) {
          return dispatch(v1, dict.get(v2.name)!, dict, onSuccess, onFail);
        }

        return onSuccess();
      }],

    [Var, Term,
      (v1, t2) => {
        const newTerm = eliminateVariables(t2, dict) as Term;

        // 不能有递归定义
        if (newTerm.atoms.some((atom) => isSameVar(atom as Var, v1))) {
          return onFail(new Error(`recursive variable in term\n\t${v1}\n\t${t2}`));
        }

        dict.forEach((value, key) => {
          if (value instanceof Term) {
            dict.set(key, new Term(value.atoms.map((atom) => replaceVariable(atom, v1, newTerm))));
          }
        });
        dict.set(v1.name, newTerm);

        return onSuccess();
      }],

    [Term, Const,
      (t1, c2) => dispatch(c2, t1, dict, onSuccess, onFail)],

    [Term, Var,
      (t1, v2) => dispatch(v2, t1, dict, onSuccess, onFail)],

    [Term, Term,
      (t1, t2) => {
        if (t1.atoms.length !== t2.atoms.length) {
          return onFail(new Error(`atom length not equal\n\t${t1}\n\t${t2}`));
        }

        return unifier(
          t1.atoms,
          t2.atoms,
          dict,
          onSuccess,
          onFail,
        );
      }],
  ], onFail);
};
```

unification 的典型用例是实现类型推断。复杂类型（Term）可以被看成是建立在基础类型（Const，字面值类型数字、字符串等）之上的复杂数据结构，未知的部分用变量（Var）表示，一个未知类型往往需要同时满足多个约束，我们最终便是要得到一个能够满足全部约束的解。
