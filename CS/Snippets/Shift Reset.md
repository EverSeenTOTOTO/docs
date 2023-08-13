# Delimited Continuation

如果不指定捕获的边界，`call/cc`捕获的延续称为Undelimited Continuation，[CPS](./CPS.md)一文的第三个例子其实揭示了Undelimited Continuation的一些缺陷[^link]。

[^link]: https://okmij.org/ftp/continuations/against-callcc.html

```scheme
(define k null)

(+ 1 (call/cc (lambda (cc)
           (set! k cc)
              999)))

(k (k (k 1))) ; 2
```

一旦最里层的`(k 1)`被调用，当前延续`(k (k ?))`将被丢弃。这指明捕获的延续虽然看起来像函数，但实质上不是函数，因为它**不能组合**，一旦调用，会“替换”掉当前延续。我们期望的是一种“接续”的延续，在调用被捕获的延续后还能继续执行当前延续，表现地和嵌套函数一样。

Racket确实有这样的机制，叫做`call-with-composable-continuation`，别名`call/comp`，顾名思义，它捕获的延续可以进行组合。

```scheme
(define k null)

(+ 1 (call/comp (lambda (cc)
           (set! k cc)
              999)))

(k (k (k 1)))
```

`(k (k (k 1)))`会依次打印2，3，4，因为`k`实质是`(<write-to-stdout> (+ 1 ?))`，故每次对`k`的调用都会回到这个时间点，然后将加1之后的新值提供给它。而我们的诉求只要打印最终的值4，即希望捕获的延续到`(+ 1 ?)`为止，不要把剩余的计算`(<write-to-stdout> ?)`也包括在内，这提示了Undelimited Continuation的第二个缺点，也是Undelimited意义的由来：**我们不能自由划定捕获延续的边界**。

为了解决这个问题，我们希望在执行流的某处打个标记，当延续捕获到这里时就停止，不要再把外围的计算包括在内。这个标记就像某种“帧定界符（Frame Delimiter）”，我们把计算的一个最小（不能再展开为嵌套计算）单位称为延续的帧。在`(foo (bar (baz ...)))`中，假定`foo`、`bar`、`baz`都是一个延续帧，如果在`baz`处捕获延续，将得到`(foo (bar ?))`，如果能在`bar`处打一个标记，`(foo (capture-barrier (bar (baz ...))))`，使得`baz`处捕获的延续到`capture-barrier`为止，只有`(bar ?)`，这种延续称为Delimited Continuation。这时Undelimited Continuation可以看成是使用默认定界符的一个特例，即`(capture-barrier (foo (bar (baz ...))))`。

这种带有标记的Delimited Continuation也称为Prompt。要实现上述目标，需借助`call-with-continuation-prompt`，别名`call/prompt`。它接受两个重要参数，第一个参数代表被边界包裹的计算，第二个参数代表要打的标记，`call/prompt`会将标记用作此处的定界。而`call/comp`和`call/cc`其实可以接受一个额外的参数，类型是一个帧定界符，作用是使它们捕获的当前延续只到被标记的最近一个Prompt为止。在下面的例子中，`make-continuation-prompt-tag`创建一个标记，我们把`capture-barrier`放置在`(- 1 (+ 1 ...))`之间，从而`call/comp`捕获的延续只到`(+ 1 ?)`为止。

```scheme
(define (capture-barrier body)
  (let ([tag (make-continuation-prompt-tag)])
    (call/prompt 
      (lambda ()
        (body tag))
      tag)))

(- 1 (capture-barrier
       (lambda (tag)
         (+ 1 (call/comp
                (lambda (cc) (set! k cc) 999)
                tag)))))

(k (k (k 1))) ; 4
```

把`call/comp`的第二个参数`tag`去掉能够更深刻领会到定界的含义：如果去掉，`(k (k (k 1)))`会依次打印-1, 1, -1, -1，因为此时捕获的`k`是`(<write-to-stdout> (- 1 (+ 1 ?)))`，代入1并计算三次得到`-1, 1, -1`，最后一个`-1`则来自将最终结果`<write-to-stdout>`的行为。

## 实例：实现`break`

之前提到过，我们可以用`call/cc`实现各种程序控制流，就像下面的`break`：

```scheme
(define-syntax while
  (lambda (stx)
    (syntax-case stx ()
                 [(_ cond body ...)
                  #'(letrec ([loop (lambda ()
                      (if cond
                        (begin
                          body ...
                          (loop))
                        (void)))])

                      (call/cc (lambda (cc)
                                 (set! break cc)
                                 (loop))))])))

(define break null)

; 输出0~5
(let ([i 0])
  (while (< i 10)
         (sleep 0.3)
         (println i)
         (if (= i 5) 
           (break)
           (set! i (+ i 1)))))
```

但是这个实现与我们通常所说的`break`相比还有BUG，因为无法处理嵌套的`while`，内层`while`的`break`一旦调用，把整个计算延续都给丢弃了。这是一个典型的延续捕获定界的问题，因此可借助Delimited Continuation，把每一个`while`用`capture-barrier`包裹起来，然后将相应的延续标记丢给`call/cc`，让`call/cc`捕获延续的时候注意边界：

```scheme
(define-syntax while
  (lambda (stx)
    (syntax-case stx ()
                 [(_ cond body ...)
                  #'(capture-barrier ; 设置边界
                      (lambda (tag)
                        (letrec ([loop (lambda ()
                                         (if cond
                                           (begin
                                             body ...
                                             (loop))
                                           (void)))])

                        (call/cc (lambda (cc) 
                                     (set! break cc)
                                     (loop))
                                     tag))))]))) ; 传入tag提醒call/cc

(define break null)

; 循环打印0~5
(while #t
       (let ([i 0])
         (while (< i 10)
               (sleep 0.3)
               (println i)
               (if (= i 5) 
                 (break)
                 (set! i (+ i 1))))))
```

最后才是原定为本文主角的控制原语`prompt/control`和`reset/shift`，它们能实现的控制流都可以用`call/prompt`配合`call/cc`、`call/comp`实现。Racket文档上给出了这些原语的实质，`prompt`和`reset`其实都是`call/prompt`的变体，只是`control`和`shift`的实现上我感觉还需要编译器对控制流进行调整：

```scheme
(prompt val) => val
(prompt E[(control k expr)]) => (prompt ((lambda (k) expr)
                                         (lambda (v) E[v])))
; where E has no prompt
```

```scheme
(reset val) => val
(reset E[(shift k expr)]) => (reset ((lambda (k) expr)
                                     (lambda (v) (reset E[v]))))
; where E has no reset
```
