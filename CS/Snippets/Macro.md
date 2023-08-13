# Racket和Rust宏机制入门

## Text-substitution macros （基于模式匹配-替换的宏）

提到宏首先想起的可能是C/C++中的预处理宏，不过宏这一特性的精彩之处远不只如此，一些语言中提供了能力更强的基于模式匹配的宏。模式匹配的身影在编程语言领域随处可见，而且善于伪装自己，有时是浅显的`switch`、`match`语句，有时是函数重载，有时是条件类型、模板偏特化等等。很多编写宏的技巧都是应用模式匹配这个范式时的技巧，比如“从特殊到一般”、”嵌套使用以简化代码逻辑“等。

宏的核心注意点是编译器展开宏的时机通常在语法分析之后，语义分析之前，在编译时而非运行时，牢记这一点就不难理解很多宏的特性或者说限制了。

### Racket中的宏

Racket中基于模式匹配-替换的宏机制，光靠猜也能猜出大致的框架：无非是若干模式（pattern），每个模式对应一个模板（template），在匹配成功后就将原始代码替换成模板。在Racket中，可以通过`define-syntax`和`syntax-case`定义宏。下面是一个`let`语法糖的例子，`syntax-case`下每一个中括号是一条匹配规则，这个例子只有一条规则，其中`(_ ([var rhs] ...) body ...)`是模式，`(syntax <template>)`是模板，`var`将会匹配`x`和`y`，`rhs`匹配`1`和`2`，`body ...`则匹配`(+ x y)`：

```scheme
(define-syntax my-let
  (lambda (stx)
    (syntax-case stx ()
                 [(_ ([var rhs] ...) body ...)
                  (syntax ((lambda (var ...) body ...) rhs ...))])))

(my-let ([x 1] [y 2]) (+ x y)) ; 3
```

:::info
`(syntax <template>)`可以简写为`#'<template>`，后文将使用简写的方法，其返回值是一个语法对象`syntax-object`，我将其理解为一个代码片段，包含了一些元信息。这是Racket文档中的介绍：a syntax object associates source-location and lexical-binding information with each part of the form. The source-location information is used when reporting syntax errors, and the lexical-binding information allows the macro system to maintain lexical scope.

从根本上来说，宏转换器只是将一个`syntax-object`转换（tramsform）为另一个`syntax-object`的函数。
:::

仅仅匹配-替换还不足以说明Racket宏机制的有趣之处，我们可以在处理宏的时候做一些**编译期**计算。注意下面的`(identifier? #'id)`，它更像是一个assert语句，去掉它几乎不会影响下面代码的功能，其价值在于辅助模式的匹配。我们对匹配到的语法对象`#'id`进行计算，并人为指明模式的优先级，返回的模板也不必直接是`syntax-object`，可以是最终返回`syntax-object`的表达式，这大大拓展了宏的能力。

```scheme
(define-syntax forty-two
  (lambda (stx)
    (syntax-case stx ()
                 [id (identifier? #'id) #'42])))

(println forty-two) ; 42
```

人为指明模式优先级的例子：

```scheme
(define-syntax foo
  (lambda (stx)
      (syntax-case stx ()
            [(_ a b) (identifier? #'b) #'(+ a b)]
            [(_ a b) (number? (syntax->datum #'b)) #'(- a b)] ; 关于 syntax-datum 的介绍见后文
            [else #'42])))

(define x 2)

(foo 1 x) ; 3
(foo 1 2) ; -1
(foo 1 "str") ; 42
```

`foo`还可以写成下面这样，这个刻意的例子只是想表达`syntax-case`和普通的函数差不多，但调用的时机发生在编译时，对提供给它的`syntax-object`对象进行匹配，因此当然可以嵌套：

```scheme
(define-syntax foo
  (lambda (stx)
      (syntax-case stx ()
            [(foo a b)
             (syntax-case #'b ()
                          [_ (identifier? #'b) #'(+ a b)]
                          [_ (number? (syntax->datum #'b)) #'(- a b)]
                          [else #'42])])))
```

#### 实例：对象代理

Racket文档还有个例子很有启发性，我们可以定义出行为和普通变量一样的变量，但实际上那个变量只是个getter和setter代理。

首先制作代理，下面的`(+ p 1)`会报错，因为`p`不是真实的数值，而是一个`(getter setter)`对：

```scheme
(define (create-proxy init)
  (let ([value init])
    (cons (lambda () value) ; getter
          (lambda (val) (set! value val))))) ; setter

(define p (create-proxy 0))

(+ p 1) ; error
```

为了让`p`的行为看起来和普通变量一样，我们要将使用到`p`的地方展开为对`getter`的调用，而对`p`赋值的地方展开为对`setter`的调用：

```scheme
(define-syntax fake-value
  (lambda (stx)
    (syntax-case stx ()
                 [id #'((car p))] ; getter
                 [(set! id any) #'((cdr p) any)])))  ; setter

(println (+ fake-value 1)) ; 1
(set! fake-value 42) ; error
```

`getter`表现正常，但`setter`还没成功。原因倒也明显，拿来匹配的`stx`只是`fake-value`这个宏标识符自身，它是看不到整个`set!`表达式的。我们希望当一个宏标识符出现在`set!`表达式中时，能够将整个`set!`表达式拿来匹配。好在Racket提供了这样的功能，叫做`make-set!-transformer`，文档中的说明是：

When the identifier appears as a `set!` target, the entire `set!` expression is provided to the transformer.

```scheme
(define-syntax fake-value
  (make-set!-transformer
    (lambda (stx)
      (syntax-case stx ()
                   [id #'((car p))]
                   [(set! id any) #'((cdr p) any)]))))

(set! fake-value 42)
(println fake-value) ; 42
```

这下`fake-value`看起来和一个直接定义的数值变量别无二致了。不知道这个例子有没有让你想起只读数据、原型链、观察者模式等机制，它们都可以用代理实现。

#### 进阶：编译期计算与嵌套宏

首先正式地认识一下`datum`和`syntax`对象。在Racket（Scheme，Lisp？）中，代码和数据的分界线不是那么明显，我们可以在一个代码片段前加上`'`来把它当作数据一样处理：`'(+ 1 2)`，这让人联想到`eval("1 + 2")`中的字符串，但`datum`性质上和`symbol`更相似一点。如果给`datum`绑定上必要的元信息，包括作用域和在源码中的位置等，就成了一个`syntax`对象。因此存在从两者之间转换的方法`syntax->datum`和`datum->syntax`，前者剥离元信息，后者附加元信息。

`datum->syntax`接受的第一个参数是语法对象，`datum->syntax`会提取它的词法作用域信息用来新建语法对象。可以利用这个机制破坏Racket宏的卫生性，下面是一个典型的例子：

```scheme
(define-syntax def-bar
  (lambda (stx)
    (datum->syntax #'lex '(define bar 42))))

(def-bar)
(println bar) ; error: bar: unbound identifier
```

```scheme
(define-syntax def-bar
  (lambda (stx)
    (datum->syntax stx '(define bar 42))))

(def-bar)
(println bar) ; 42
```

在第一段代码中，提供给`datum->syntax`的是`#'lex`，现场新建的一个语法对象，它所在的作用域和`(def-bar)`运行时的作用域不一样，因此`println`是看不到`bar`变量的；在第二段代码中，我们将`#'lec`换成了`stx`，`datum->syntax`会将`stx`所在作用域用于`(define bar 42)`，而`stx`即`(def-bar)`语句，和`println`语句在同一个作用域中，于是`println`打印出`42`。

理解`datum`和`syntax`很重要，因为宏的强大之处来自于把代码当作数据一样处理。下面是一个思路正确，但实现**错误**的嵌套宏的例子：

```scheme
(define-syntax fib
  (lambda (stx)
    (define (sub num-stx offset) ; 将一个 #'num 对象还原为数值，并减去 offset，再包装为 syntax-object
      (datum->syntax #'lex
                     (- (syntax->datum num-stx) offset)
                     #'srcloc))

    (syntax-case stx ()
                 [(fib 0) #'1]
                 [(fib 1) #'1]
                 [(fib num) (let ([minus_1 (sub #'num 1)] 
                                  [minus_2 (sub #'num 2)])
                              #'(+ (fib minus_1) (fib minus_2)))])))

(fib 10) ; error, expect number, given 'minus_1
```

可以从作用域的角度理解，`minus_1`和`minus_2`所在的作用域，与宏展开之后代码运行起来的作用域完全不是一个东西，因此当然会找不到`minus_1`和`minus_2`。更准确的理解是，`#'`在处理模板的时候，只会对模板中的模式变量（pattern variable）进行处理（比如匹配到的`num`），而`minus_1`和`minus_2`不是模式变量，`#'`会简单的把它们当作代码`'minus_1`，因此报错信息不是`unbound identifier`，而是`given 'minus_1`。

我们想要`minus_1`和`minus_2`表现得像模式变量一样，该怎么做呢？还记得前文提到过的`syntax-case`可以嵌套使用的例子吗，存在一个模式匹配的技巧，**在中途手动构造一些语法对象，再设计新的模式与它们匹配**，从而达成类似定义临时变量的效果。下面的例子中，在第二个`syntax-case`那里，我们手动设计了待匹配的目标`(list (sub #'num 1) (sub #'num 2))`，然后与准备好的模式`(minus_1 minus_2)`匹配，得到所需的模式变量：

```scheme
(define-syntax fib
  (lambda (stx)
    (define (sub num-stx offset)
      (datum->syntax #'lex
                     (- (syntax->datum num-stx) offset)
                     #'srcloc))

    (syntax-case stx ()
                 [(fib 0) #'1]
                 [(fib 1) #'1]
                 [(fib num) 
                  (syntax-case (list (sub #'num 1) (sub #'num 2)) ()
                               [(minus_1 minus_2)
                                #'(+ (fib minus_1) (fib minus_2))])])))

(fib 10) ; 89
```

我猜你可能像~机智的~我一样首先想到下面这样的写法：

```scheme
(define-syntax fib
  (lambda (stx)
    (syntax-case stx ()
                 [(fib 0) #'1]
                 [(fib 1) #'1]
                 [(fib num)
                  #'(+ (fib (- num 1))
                       (fib (- num 2)))])))

(fib 10) ; infinite expansion
```

然而这个定义不会停机，因为首次展开为`(fib (- 10 1))`之后，下一次带入规则进行匹配时，它将与`(fib num)`匹配，于是进一步展开为`(fib (- (- 10 1) 1))`，由于减法的运算只发生在运行时，永远别指望它在编译期展开为`(fib 0)`，只会无限展开下去。这也是为什么我们需要`syntax-datum`做编译期计算。

### Rust中的宏

Rust中可以通过`macro_rules!`定义基于模式匹配-替换的宏，语法结构和`syntax-case`很像，只是在书写模式的时候有些晦涩，因为它需要我们手动指明模式变量的类型。

下面的定义会无限展开，原因刚刚提到过了：

```rust
macro_rules! fib {
    (0) => {1};
    (1) => {1};
    ($num:expr) => {
        fib!($num - 1) + fib!($num - 2)
    }
}

println!("{}", fib!(2)); // error: recursion limit reached while expanding `fib!`
```

想要在编译阶段完成对`$num-1`和`$num-2`的计算，可以借助过程宏的力量，过程宏在下文介绍，这里给出实现`fib!`的代码。

:::info
我并没有直接说Rust文本替换的宏系统不能做到编译期计算，因为不知道它是不是图灵完备的，如果是，那总归是有办法实现的，只是非常繁琐。
:::

```rust
use proc_macro::{self, TokenStream};
use quote::quote;
use syn::{parse_quote, visit_mut::VisitMut, Expr, ItemFn, Lit};

// visit and modify AST
struct Visitor;

impl VisitMut for Visitor {
    fn visit_expr_mut(&mut self, node: &mut Expr) {
        match &node {
            Expr::Lit(lit_expr) => {
                if let Lit::Int(lit) = &lit_expr.lit {
                    let value = lit.base10_parse::<u16>().unwrap();

                    match value {
                        0 => {
                            *node = parse_quote! {1};
                        }
                        1 => {
                            *node = parse_quote! {1};
                        }
                        _ => {
                            let minus_1 = value - 1;
                            let minus_2 = value - 2;

                            // println!("{}, {}", minus_1, minus_2);

                            *node = parse_quote! { (fib!(#minus_1) + fib!(#minus_2)) }
                        }
                    }
                }
            }
            _ => unimplemented!(),
        }
    }
}

#[proc_macro]
pub fn fib(input: TokenStream) -> TokenStream {
    let mut item = syn::parse(input).expect("failed to parse input");

    Visitor.visit_expr_mut(&mut item);

    let output = quote! { #item };
    return output.into();
}


println!("{}", fib!(10)); // 89
```

可以用cargo-expand查看宏展开的结果：

```rust
fn main() {
    {
        ::std::io::_print(
            ::core::fmt::Arguments::new_v1(
                &["", "\n"],
                &[
                    ::core::fmt::ArgumentV1::new_display(
                        &(((((((((1 + 1) + 1) + (1 + 1)) + ((1 + 1) + 1))
                            + (((1 + 1) + 1) + (1 + 1)))
                            + ((((1 + 1) + 1) + (1 + 1)) + ((1 + 1) + 1)))
                            + (((((1 + 1) + 1) + (1 + 1)) + ((1 + 1) + 1))
                                + (((1 + 1) + 1) + (1 + 1))))
                            + ((((((1 + 1) + 1) + (1 + 1)) + ((1 + 1) + 1))
                                + (((1 + 1) + 1) + (1 + 1)))
                                + ((((1 + 1) + 1) + (1 + 1)) + ((1 + 1) + 1))))
                            + (((((((1 + 1) + 1) + (1 + 1)) + ((1 + 1) + 1))
                                + (((1 + 1) + 1) + (1 + 1)))
                                + ((((1 + 1) + 1) + (1 + 1)) + ((1 + 1) + 1)))
                                + (((((1 + 1) + 1) + (1 + 1)) + ((1 + 1) + 1))
                                    + (((1 + 1) + 1) + (1 + 1))))),
                    ),
                ],
            ),
        );
    };
}
```

当然，我们很快就想到，为什么不直接制作一个在编译期运行的`fib`函数，将宏直接替换成调用函数得到的结果，从而避免运行时的计算呢？熟悉C++的`constexpr`的话应该很熟悉这个套路，这是一种用编译期开销换取运行时优化的策略，在很多时候都是值得的。举个例子，在不同的时候你可能需要不同精度的某个值，比如PI，但是你不想耗费运行时资源去计算它们，这时可以借助宏的力量，`pi!(2)`、`pi!(4)`在编译后将被替换成具体的数值，而我们写下的代码也是相当好读的。

### Hygiene-宏的卫生性

使用文本替换宏最害怕的是什么？无疑是机械地替换产生了意想不到的结果，例如在模板代码中定义的变量和实际作用域冲突了，此即所谓“宏的卫生性”。好在Racket和Rust中宏的卫生性大多数时候都是有保证的，前面已经给出了破坏Racket宏卫生性的例子，Rust的例子可以看[这里](https://danielkeep.github.io/tlborm/book/mbe-min-hygiene.html)。

卫生性的保证也不是很难理解，如果是我们自己，想要模板中定义的变量不影响实际作用域的话，往往会给变量起一个不容易碰撞的名字，但这个方法还不够保险，因此可以猜测，能够保证卫生性的宏系统内部可能会用到类似symbol这样唯一命名的机制。

## Procedural macros （过程宏）

过程宏的关键词是编译期计算，编译器使用我们预先定义好的逻辑对一段代码进行处理，这种自由度极大地提升了语言的可拓展性，前面Racket的介绍已经初见端倪了。甚至存在从一个很小的语言内核，完全利用过程宏去拓展自身的语言。下面主要谈论Rust中的过程宏。不过在那之前，我们先来看一下在Java、Typescript、Python等语言中活跃的装饰器（Decorator），原因是之前在Rust CN Conf 2020上看到用Rust过程宏实现装饰器的Talk，一下子让我想起了在Typescript里面的类似经历。

### Typescript中的装饰器

装饰器看起来很神奇，往类、属性、函数或参数上一放，就能改变它们的默认行为。但其实除了装饰器API自身提供的功能之外，大多数时候，我们可以仅仅把装饰器当作一个标记，通过这个标记，可以操作目标的一些元信息，至于实现什么样的功能，那完全要看个人的想象力。

在Typescript中，时常和装饰器一起使用的，是reflect-metadata这个库，它提供了操作元信息的能力。下面有一个属性装饰器的例子，`@nothrow()`的功能是让函数不会抛出错误。实现思路其实很简单，利用`Reflect.defineMetadata`在目标函数上存放一些元信息，构造实例的时候，利用`Reflect.getMetadata`取出元信息，然后用魔改后的方法覆盖实例上原有的方法：

:::warn
这个例子构建时使用到了@babel/plugin-proposal-decorators，配置的`version`参数是默认的`"2018-09"`。由于装饰器还没有形成稳定的标准，API可能有些变化。
:::

```ts
import 'reflect-metadata';

// 对 fn 进行包装
function wrapNothrowFn(fn: (...args: any[]) => any) {
  return function guardFn(...args: any[]) {
    try {
      fn(...args);
    } catch {
      console.info('got you!');
    }
  };
}

const key = Symbol('nothrow_key');

// 定义装饰器
function nothrow(): PropertyDecorator {
  return function nothrowDecorator(target: any) {
    Reflect.defineMetadata(key, true, target.descriptor.value); // mark = true
  };
}

class Demo {
  // 使用装饰器
  @nothrow()
  throwSth(message: string) {
    throw new Error(message);
  }

  static instance() {
    const instance = new Demo();

    Object.getOwnPropertyNames(Demo.prototype)
      .forEach((prop) => {
        const mark = Reflect.getMetadata(key, instance[prop]);

        if (mark) { // 如果方法被标记了，魔改之
          Reflect.set(instance, prop, wrapNothrowFn(instance[prop].bind(instance)));
        }
      });

    return instance;
  }
}

const demo = Demo.instance();

demo.throwSth('throwing!'); // got you!
```

Rust中的attribute出现的位置几乎和装饰器一致，而它的过程宏机制又允许了自定义attribute，用来实现装饰器自然不在话下。留意这两个例子的微妙差别，前者对实例方法的魔改发生在运行中创建实例的时候，后者则直接在编译阶段修改了类方法源码。

### Rust中的实现

Rust的过程宏与预处理宏的重要差别在于，过程宏是将宏标记所作用的一整个代码片段交给我们进行处理，而不仅仅是宏自身。Rust中的过程宏分为三类，function-like、derive和attribute，function-like我们已经在前面`fib!`举过例子了，下面是用attribute宏实现属性装饰器的例子，derive宏可以用来实现类装饰器。

Rust官方提供了一个`proc_macro`库用于定义过程宏，每个过程宏可以简单地看成是将一些`TokenStream`转换成另一些`TokenStream`的函数。在实践中，经常还会用到syn和quote两个库，前者提供了从`TokenStream`到AST的转换，后者反之，目的都是为了方便操作代码片段。

syn分为若干模块，常用的`parse`模块用于解析AST，`visit`和`visit-mut`用访问者模式对AST上的结点进行操作。比较值得一提的是，大多数时候我们并不需要从零开始像搭积木一样构造某个代码片段的AST，Rust的过程宏可以操作一个代码片段，因此存在这样的宏，我们写好想要的模板，直接用它转换成所需的AST再嵌入到待修改的AST上去，也就是syn里的`parse_quote!`，可以类比Racket中的`(syntax <template>)`。

下面是Rust中实现`nothrow`装饰器的例子。当然，Rust作为强类型语言，我们不能像ts那样随意变更实例上的方法，事实上也不需要那么麻烦，既然我们可以直接操作源码，用立即执行函数（IIFE）将原始的函数体包裹起来就行了：

:::info
为了获知应该访问哪个结点，结点上有哪些信息，[AST Explorer](https://astexplorer.net/)和syn的文档很有用。
:::

`nothrow`属性宏的实现：

```rust
use proc_macro::{self, TokenStream};
use quote::quote;
use syn::{parse_quote, visit_mut::VisitMut, ItemFn};

struct FnVisitor;

impl VisitMut for FnVisitor {
    fn visit_item_fn_mut(&mut self, node: &mut ItemFn) {
        let old_block = &node.block;
        let output = &node.sig.output;

        // 修改函数体
        node.block = Box::new(parse_quote! {
            {
                if let Err(_) = (|| #output #old_block)() { // #output 是原本的返回类型，#old_block 是原本的函数体
                    println!("got you");
                }
                return Ok(());
            }
        })
    }
}

#[proc_macro_attribute]
pub fn nothrow(_: TokenStream, input: TokenStream) -> TokenStream {
    // 解析
    let mut item = syn::parse(input).expect("failed to parse input");

    // 操作
    FnVisitor.visit_item_fn_mut(&mut item);

    // 还原
    let output = quote! { #item };
    return output.into();
}
```

应用示例：

```rust
use macro_demo::nothrow;

struct Demo;

impl Demo {
    #[nothrow]
    fn throw_sth(&self, message: &str) -> Result<(), MyError> {
        Err(MyError::new(message))
    }
}

fn main() {
    let d = Demo {};

    d.throw_sth("throwing").unwrap(); // got you
}
```

查看宏展开的结果：

```rust
impl Demo {
    fn throw_sth(&self, message: &str) -> Result<(), MyError> {
        if let Err(_) = (|| -> Result<(), MyError> { Err(MyError::new(message)) })() {
            {
                ::std::io::_print(::core::fmt::Arguments::new_v1(&["got you\n"], &[]));
            };
        }
        return Ok(());
    }
}
```
