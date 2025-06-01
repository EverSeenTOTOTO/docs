<script setup>
import SquarePlayground from '@vp/page-only/square/index.vue'
</script>

# Square <Badge type="warning" text="WIP" />

[Square](https://github.com/EverSeenTOTOTO/square)是最近摸鱼时开发的一个玩具语言， 主要动机有两个：一是以前实现过一个支持一类函数和一类延续的解释器，对自己的这门玩具语言有不少新想法，一直想写个编译器及相应的虚拟机实现，哪怕是最简单的自定义指令集堆栈机也很不错；二是采取 “learning by the hard way” 的模式，强迫在Rust `no_std`条件下编写并尽可能减少外部依赖，深入实践下Rust，同时构建为WASM，这样既可以复用自身各种前端技能，比如我打算等虚拟机大体完工之后再做的交互环境，即下面的 Playground；又因为在不依赖 emscripten、wasm_bindgen 等工具的情况下加载WASM并与宿主环境交互，变相学到了不少WASM的工程知识。整个过程中有些经验值得记录。

## Playground

这个简陋的 Playground 基于[xterm.js](https://xtermjs.org/)和轻量编辑器[codejar](https://github.com/antonmedv/codejar)制作。语法高亮也是通过正则匹配实现的，并没有 Language Server。你可以单步执行查看每条指令的效果。

<SquarePlayground />

## 指令设计

指令设计一个纠结的地方是其抽象程度。我们可以仅使用`LOAD/STORE/PUSH/POP`等基础指令，但这意味着要设计好闭包、对象等复杂数据结构的内存布局，并将创建这些数据结构、填充成员字段等操作翻译为低层次指令；另一方面我们也可以“偷懒”，使用一些抽象层次较高的指令，类似Lua的`OP_CLOSURE`、`GET_UPVALUE`、`SET_UPVALUE`等，每个指令描述了一个复杂过程，其具体实现则委托给虚拟机。显然，前者的优势是非常底层，容易转译为机器码，指令执行过程也相对好实现，甚至可以用现实中的机械模拟，通常性能也比较高；但缺点是在指令生成阶段要将操作各种基础数据结构的逻辑用基础指令表达，这并不简单，而且最终输出的指令条数也比较多。后者的优势是简化了指令生成过程，但相应的虚拟机在执行指令时要做更多工作，极端情况下，虚拟机退化为直接解读AST的解释器（理解为只有一条`EVAL`指令），这就失去了预编译为指令甚至机器码的性能优势，同时一条指令承担复杂功能，长度通常也会增加。

> CISC vs RISC

一般取舍之后，我还是复用了Rust的`Vec`和`HashMap`等基础设施，最终的指令集中有一些抽象层次较高的指令如`PUSH_CLOSURE`，`PACK`，`PEEK`等。

指令设计另一个点是“持久化”的能力。因为我希望生成的指令可以以文件的形式保存下来，未来转译为二进制文件能直接解读指令执行，而不用再次编译源码。这意味着设计时思路要清晰，理清楚哪些是运行时状态，哪些是编译期状态。举个例子，为了方便变量和参数赋值我设计了类似JS那样的展开赋值语法，下面这段代码，`x`将被赋值为2，`y`将被赋值为5：

```scheme
[let [. [x] ... y] [vec 1 [vec 2] 3 4 5]] ; x = 2, y = 5

; 在参数中也适用
[let foo /[. [x] ... y] [println x y]]

[foo 1 [vec 2] 3 4 5]
```

占位符`.` 必须占一个位置，而`...`则会占据尽可能多的位置，但也可以不占位。这里的难点在于，用来展开的值是一个运行期的变量，因此我们无法在编译阶段想当然地求出待展开内容的长度，然后对各变量直接生成按索引的取值指令，相反虚拟机的做法是通过`PEEK`指令设法记下各占位符的位置信息，最终变量位置的确定是在虚拟机解读`PEEK`指令时完成的。

## 作用域的处理

一个明显的观察是，整个代码块都可以组织为函数调用，所谓“全局变量”不过是程序最外层（虚拟机启动时默认创建）的一个隐性调用帧中的局部变量，而类似`{}`、`if {} else {}`等作用域块也可以解读为立即执行函数，因此只要处理好闭包调用和变量定义、访问与捕获，虚拟机设计会大大简化。当然，这种设计也有缺点，对于“立即执行”的作用域函数，它原本可以不捕获而直接在前序调用帧查找变量的，现在要额外创建一个调用帧并捕获一些变量，无疑大幅度增加了运行时开销，但这个问题是可以用CPS转换和尾调用优化的。

这里给出虚拟机中调用帧的大致定义：

```rust
pub struct CallFrame {
    locals: HashMap<String, Value>, // 局部变量

    stack: Vec<Value>, // 操作数栈
    sp: usize, // stack pointer

    ra: usize, // return address
}
```

## 闭包的实现

这或许是虚拟机实现中最难的部分。需要区分三个概念：函数定义、函数实例化和函数调用。

<Notation type="circle">函数定义</Notation>发生在编译时，指编译器在遇到一个函数时，将它编译为的那段静态指令；

<Notation type="circle">函数实例化</Notation>发生在运行时，对支持一类函数的语言来说，我们需要创建一个真正存在于内存、能够像常规值一样传来传去的结构（闭包），它至少有两个功能：定位到函数（指令）地址和捕获外部的局部变量；

<Notation type="circle">函数调用</Notation>也在运行时，实际调用的是函数实例（闭包），此时调用帧操作数栈顶应该分别是闭包和打包过的参数，调用过程大体如下，读者可以在上文的 Playground 中编写一个小函数并观察执行过程中指令和调用帧的变换：

1. 创建新的调用帧，记录当前的`pc`为RA（Return Address）并保存在新调用帧中，将参数推送进新调用帧的操作数栈，旧调用帧操作数栈退栈*2；
2. 从闭包中取出函数地址并设置给`pc`，继续执行直到函数尾部的`RET`指令；
3. 从当前调用帧取出RA并重设`pc`；
4. PUSH当前调用帧数据栈栈顶到上一个栈帧数据栈的顶部作为返回值，然后销毁当前调用帧。

`CALL`指令实现类似这样：

```rust
let params = frame.stack[frame.sp - 1].clone();
let func = frame.stack[frame.sp - 2].clone();

frame.sp -= 2;

let mut frame = CallFrame::new();

frame.ra = *pc;
// always push params as first operand
frame.stack[0] = params;
frame.sp = 1;

vm.push_frame(frame);

// jump to function
*pc = closure.borrow().ip as usize;
```

`RET`指令实现：

```rust
let frame = vm.current_frame();

// jump back
*pc = frame.ra;

let top = frame.top().unwrap_or(&Value::Nil).clone();

vm.pop_frame();

// always return the top value
vm.current_frame().push(top)
```

### 变量捕获、定义与修改的细节

#### 编译阶段

编译阶段的任务是判断哪些变量是当前作用域的局部变量，哪些是待捕获的定义于上层作用域的变量，然后将这些待捕获变量的名字保存到`PUSH_CLOSURE`指令中作为元信息。虚拟机执行到`PUSH_CLOSURE`指令时，将使用这些元信息进行捕获。实现起来也不需要复杂的软件分析，因为从AST上我们可以得知哪些地方是定义变量的，哪些地方是使用变量的，哪些地方开始了一个新的作用域，故只要在指令生成的过程中维护一个作用域栈（注意与运行时的调用帧区分，两者没有什么关联，尽管运作原理相似），生成`STORE`指令的时候记下变量名，就可以在生成`LOAD`指令的时候得知是否需要捕获：

以`if`语句为例，维护作用域栈并记下元信息：

```rust
ctx.borrow_mut().push_scope();
let condition_result = emit_node(input, condition, ctx)?;

let true_branch = expressions.get(2).unwrap();

// 进入 true 分支作用域
ctx.borrow_mut().push_scope();
let true_branch_result = emit_node(input, true_branch, ctx)?;
//  离开 true 分支作用域，captures 中保存有该作用域需捕获的变量名
let mut captures = ctx.borrow_mut().pop_scope();

// ...

if let Some(false_branch) = expressions.get(3) {
    // 进入 false 分支作用域
    ctx.borrow_mut().push_scope();
    let false_branch_result = emit_node(input, false_branch, ctx)?;
    // 离开 false 分支作用域
    captures.extend(ctx.borrow_mut().pop_scope());
    // 离开 if 函数体
    captures.extend(ctx.borrow_mut().pop_scope());

    // ...

    // 生成 PUSH_CLOSURE 指令，并保存待捕获的元信息
    result.push(Inst::PUSH_CLOSURE(Function::ClosureMeta(
        -4 - (condition_len + true_branch_len + false_branch_len),
        captures,
    )));
}
```

生成`STORE`指令的地方，`is_define`根据语法结构区分定义`define`还是赋值`assign`，是定义的话，将变量名添加到作用域中，是赋值则将变量标记为需捕获：

```rust
if is_define {
    ctx.borrow_mut().add_local(id.clone());
} else {
    ctx.borrow_mut().mark_if_capture(id);
}

insts.push(Inst::STORE(id.clone()));
```

生成`LOAD`指令的地方同理：

```rust
ctx.borrow_mut().mark_if_capture(id);
return Ok(vec![Inst::LOAD(id.clone())]);
```

`mark_if_capture`有个注意点，当一个变量被标记待捕获时，从当前作用域一直上溯到该变量定义处之间的所有作用域都需要标记待捕获该变量：

```rust
pub fn mark_if_capture(&mut self, name: &String) {
    // once a value is captured, it will be captured in all upper scopes until where it is defined
    for (locals, ref mut captures) in self.scopes.iter_mut().rev() {
        if !locals.contains(name) {
            captures.insert(name.clone());
        } else {
            break;
        }
    }
}
```

#### 闭包创建阶段

闭包创建和闭包调用可能发生在不同的时机，这就存在一个问题，在调用时，闭包中捕获的局部变量可能因调用帧退栈而被销毁，就像下面这段JS代码，`foo()`执行完之后，为`foo`创建的调用帧就已经销毁了，但`x`由于捕获却要保持存活：

::: code-group

```js [Javascript]
let foo = () => {
    let x = 42;
    return () => x;
};

let bar = foo();

console.log(bar())
```

```scheme [Square]
[let foo /[] [begin
    [let x 42]
    /[] x]]

[let bar [foo]]

[println [bar]]
```
:::

为此我们不仅仅要在创建闭包时捕获变量，还要在合适的时间将将被捕获的变量移动到堆上，有两种做法：

1. 在创建闭包并捕获变量的时候就将其移动到堆上；
2. 在调用帧被销毁时检查其局部变量是否被某闭包所捕获，是则移动到堆上。

采取1实现上会简单点，但2的运行时性能更好。Lua采用了2的做法，它将一个捕获变量区分为OPEN和CLOSED两种状态，如果变量被捕获但其所处调用帧还存活，捕获变量的地方看到的只是一个引用（OPEN），按引用捕获也满足了多个闭包捕获同一变量的场景。而当变量作用域因退栈而即将销毁的时候，Lua会将其中被捕获的变量移动到堆上（CLOSED），表现为一个upvalues链表。

然而在Rust中，由于所有权机制的存在，且从前面`CallFrame`定义可以看出我们局部变量`locals`的定义是`HashMap<String, Value>`，是持有值的所有权的，所以要同时在另一个地方创建其引用并不方便，为此我采用了1的做法：首先设计一个`UpValue`类型，通过`Rc<RefCell<T>>`来引用原变量，并在创建闭包的时候将要捕获的变量“升级”为`UpValue`，这个“升级”实际上就是移动到堆的过程：

```rust
#[derive(Debug, Clone)]
pub enum Value {
    Nil,
    Bool(bool),
    Num(f64),

    // ...

    UpValue(Rc<RefCell<Value>>), // [!code highlight]
}

impl Value {
    pub fn upgrade(&self) -> Value {
        match self {
            Value::UpValue(_) => self.clone(), // Rc::clone
            _ => Value::UpValue(Rc::new(RefCell::new(self.clone()))), // “升级”
        }
    }
}
```

`PUSH_CLOSURE`就是用来创建闭包的指令，这是其中最核心的捕获变量逻辑：

```rust
// upgrade value to captured
for name in closure.captures.iter().cloned().collect::<Vec<_>>() {
    if let Some(value) = frame.resolve_local(&name) {
        let upvalue = value.upgrade();

        closure.capture(&name, &upvalue);
        frame.insert_local(&name, upvalue.clone());
    } else {
        // else undefined yet, if later be defined in same scope,
        // the value will be updated
        let upvalue = Value::UpValue(Rc::new(RefCell::new(Value::Nil)));

        closure.capture(&name, &upvalue);
        frame.insert_local(&name, upvalue.clone());
    }
}
```

`else`部分有段注释值得关注，查找变量时如果未找到并不会直接报错，这是因为虚拟机实现了类似JS的“作用域提升”机制。下面这段代码，虽然`fn`创建的时候`x`还没有定义，但当该闭包调用的时候，**同一个作用域**里`x`已经有定义了，所以可以正确的输出`42`：

::: code-group

```js [Javascript]
let fn = () => x;
let x = 42;

console.log(fn());
```

```scheme [Square]
[let fn /[] x]
[let x 42]

[println [fn]]
```
:::

此外存在一个微妙的地方，如果稍加改造，下面这段代码会报错`x is not defined`。其实我们只需牢记一点：**变量捕获本质捕获的是一个作用域环境，只是将整个作用域保存下来太浪费了才选择精准的捕获变量**。`fn`闭包捕获的环境是`fn`所处的那个作用域，以及上游作用域，这些作用域中确实没有定义过`x`：

::: code-group

```js [Javascript]
let fn = () => x;
{
    let x = 42;
    console.log(fn());
}
```

```scheme [Square]
[let fn /[] x]
[begin 
    [let x 42]
    [println [fn]]]
```
:::

回到我们的虚拟机实现，如果执行等价代码，`let fn`那里会生成`PUSH_CLOSURE`指令，此时捕获并升级`x`，它的值是`nil`，而`fn()`执行的时候，也是基于当初捕获的值，和执行时作用域中的`let x = 42`没有任何干系。

#### 闭包调用阶段

使用捕获变量的行为与使用当前作用域的局部变量别无二致。进一步想想就会发现，捕获变量、函数参数和局部变量在用法上并无差别，只是存在覆盖关系，函数参数可以理解为函数体开头定义的局部变量，它会覆盖捕获的变量，而函数体中定义的局部变量会进一步覆盖函数参数。所以调用时对捕获变量的处理其实非常简单，只需要在新调用帧投入使用前预先“填充”捕获变量作为局部变量就行了。

修改`CALL`指令的实现，只需添加一行代码，将闭包中捕获的变量预填充到新调用帧作为局部变量：

```rust
let params = frame.stack[frame.sp - 1].clone();
let func = frame.stack[frame.sp - 2].clone();

frame.sp -= 2;

let mut frame = CallFrame::new();

frame.ra = *pc;
// always push params as first operand
frame.stack[0] = params;
frame.sp = 1;

// fill up captures
frame.extend_locals(closure.borrow().upvalues.clone()); // [!code ++]

vm.push_frame(frame);

// jump to function
*pc = closure.borrow().ip as usize;
```

作用域内，后续会发生两种情况：

1. 变量定义（可能覆盖捕获变量）：我们用`HashMap`实现`CallFrame`，变量名作为 key，覆盖的时候直接给指定变量名设个新值就行，它会替换掉旧值但不影响旧值自身；
2. 变量修改：常规变量直接修改即可。对于捕获变量，别忘了，这些捕获变量都是`Rc<RefCell<T>>`，是引用类型，因此对它们的修改可以反馈到其他引用处，也包括实际定义它们的那个作用域。

当然，赋值和修改体现在指令上都是`STORE`指令，因此要根据变量是否“升级过”区分下各种情况，参考如下实现：

```rust
pub fn assign_local(&mut self, name: &str, value: Value) {
    let new = if let Value::UpValue(upval) = value {
        upval.borrow().clone()
    } else {
        value
    };

    if let Some(Value::UpValue(old)) = self.locals.get(name) {
        *old.borrow_mut() = new;      // 修改捕获变量
    } else {
        self.insert_local(name, new); // 赋值和修改常规变量
    }
}
```

之后无论是局部变量还是捕获变量都简化为当前作用域的查找，免去向上游查找变量的过程，也体现了我们将整个程序运行过程统一为函数调用的好处。缺点自不必说，如果一个变量捕获处与定义处相差的层级比较深，中间每一个层级都持有它的一个引用，将大幅度浪费内存空间，而且一遍遍创建捕获变量引用的过程也很耗时，但正如之前所说的，借助CPS转换和尾调用优化，我们可以始终将运行时的调用帧深度控制在个位数，这些缺陷就不再成为性能瓶颈了。

高枕无忧了吗？当前实现还有一个小问题，考虑如下代码：

::: code-group

```js [Javascript]
let fn = () => {
  x; // should report error here!
  let x = 24;
  return x;
}

let x = 42;

fn();
```
```scheme [Square]
[let fn /[] [begin
    x ; undefined variable: x
    [let x 24]
    x]]

[let x 42]

[fn]
```
:::

`fn()`内部`x;`语句处，应该报错`x`未定义，但当前的虚拟机实现在指令生成阶段会错误的判断`x`是一个捕获变量，因此执行到此处时`x`是有值的，指向外层的`let x = 42`，随后`let x = 24`便失去了其定义的作用而变成了一个赋值语句（在运行时，它们都是`STORE`指令），错误的修改了外侧的`x`。这里的问题在于变量作用域提升通常还隐含着一个作用域覆盖（提升）的规则：**如果一个变量在作用域中定义了，那么同一个作用域及下游作用域所有使用到该变量的地方始终应该“看到”该定义**。体现在指令生成阶段，即使我们一开始标记了一个变量要被捕获，如果后来发现该变量晚些时候在同一个作用域被定义了，应去掉该标记，这个逻辑在前文所述遇到变量定义生成`STORE`指令并添加变量名到当前作用域的时候生效：


```rust
pub fn add_local(&mut self, name: String) {
    self.scopes.last_mut().unwrap().0.insert(name); // [!code --]
    let (ref mut locals, ref mut captures) = self.scopes.last_mut().unwrap(); // [!code ++]
    captures.remove(&name); // scope shadow // [!code ++]
    locals.insert(name); // [!code ++]
}
```

#### 尾调用优化和CPS转换

TODO

## 对象的实现

假如在虚拟机中，我们要实现`println`的功能，该怎么做？由于`println`涉及到系统接口，它通常是宿主环境注入的方法，那么我们设计一个`SYSCALL`指令是否就够用？还不够，因为我们一般会希望它的表现和其他函数一样，也能够作为一类函数传来传去，因此我们需要拓展一下虚拟机运行时值的定义，它不仅仅可以是一个闭包，也可能是一个`Syscall`：

```rust
#[derive(Debug, Clone, PartialEq)]
pub enum Function {
    ClosureMeta(i32, HashSet<String>), // compile time, (offset, captures)
    Closure(usize, HashMap<String, Value>), // runtime, (ip, upvalues)
    Syscall(&'static str),             // [!code ++]
}

#[derive(Debug, Clone)]
pub enum Value {
    Bool(bool),
    Num(f64),
    Str(String),

    Function(Rc<RefCell<Function>>),

    // ...
}
```

当`CALL`指令遇到一个`Syscall`时，它不再进行闭包那一套创建调用帧的操作了，而是根据“系统调用”的名字执行一段我们定义好的逻辑：

```rust
pub fn call(
    &self,
    vm: &mut VM,
    closure: Rc<RefCell<Function>>,
    params: Rc<RefCell<Vec<Value>>>,
    is_tail_call: bool,
) -> ExecResult {
    match *closure.borrow() {
        Function::Closure(ip, ref upvalues) => {}
        Function::Syscall(name) => { // [!code ++]
            let syscall = vm.buildin.get_syscall(name); // [!code ++]
            syscall(vm, params, self) // [!code ++]
        }
        // ...
    }
}
```

`builtin`里面，`println`的真正实现如下，其中`print!`宏背后是宿主环境提供的方法：

```rust
values.insert(
    "println",
    (
        // 运行时表示
        Value::Function(Rc::new(RefCell::new(Function::Syscall("println")))),
        // 本体逻辑
        Some(Rc::new(
            |_vm: &mut VM, params: Rc<RefCell<Vec<Value>>>, _inst: &Inst| -> ExecResult {
                params.borrow().iter().for_each(|val| print!("{}", val));
                print!("\n");
                Ok(())
            },
        ) as Syscall),
    ),
);
```

由此，我们有了一种变相的指令，可以将一段外部逻辑转换为虚拟机的内部表示，并且可以作为一类值传来传去。之所以大费周章地介绍这些，是因为虚拟机内部对象的实现本身没什么值得一说的…… 在`HashMap`的基础上，我们设计若干`Syscall`用来处理对象的创建和修改即可。下面这段代码，`obj`、`get`和`set`都是内置的`Syscall`，背后则是`HashMap`的创建和修改函数：

```scheme
[let o [obj k1 v1 k2 v2]]

[get o k1]
[set o k2 v3]
```

### 原型链

虚拟机中并没有直接实现原型链，但提供了一种类似于运算符重载的机制使之成为可能。具体表现为，即使有了`get`和`set`系统调用，我还是添加了`GET`和`SET`指令，它们执行时，会优先看看对象上有没有`__set__`和`__get__`成员，如果有，将用它们代替默认的`get`和`set`方法并执行。这意味着用户可以控制对象的查找赋值逻辑，并可以基于此进一步实现代理、只读、私有属性等机制。

## 延续的实现

在不考虑性能的情况下，保存现场非常的简单粗暴：将整个调用栈复制一份即可，复制后和当前`pc`一起保存在延续对象中，而延续对象不过是一种另类的函数：

```rust
#[derive(Debug, Clone, PartialEq)]
pub enum Function {
    Closure(usize, HashMap<String, Value>), // runtime, (ip, upvalues)
    Syscall(&'static str),             // (name)
    Contiuation(usize, Vec<Rc<RefCell<CallFrame>>>), // (ra, context) // [!code ++]
}

// VM 中
pub fn save_context(&self) -> Vec<Rc<RefCell<CallFrame>>> {
    self.call_frames.clone()
}

pub fn restore_context(&mut self, context: Vec<Rc<RefCell<CallFrame>>>) {
    self.call_frames = context;
}
```

`CALL`指令遇到一个`Contiuation`的时候，恢复现场，并将传递给`cc`的参数作为程序后续执行的参数：

```rust
pub fn call(
    &self,
    vm: &mut VM,
    closure: Rc<RefCell<Function>>,
    params: Rc<RefCell<Vec<Value>>>,
    is_tail_call: bool,
) -> ExecResult {
    match *closure.borrow() {
        Function::Closure(ip, ref upvalues) => {}
        Function::Syscall(name) => {
            let syscall = vm.buildin.get_syscall(name);
            syscall(vm, params, self)
        }
        Function::Contiuation(ra, ref context) => { // [!code ++]
            vm.pc = ra; // [!code ++]
            vm.restore_context(context.clone()); // [!code ++]
            Ok(vm // [!code ++]
                .current_frame() // [!code ++]
                .borrow_mut() // [!code ++]
                .push(params.borrow().get(0).unwrap_or(&Value::Nil).clone())) // [!code ++]
        } // [!code ++]
    }
}
```

而`callcc`也不出意外的又是一个内置函数，它其实是一种变相的`CALL`指令，在捕获当前延续`cc`之后，要调用传给它的那个函数`iife`并传入`cc`作为参数：

```rust
let cc = Function::Contiuation(vm.pc, vm.save_context());

return inst.call(
    vm,
    iife.clone(),
    Rc::new(RefCell::new(vec![Value::Function(Rc::new(
        RefCell::new(cc),
    ))])),
    false,
);
```

还没有结束，现在还存在一个问题。如下所示，如果用Racket运行等价代码，在我们调用`[cc 42]`回到过去之后，再次执行完`[let cc ...]`语句之后是不应该二次执行`[cc 42]`的。但以上面虚拟机实现的捕获手段，`pc`、调用栈全都被重置了，我们要怎样才知道`[cc 42]`那里其实已经执行过了呢？

```scheme
[let cc [callcc /[cc] cc]]

[cc 42]

cc
```

我们真正遇到的问题是延续捕获的边界，在Racket语法层面，有一个`ModuleExp`的概念，简单地理解为一个“段落”就行，上面这段代码有三个段落，而各个段落中的延续捕获是不会超出段落边界的，即`[let cc [callcc /[cc] cc]]`中的延续只捕获了其外侧、段落内的`[let cc ?]`延续，并不包含整个程序的剩余部分。

这个问题困扰了我很久，后来在[这篇文章](https://andrebask.github.io/thesis/)中得到了一丝明悟。不过我暂时没有实现`call/prompt`的打算因此没有用文章中的实现，相反，既然明白了“段落”的概念，有个简单的解法，我们用一条新指令`DELIMITER`来明确各段落的边界，记下段落的索引。然后在虚拟机中额外设置一个状态，姑且称为`mpc`，它始终指向下一个要执行的段落。如果是正常执行指令，遇到`DELIMITER`的时候`mpc++`。但如果因为延续调用发生了回溯，再次执行到一条`DELIMITER`时，其记录的索引值势必是小于等于`mpc`的，此时我们做一次跳转，将`pc`同步到`mpc`所指位置即可。

用前面的例子具体说明下，当我们因为`[cc 42]`回到`[let cc ?]`时，`mpc`是2，而回溯后再次执行遇到`DELIMITER(1)`时，我们要将`pc`同步为`DELIMITER(mpc)`也就是`DELIMITER(2)`的位置，从而避免了重复执行已执行过的代码：

```scheme
; DELIMITER(0)
[let cc [callcc /[cc] cc]]
; DELIMITER(1)
[cc 42]
; DELIMITER(2)
cc
; DELIMITER(3)
```

下为`DELIMITER`实现，性能还有待改善：

```rust
Inst::DELIMITER(mindex) => {
    if *mindex < vm.mpc {
        for i in vm.pc..insts.len() {
            if let Inst::DELIMITER(index) = insts[i] {
                if index == vm.mpc {
                    vm.pc = i;
                    break;
                }
            }
        }
    }

    vm.mpc = vm.mpc + 1;
    Ok(())
}
```

## 其他

### 搭建Rust `no_std`环境

这个教程很多了，随便找一些Rust嵌入式教程，或者Github上从零开始用Rust编写操作系统的教程都会讲到，这部分的重点是自定义堆内存分配器`global_allocator`和异常处理器`panic_handler`，为了便于调试还可以实现下`println`宏，跟着教程一步步来就差不多行了。因为这部分和编译器早期开发关系并不大，我打算在编译器本体就绪之后再考虑内存分配效率和GC问题，所以当下的实现都比较简单。

1. 堆内存分配器：

找了个现成的库`talc`：

```Rust
#[global_allocator]
pub static TALC: talc::TalckWasm = unsafe { talc::TalckWasm::new_global() };
```

2. 异常处理：

直接吐出WASM的`unreachable`指令：

```Rust
#[panic_handler]
fn panic(panic: &core::panic::PanicInfo<'_>) -> ! {
    println!("panic: {}", panic);
    core::arch::wasm32::unreachable()
}
```

3. `print!`和`println!`宏的实现，注意`&str`到内存指针`*const u8`和偏移量`usize`的FFI转换：

在NodeJS环境下，用的是`process.std.write`：

::: code-group
```Rust [WASM程序内部]
pub mod memory {
    use core::fmt;

    mod inner {
        #[link(wasm_import_module = "memory")]
        extern "C" {
            pub fn write(str: *const u8, len: usize);
        }
    }

    // write to memory and read by host
    pub fn write(message: &str) {
        unsafe { inner::write(message.as_ptr(), message.len()) };
    }

    pub struct Writer {}

    impl fmt::Write for Writer {
        fn write_str(&mut self, message: &str) -> fmt::Result {
            write(message);
            Ok(())
        }
    }
}

lazy_static! {
    static ref WRITER: Mutex<memory::Writer> = Mutex::new(memory::Writer {});
}

#[doc(hidden)]
pub fn extern_write(args: core::fmt::Arguments) {
    use core::fmt::Write;
    WRITER.lock().write_fmt(args).unwrap();
}

#[macro_export]
macro_rules! print {
    ($($arg:tt)*) => ($crate::externs::extern_write(format_args!($($arg)*)));
}

#[macro_export]
macro_rules! println {
    () => ($crate::print!("\n"));
    ($($arg:tt)*) => ($crate::print!("{}\n", format_args!($($arg)*)));
}

```

```js [宿主环境（NodeJS）]
const readUtf8String = (exports: WasmExports, offset: number, length: number) => {
  const array = new Uint8Array(exports.memory.buffer, offset, length);
  return utf8Decoder.decode(array);
};

const { instance } = await WebAssembly.instantiate(wasm, {
  memory: {
    write: (offset: number, length: number) => {
      const message = readUtf8String(instance.exports as WasmExports, offset, length);

      process.stdout.write(message);
    },
  },
}
```
:::

### 与宿主环境交互

首先有个特别想吐槽的点，我在翻阅网上的一些教程时，发现它们在提到WASM内存时都会说使用`WebAssembly.Memory`初始化一块线性内存，然后在WASM模块实例化时传入云云：

```js
const memory = new WebAssembly.Memory({ initial: 1, maximum: 16 });

WebAssembly.instantiate(wasmModule, { env: { memory } })
```

但这里创建的`memory`是一块“共享内存”，目前还只是个[proposal](https://github.com/WebAssembly/threads/blob/master/proposals/threads/Overview.md#shared-linear-memory)，似乎只有 [Wasmtime](https://docs.wasmtime.dev/api/wasmtime/struct.SharedMemory.html) 等几个运行时提供了相关实现。更重要的是，它和WASM模块运行起来之后自身所用的虚拟地址空间没有什么关系。因此，要想实现WASM模块内部与宿主环境的交互，还是得使用WASM模块自身导出的内存，通常离不开如下三个步骤：

1. 在WASM模块内部分配堆内存，拿到以程序虚拟地址空间表示的指针地址和布局大小，通过FFI机制传递给宿主环境；
2. 宿主环境在该地址上写入数据，调用WASM模块导出的其他方法通知数据就绪；
3. WASM模块方法中使用该数据。

下面是一个例子，在`test`中我们创建了一个`Foo`结构，打印其内存布局，并调用宿主环境提供的方法`update_foo`来更新`foo`，同时传递`foo`变量的地址和长度，随后再次打印`foo`的内存布局进行对比：

::: code-group
```Rust [WASM模块内部]
fn hexdump(ptr: *const u8, len: usize) {
    // hexdump 内调用宿主环境提供的print方法输出与xxd类似的内存布局，但是这并不重要……
}

struct Foo {
    bar: i32,
    baz: [u8; 8],
}

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    pub fn print(str: *const u8, len: usize);
    pub fn update_foo(addr: *const u8, len: usize);
}

#[no_mangle]
pub extern "C" fn test() {
    unsafe {
        let foo = Foo {
            bar: 0xabcd,
            baz: [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08],
        };
        let addr = &foo as *const _ as *const u8;
        let len = std::mem::size_of::<Foo>();

        hexdump(addr, len);

        // 在宿主环境中改变foo
        update_foo(addr, len);

        hexdump(addr, len);
    }
}
```

```js [宿主环境]
const utf8Decoder = new TextDecoder('utf-8');

async function main() {
  const buf = fs.readFileSync('rustdemo.wasm');
  const wasm = await WebAssembly.instantiate(buf, {
    env: {
      print(ptr, len) {
        const array = new Uint8Array(wasm.instance.exports.memory.buffer, ptr, len);
        const str = utf8Decoder.decode(array);
        process.stdout.write(str);
      },
      update_foo(addr, _len) {
        const view = new DataView(wasm.instance.exports.memory.buffer);

        view.setUint8(addr + 0, 0x9);
        view.setUint8(addr + 1, 0xa);
        view.setUint8(addr + 2, 0xb);
        view.setUint8(addr + 3, 0xc);
        view.setUint8(addr + 4, 0xd);
        view.setUint8(addr + 5, 0xe);
        view.setUint8(addr + 6, 0xf);
        view.setUint8(addr + 7, 0x0);
        view.setInt32(addr + 8, 0xffff, true);
      }
    },
  })

  wasm.instance.exports.test();
}

main();
```
:::

输出类似这样，注意我的机器是小端表示：

```
0xffff0 | 01 02 03 04 05 06 07 08
0xffff1 | cd ab 00 00
0xffff0 | 09 0a 0b 0c 0d 0e 0f 00
0xffff1 | ff ff 00 00
```

### 调整WASM程序初始化内存

目前Rust以`wasm32-unknown-unknown`作为target构建时，默认会导出内部的内存对象，如果我们将输出的wasm文件转换为wat的话，可以找到这样一条指令：

```lisp
 (memory (;0;) 17)
```

WASM程序一页是64KB，17页恰好是1MB多1页，有没有办法控制初始化时的内存大小呢？在[一些Issue](https://github.com/rustwasm/wasm-bindgen/issues/1345)上可以找到线索。这个17页是因为链接器默认会分配1MB的栈大小，要想控制这个数值，得传递一个参数给链接器：

```bash
RUSTFLAGS="-C link-arg=-zstack-size=65536" cargo build --target=wasm32-unknown-unknown
```

单位是Byte，65536B刚好是1页64KB，因此最终分配两页：

```lisp
(memory (;0;) 2)
```

### `sleep`的实现

`sleep`本质是Web环境的`setTimeout`。但 Square 既没有内置一个异步运行时，也没有和 Web 环境的`Promise`对应的Rust Binding，那它是为什么在 WASM 程序内部表现得像是同步阻塞了一样呢？这是因为背后用到了[JSPI](https://github.com/WebAssembly/js-promise-integration/blob/main/proposals/js-promise-integration/Overview.md)。简单来说，JSPI提供了一对API：`WebAssembly.Suspending`和`WebAssembly.promising`，当我们想要在WASM程序内部调用Web环境定义的异步方法`foo`时，可以将导入的`foo`用`WebAssembly.Suspending`包裹，然后将WASM程序导出的、调用`foo`的那个方法用`WebAssembly.promising`包裹。当WASM程序执行到`foo`时会被挂起，直到异步方法`foo`完成才继续执行，并且能够直接拿到异步方法的结果。

不过，这个API目前还在测试阶段，Chrome 的话需要在 <chrome://flags/> 里面打开相关配置才可以体验，具体可参考v8[这篇博客](https://v8.dev/blog/jspi)。
