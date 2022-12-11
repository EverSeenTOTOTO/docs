# 延续传递风格

:::warn
(Warning: call-with-current-continuation is weird.)[^3]
:::

[^3]: <https://www.cs.utexas.edu/ftp/garbage/cs345/schintro-v14/schintro_75.html#SEC82>

## 理解延续

延续（continuation），这里用作名词，通俗的说就是程序执行到某一阶段之后未来将要做的事情。我们熟悉的回调函数就是延续思想的体现。通常情况下如果我们要调用两个函数`foo`和`bar`，其中`bar`会用到`foo`的结果，那么可以写成`bar(foo())`的形式，但我们也可以将“调用`bar`”理解为调用`foo`的延续，写成回调的形式就是`foo(bar)`，在`foo`里面最终会调用`bar`。

有趣的地方在于，像Racket这类语言支持将延续作为一等公民，也就是可以将延续这个概念物作为一个实体传来传去（Reification），和我们说函数式语言支持将函数作为一等公民一样。在Racket中有一个函数叫做`call/cc`[^1]，全称是“Call with current-continuation”。它接受一个函数作为输入，当`call/cc`被调用时，`call/cc`的调用者，即调用`call/cc`之后要做的事情（被捕获的延续）将作为该函数的参数。**一旦延续被调用，不管是在那个函数体内部，还是通过赋值等方式把延续拿到外面来，都会改变程序执行流，直接丢弃当前延续，并且将传给延续的值作为延续——或者说后续执行的输入，延续执行的结果作为整个计算过程的结果**。

:::info
摘自wiki：When a continuation object is applied to an argument, the existing continuation is eliminated and the applied continuation is restored in its place, so that the program flow will continue at the point at which the continuation was captured and the argument of the continuation then becomes the "return value" of the call/cc invocation. Continuations created with call/cc may be called more than once, and even from outside the dynamic extent of the call/cc application.
:::

[^1]: https://docs.racket-lang.org/reference/cont.html

这么说还是很抽象，让我们从实际代码出发来理解continuation：

1. 下面这段代码会打印`1`和`2`，但是`3`不会打印：

    ```scheme
    (println 
      (call/cc (λ (cc)
                 (println 1)
                 (cc 2)
                 (println 3))))
    ```

    当`call/cc`被调用时，`cc`的值就是当前的延续（cc其实是current-continuation的简写），而当前的延续，也就是`call/cc`调用完程序将要做什么？是调用外围的那个`(println ?)`，这里的`?`部分，即后续执行的输入，则来自lambda函数里面的`(cc 2)`，所以是`2`。因此lambda函数执行时，首先执行`(println 1)`输出`1`，随后执行`(cc 2)`，直接跳到了未来执行外围`(println ?)`的时刻，跳过了`(println 3)`的执行，传递给当前延续`cc`的值是`2`，所以调用`(println 2)`输出`2`。

2. 下面这段代码会无限循环打印`loop`：

    ```scheme
    (define (cc) (call/cc (λ (cc) (cc cc))))

    (let [(start (cc))]
      (println "loop")
      (start start))
    ```

    第一行定义的函数`cc`是使用延续编写程序的一个常用技巧，由`(cc cc)`可知它将延续自己作为延续的参数来调用延续。因而我们有了一种捕获当前延续并且传递到`call/cc`外面去的方式。它甚至可以写得更简短~更有逼格~：

    ```scheme 
    (define (cc) (call/cc (λ (cc) (call/cc cc))))
    (define (cc) (call/cc (λ (cc) (cc cc))))
    (define (cc) (call/cc (λ (cc) cc)))
    (define (cc) (call/cc call/cc)) ; orz
    ```

    为了更方便地说明上面的无限循环是如何产生的，我们将`let`语法糖还原成函数调用，上面的`let`语句等价于下面这段代码：

    ```scheme
    ((λ (start)
        (println "loop")
        (start start))
     (cc))
    ```

    更进一步，拆解为：

    ```scheme 
    (define loop (λ (start) 
                   (println "loop")
                   (start start)))
    (loop (cc))
    ```

    和第一个例子类似，这里的`(cc)`会返回当前延续，而当前延续是什么？正是将要进行的调用`(loop 当前延续)`的行为。因此`loop`中的`start`参数就是当前延续，其延续的描述为“调用`loop`，参数是延续自己”。当`loop`中执行到`(start start)`时，这又是一种`(cc cc)`，于是再次将延续自己传递给延续并执行延续，周而复始。

3. 下面这段代码常被用作延续调用改变执行流的示例：

    ```scheme
    (define foo #f)

    (+ 1 (call/cc (λ (cc)
                     (set! foo cc)
                     3)))

    (foo (foo 3))
    ```

    这段代码会输出两个`4`，而非是一个`4`和一个`5`。第一个`4`来自于`(+ 1 ?)`很好理解，在我们传给`call/cc`的函数内部，并没有调用`cc`，因此该函数返回的`3`作为了`call/cc`的返回值参与`+ 1`运算。但在`(foo (foo 3))`的执行中，内层的`(foo 3)`以参数`3`调用以前保存的延续`(+ 1 ?)`，会替换（丢弃）当前延续，转为执行`(+ 1 3)`，并将这个结果作为当前计算的结果，因此无论在外面套上多少层`foo`，最终都会被丢弃，故结果为`4`。

4. 实现协程[^2]

    [^2]: https://matt.might.net/articles/programming-with-continuations--exceptions-backtracking-search-threads-generators-coroutines/

    到这里你也许发现，`(cc value)`的语义和`return`、`break`、`yield`、`catch`有些交集。延续可以被用于实现包括回溯、协程、异常处理在内的几乎所有程序控制流。下面我们模拟一个生成器（Generator）。使用延续来挂起函数，调用`yield`将程序控制权交给调用者并传递一个值。

    首先考虑`generator`里面应该是什么样子的，作为demo，我们遍历一个`range`，然后将每一个`i`都`yield`，直观的想法是这样：

    ```scheme 
    (define gen (λ (yield)
                        (for ([i (in-range 1 4)])
                             (yield i))))
    ```
    
    如果这时候我们调用`(gen println)`，它会打印1~3，但这不是我们想要的，我们期望`gen`是某种初始化函数，第一次调用之后，它返回一个可以被连续调用的函数，这个函数才是真正的`generator`。也就是说我们的调用方式大致像这样：

    ```scheme 
    (define g (gen))

    (next g) ; 1
    (next g) ; 2
    (next g) ; 3
    (next g) ; #void
    (next g) ; #void
    ```

    为了实现这个目标，我们传入的`yield`应该是一个来自外部的延续，这样调用`yield i`会直接跳过后续的执行，并将程序控制权传到外界。但跳过了后续迭代又如何实现遍历呢？我们可以不仅仅是传递`i`，而同时将`gen`内部的“当前延续”也传递出去：

    ```scheme 
    (define gen (λ (yield)
                   (for ([i (in-range 1 4)])
                        (call/cc (λ (cc)
                                    (yield (cons i cc)))))))
    ```

    现在只要给`gen`传一个延续，就可以拿到`gen`里面的`i`和内部延续了：

    ```scheme 
    (call/cc (λ (cc) (gen cc))) ; '(1 . #<procedure>)
    ```
    
    下一步要做的就是从这个`pair`中提取内容并执行，下面的代码中`in-cc`指代`gen`内部循环体的延续，我们每次打印一个值，然后接着调用这个延续，最终输出1～3：

    ```scheme
    (let [(p (call/cc (λ (out-cc) (gen out-cc))))]
      (if (pair? p)
        (let [(in-cc (cdr p)) (value (car p))]
          (println value)
          (in-cc))
        (void)))
    ```

    输出：

        1
        2
        3

    `out-cc`和`in-cc`起到的作用可以被理解为“保存现场”，`out-cc`保存的是所在`let`下面那一段程序，`in-cc`保存的是`for/i`下一次迭代。通过两段延续的相互调用实现协作。理解了这些，要实现`next`单步执行就很简单了，只需要将`in-cc`作为全局变量并设个初值，在`next`函数里判断一下，如果`in-cc`是初值，则初始化，否则调用`in-cc`。这样我们把对`in-cc`的调用移到了`out-cc`的现场外面，就可以单步调用了。

    完整的代码如下：

    ```scheme
    (define gen (λ (yield)
                   (for ([i (in-range 1 4)])
                        (call/cc (λ (cc)
                                    (yield (cons i cc)))))))

    (define in-cc #f)

    (define next (λ (g)
                    (if (continuation? in-cc)
                      (in-cc)
                      (let [(p (call/cc (λ (out-cc) (g out-cc))))]
                        (if (pair? p)
                          (begin
                            (set! in-cc (cdr p)) ; 原本这里是(in-cc)
                            (car p))
                          (void))))))

    (next gen)
    (next gen)
    (next gen)
    (next gen)
    (next gen)
    ```

    输出：

        1
        2
        3

    如果要规避全局变量，并且让`gen`可复用，用高阶函数包装一下即可。

## 实现`call/cc`

搞清楚了什么是延续，不免要好奇这样的机制该如何实现。不过，相比起用延续写程序时的“烧脑”，实现`call/cc`倒简单一些。因为现在我们就是程序的求值器，掌握程序的生杀大权，程序在什么时间该做什么，接下来该做什么完全控制在我们手中。

以递归下降方法对`begin`表达式求值为例，在宿主语言里，我们可能会利用循环实现，类似这样：

```ts 
function evalBegin(expr, env) {
  const beginEnv = new Env(env, 'begin');

  let last;

  for (const e of expr.children) {
    last = evalExpr(e, beginEnv);
  }

  return last;
}
```

这样的缺点是不好实现像`call/cc`这样的逃逸逻辑，因为当我们下沉到子句的`evalExpr`里面时，即使发现它是一个延续调用，也无法`break`外层调用者处的循环了。一种解决方案是换用非迭代的实现，并设法在`env`里面保存更多信息。但我们也可以应用延续的思想：对于`begin`语句的每一个子句，它的延续是“`eval`后续子句，执行整个`begin`语句的延续”，因此可以用函数来表达延续。我们给每个`eval`方法加上一个额外的参数，表示该表达式的延续，这时对`begin`语句的求值可能类似于：

```ts
function evalBegin(expr, env, cont) { // cont 是整个begin子句的延续
    return evalExpr(expr.children[0], env, (unused) => {
        return evalExpr(expr.children[1], env, (unused) => {
            ... 
            return evalExpr(/* last */, env, (last) => cont(last));
        })
    })
}
```

一个`begin`语句里面的表达式数量可以有很多，我们编写一个辅助函数`evalSeq`，它接受三个参数，第一个参数是子表达式列表，第三个参数是整个表达式列表求值完成之后的延续。值得关注的是第二个参数`each`，它代表了对每一个表达式要做的求值工作，而它接受的第二个参数`c`代表了对后续表达式的求值工作，即这里的`eachCont`。通过`each`里面对`c`的调用与否，就可以实现程序执行流的变化：

```ts
// evaluate a sequence, continuation passing style
export function evalSeq<T, R>(seq: T[], each: (t: T, c: Cont) => R, cont: Cont) {
  const helper = (s: T[], results: R[]) => {
    const [first, ...rest] = s;

    return s.length > 0
      ? each(first, function eachCont(value) {
        return helper(rest, [...results, value]);
      })
      : cont(results);
  };

  return helper(seq, []);
}
```

现在，`evalBegin`可以写成下面这样，`evalExpr`的调用将`c`传递给子表达式的求值过程，以后可能调用`c`，也可能不调用`c`：

```ts
function evalBegin(expr, env, cont) {
  const beginEnv = new Env(env, 'begin');

  return evalSeq(
    expr.children,
    (e, c) => { // each
      return evalExpr(e, beginEnv, c);
    },
    (values) => cont(values[values.length - 1]),
  );
}
```

延续调用就是不调用`c`的一个例子。我们只要设法区分一个函数调用是常规的函数调用还是延续调用，如果是常规函数调用，得到结果之后传给外面传进来的延续继续执行即可；如果是延续调用，那么它自己就是后续执行，因此它调用的结果就是整个表达式求值的结果，外面传进来的延续被忽略，通过这种方式实现了逃逸。用代码表达大致是：

```ts 
function evalApply(expr, env, cont) {
  return evalExpr(expr.caller, env, (caller) => { // 解析函数
    return evalSeq( // 解析参数列表
      expr.params,
      (t, c) => {
        return evalExpr(t, env, c);
      },
      (params) => { // 进行函数调用
        return isContinuation(caller)
          ? caller(...params)
          : cont(caller(...params))
      }
    )
  })
}
```

回看第一个例子，在求值进行到`(cc 2)`的时候，`caller`是`cc`也就是直接调用外围`(println ?)`的过程，`cont`则代表了接下来对`(println 3)`求值，再调用外围`(println ?)`的过程，通过舍弃`cont`实现了对`(println 3)`计算的丢弃。

```scheme
(println 
  (call/cc (λ (cc)
             (println 1)
             (cc 2)
             (println 3))))
```

现在终于可以实现`call/cc`了，它倒是相对简单，首先对传给`call/cc`的函数参数求值，然后将当前传入的`cont`作为该函数的输入即可。可能的实现如下：

```ts
function evalCallCC(expr, env, cont) {
  return evalExpr(expr.func, env, (func) => {
    return func(cont);
  });
}
```

仔细观察这些实现，我们将程序在某个阶段接下来要做的事情抽象成函数，并且在整个求值期间传来传去，中途还可能包裹上一层又一层延续。这种编码风格即所谓的“**延续传递风格**”（Continuation Passing Style）。由于程序的执行就是对AST不断求值的过程，并且有一个具体的对象表示程序未来要做的事情，可以利用这一点实现有趣的效果。比如我们的求值器是用JS编写的，那么可以将对延续的调用放到`setTimeout`的回调中去，就实现了`sleep`的效果，这个`sleep`在我们自己的语言中表现的就像是同步的一样。

求值器使用CPS风格有个很大的坏处，容易造成堆栈溢出，因为一点小小的递归就可能构造了大量的递归求值函数，但事实上执行到某一层时，堆栈的上游代表的都是程序过去所做作的事情，可以丢弃掉。因此存在的一种技巧是借助异常重置堆栈[^4]。

如果不是使用求值器，而是常规的编译到中间码乃至机器码的流程，对延续的处理要困难得多，我在这里[^5]看到过一些内容，但没有亲自实践。

[^4]: https://lisperator.net/pltut/cps-evaluator/stack-guard

[^5]: https://www.cs.utexas.edu/ftp/garbage/cs345/schintro-v14/schintro_127.html#SEC171
