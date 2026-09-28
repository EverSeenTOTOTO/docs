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

一般取舍之后，我还是复用了Rust的`Vec`和`HashMap`等基础设施，最终的指令集中有一些抽象层次较高的指令如`PUSH_CLOSURE`，`PACK`，`PEEK`等。后来做性能优化时又在这层抽象上叠了超指令融合——比如`LOADC_JNE`把“取局部、压立即数、比较、条件跳转”整条循环条件折叠成一条指令——思路倒是一脉相承：对堆栈机而言，派发次数比指令条数更贵。

指令设计另一个点是“持久化”的能力。因为我希望生成的指令可以以文件的形式保存下来，未来转译为二进制文件能直接解读指令执行，而不用再次编译源码。这意味着设计时思路要清晰，理清楚哪些是运行时状态，哪些是编译期状态。举个例子，为了方便变量和参数赋值我设计了类似JS那样的展开赋值语法，下面这段代码，`x`将被赋值为2，`y`将被赋值为5：

```scheme
[let [. [x] ... y] [vec 1 [vec 2] 3 4 5]] ; x = 2, y = 5

; 在参数中也适用
[let foo /[. [x] ... y] [println x y]]

[foo 1 [vec 2] 3 4 5]
```

占位符`.` 必须占一个位置，而`...`则会占据尽可能多的位置，但也可以不占位。这里的难点在于，用来展开的值是一个运行期的变量，因此我们无法在编译阶段想当然地求出待展开内容的长度，然后对各变量直接生成按索引的取值指令，相反虚拟机的做法是通过`PEEK`指令设法记下各占位符的位置信息，最终变量位置的确定是在虚拟机解读`PEEK`指令时完成的。

## 作用域的处理

一个明显的观察是，整个代码块都可以组织为函数调用，所谓“全局变量”不过是程序最外层（虚拟机启动时默认创建）的一个隐性调用帧中的局部变量，而类似`{}`、`if {} else {}`等作用域块也可以解读为立即执行函数，因此只要处理好闭包调用和变量定义、访问与捕获，虚拟机设计会大大简化。这套“万物皆函数调用”的统一确实让实现极简，我也确实这么干了很久。当然，缺点当时就看得见：对于“立即执行”的作用域函数，它原本可以不捕获而直接在前序调用帧查找变量的，现在要额外创建一个调用帧并捕获一些变量，无疑大幅度增加了运行时开销，我当时的想法是可以用CPS转换和尾调用优化来解决。

后来做性能优化，逐指令的周期剖析器把这笔账算得明明白白：`CALL`、`LOAD`、`PUSH_CLOSURE`三项占了近七成周期——`if`/`while`/`begin`/`cond`全部编译为“闭包 thunk + 零参立即调用”，分支作用域靠独立调用帧实现，是运行时按名解析的架构性代价。最终的解法比CPS朴素得多：**槽位化**——变量在编译期静态布局到调用帧的槽位数组里，名字解析全部提前到编译期，作用域块直接编译为跳转，thunk整个消失。所以现在的虚拟机里，作用域块不再产生任何调用帧，“整个程序统一为函数调用”退化成一条纯粹的组织原则：全局变量仍然只是根帧的局部变量，仅此而已。

这里给出虚拟机中调用帧的大致定义：

```rust
pub struct CallFrame {
    pub slots: Vec<Value>, // 槽位化局部变量（编译期静态布局）；被捕获的槽位以 UpValue 共享单元存储
    pub ups: Rc<Vec<Rc<RefCell<Value>>>>, // 本帧闭包的 upvalue 单元表（与闭包实例共享同一个 Rc）
    pub names: Rc<Vec<String>>, // 槽位名表（快照/调试用）

    pub stack: Vec<Value>, // 操作数栈
    pub sp: usize, // fake stack pointer，避免频繁的栈增长判断
    pub ra: usize, // return address
}
```

## 闭包的实现

这或许是虚拟机实现中最难的部分。需要区分三个概念：函数定义、函数实例化和函数调用。

<Notation type="circle">函数定义</Notation>发生在编译时，指编译器在遇到一个函数时，将它编译为的那段静态指令；

<Notation type="circle">函数实例化</Notation>发生在运行时，对支持一类函数的语言来说，我们需要创建一个真正存在于内存、能够像常规值一样传来传去的结构（闭包），它至少有两个功能：定位到函数（指令）地址和捕获外部的局部变量；

<Notation type="circle">函数调用</Notation>也在运行时，实际调用的是函数实例（闭包），此时调用帧操作数栈顶应该分别是闭包和若干个实参，调用过程大体如下，读者可以在上文的 Playground 中编写一个小函数并观察执行过程中指令和调用帧的变换：

1. 从帧池取一个调用帧复用，记录当前的`pc`为RA（Return Address）并保存在新调用帧中，参数从调用方操作数栈**直接拷贝进被调方的槽位**（早期实现是先把参数打包成一个`Vec`再解包，后来发现这笔中间分配纯属多余），旧调用帧操作数栈退栈 n+1；
2. 从闭包中取出函数地址并设置给`pc`，继续执行直到函数尾部的`RET`指令；
3. 从当前调用帧取出RA并重设`pc`；
4. PUSH当前调用帧数据栈栈顶到上一个栈帧数据栈的顶部作为返回值，然后销毁当前调用帧——其实是回收入帧池，`Rc`引用计数为 1（无续延共享）时才连壳复用。

`CALL`指令中闭包分支的核心实现类似这样：

```rust
let callee_rc = vm.take_frame(); // 帧池复用，CALL 全程零堆分配
{
    let mut callee = callee_rc.borrow_mut();
    bind_params(&mut callee, &info, &caller.stack[sp - n..sp]); // 参数直拷进槽位
    callee.ups = ups; // upvalue 单元表 Rc 自增
    callee.ra = vm.pc;
}
caller.sp = sp - n - 1;

vm.push_frame(callee_rc);

// jump to function
vm.pc = ip;
```

`RET`指令实现：

```rust
let (ra, top) = {
    let frame = vm.call_frames.last().unwrap().borrow();
    (frame.ra, frame.top().unwrap_or(&Value::Nil).clone())
};

// jump back
vm.pc = ra;

if let Some(rc) = vm.pop_frame() {
    vm.recycle_frame(rc);
}

// always return the top value
vm.current_frame().borrow_mut().push(top)
```

### 变量捕获、定义与修改的细节

#### 编译阶段

编译阶段的任务是判断哪些变量是当前作用域的局部变量，哪些是待捕获的定义于上层作用域的变量。实现起来也不需要复杂的软件分析，因为从AST上我们可以得知哪些地方是定义变量的，哪些地方是使用变量的，哪些地方开始了一个新的作用域。旧实现是在指令生成的过程中维护一个作用域栈（注意与运行时的调用帧区分，两者没有什么关联，尽管运作原理相似），生成`STORE`指令的时候记下变量名，捕获以名字的集合保存在`PUSH_CLOSURE`里，运行时一遍遍按字符串哈希查找——是当时的性能顽疾之一。槽位化之后，编译器维护的是一个函数上下文栈（`FnCtx`，注意换成了按**函数**而不是按作用域分界），每个名字在使用处被 resolve 成三种绑定之一：

```rust
pub enum Binding {
    Local(u16),   // 当前函数的槽位
    Upvalue(u16), // 本闭包已注册的第 idx 个捕获
    Global,       // 全局表（`=` 动态定义）→ 内建 → 未定义报错
}
```

名字查找的大致次序：本函数局部 → 本闭包已注册的捕获 → 沿外层函数链找**定义者**：

```rust
fn resolve(&mut self, name: &str) -> Binding {
    let last = self.fns.len() - 1;
    if let Some(slot) = self.fns[last].lookup_local(name) {
        return Binding::Local(slot);
    }
    if let Some(idx) = self.fns[last].upvalues.iter().position(|(n, _)| n == name) {
        return Binding::Upvalue(idx as u16);
    }

    // 找定义者：最内层的外层函数，名字或是其局部槽位、或是其 upvalue
    let mut owner = None;
    for i in (0..last).rev() {
        if let Some(slot) = self.fns[i].lookup_local(name) {
            owner = Some((i, CaptureSrc::Local(slot)));
            break;
        }
        // ...
    }
    // ...
}
```

找到定义者后有个关键动作：从定义者到当前函数的**每一层**都要注册传递捕获。这与旧实现`mark_if_capture`沿作用域栈上溯打标记是同一件事，只是标记的对象从“变量名”变成了“来源”——捕获不再按名字，而是按`CaptureSrc`，直接指明捕获的是外层帧的几号槽位，还是外层闭包的第 j 个 upvalue（后者就是传递捕获，Lua 同款，中间层只挂名不展开，不至于层层复制）：

```rust
pub enum CaptureSrc {
    Local(u16),   // 外层函数帧的槽位
    Upvalue(u16), // 外层闭包的第 j 个 upvalue
    This,         // 方法体引用宿主对象，闭包存入 obj 时由 set/obj 回填
}
```

这些元信息连同槽位数量、参数布局一起，保存在`PUSH_CLOSURE`指令携带的`ClosureInfo`里。运行时所有同源闭包实例共享这一份编译期信息（`Rc`），每个实例只自带一份 upvalue 单元表。

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

然而在Rust中，由于所有权机制的存在，且从前面`CallFrame`定义可以看出我们局部变量槽位是按值持有的`Vec<Value>`，要同时在另一个地方创建其引用并不方便，为此我采用了1的做法：首先设计一个`UpValue`类型，通过`Rc<RefCell<T>>`来引用原变量，并在创建闭包的时候将要捕获的变量“升级”为`UpValue`，这个“升级”实际上就是移动到堆的过程：

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
// 无捕获：共享 VM 级空表，零分配
let ups = if info.captures.is_empty() {
    vm.empty_ups.clone()
} else {
    Rc::new(info.captures.iter().map(|src| match src {
        // 未升级则原地升级为 UpValue（移动到堆）
        CaptureSrc::Local(i) => frame.slot_cell(*i),
        // 传递捕获：直接共享外层闭包的单元
        CaptureSrc::Upvalue(j) => frame.ups[*j as usize].clone(),
        // 每个闭包实例独立的 this 单元，存入 obj 时回填
        CaptureSrc::This => Rc::new(RefCell::new(Value::Nil)),
    }).collect())
};
```

顺带一提，旧实现里查找变量未找到并不报错，而是预捕获一个`nil`单元，由此实现了类似JS的“作用域提升”机制。槽位化后这个语义改由“前向引用走全局表”保住：嵌套函数内、定义在使用之后的名字 resolve 为`Global`，顶层的`let`会双写一份到全局表接住它。下面这段代码，虽然`fn`创建的时候`x`还没有定义，但当该闭包调用的时候，**同一个作用域**里`x`已经有定义了，所以可以正确的输出`42`：

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

与JS一致，姊妹作用域的`let`不会发布到全局表，这段代码现在会明确报`undefined variable: x`。旧实现这里是静默的`nil`——静默比报错危险得多，这是我少数几次改语义而不是修 bug，改完反倒和JS对齐了。

#### 闭包调用阶段

使用捕获变量的行为与使用当前作用域的局部变量别无二致。进一步想想就会发现，捕获变量、函数参数和局部变量在用法上并无差别，只是存在覆盖关系，函数参数可以理解为函数体开头定义的局部变量，它会覆盖捕获的变量，而函数体中定义的局部变量会进一步覆盖函数参数。槽位化之后，调用时对捕获变量的处理简单到了只剩一次`Rc`自增：`ups`就是一份与闭包实例共享的单元表，`bind_params`把参数直拷进槽位，新帧即可投入使用。

作用域内，后续会发生两种情况：

1. 变量定义（可能覆盖捕获变量）：定义即占据一个新槽位，替换的是槽位下标处的值，不影响旧值自身，遮蔽是静态事实；
2. 变量修改：常规槽位直接写即可。对于捕获槽位，别忘了，它们存的是`UpValue(Rc<RefCell<T>>)`共享单元，写穿即可反馈到其他引用处，也包括实际定义它们的那个作用域。

体现在指令上，读写都是按槽位下标进行的，被捕获的槽位自动解包/写穿共享单元：

```rust
// 读槽位：捕获槽位解包 UpValue 单元
pub fn load_slot(&self, i: u16) -> Value {
    match self.slots.get(i as usize) {
        Some(Value::UpValue(cell)) => cell.borrow().clone(),
        Some(v) => v.clone(),
        None => Value::Nil,
    }
}

// 写槽位：捕获槽位写穿共享单元，保持捕获的可变性
pub fn store_slot(&mut self, i: u16, value: Value) {
    if let Value::UpValue(cell) = &self.slots[i as usize] {
        *cell.borrow_mut() = value;
    } else {
        self.slots[i as usize] = value;
    }
}
```

不过有个历史包袱值得一提。旧实现按名字在运行时解析，定义和赋值又同是`STORE(name)`指令，于是有这么一个bug，考虑如下代码：

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
    x ; 42（前向引用走了全局表，未报错——与 JS 的差异）
    [let x 24]
    x]]

[let x 42]

[fn]
```
:::

`fn()`内部`x;`语句处，JS应该报错`x`未定义，但旧实现在指令生成阶段会错误的判断`x`是一个捕获变量，执行到此处时`x`指向外层的`let x = 42`，随后`let x = 24`便失去了其定义的作用而变成了一个赋值语句，**错误的修改了外侧的`x`**。这里的问题在于变量作用域提升通常还隐含着一个作用域覆盖（提升）的规则：**如果一个变量在作用域中定义了，那么同一个作用域及下游作用域所有使用到该变量的地方始终应该“看到”该定义**。槽位化之后这类bug失去了发生的土壤：定义即新槽位，`[let x 24]`老老实实遮蔽，外层的`x`保持`42`不动。至于第一条`x`读到`42`而不是像JS那样报错——前向引用走全局表是“提升”语义的自然延伸，算语言差异而非缺陷了。

#### 尾调用优化和CPS转换

尾调用优化已经实现，且出乎意料地简单。`CALL`派发时看一眼下一条指令是不是`RET`——是则同帧复用：槽位清空后按新闭包布局重排，参数从栈顶逆序弹填（展开参数整包进槽），替换 upvalue 表，`sp`归零，跳转。十万层尾递归只增一个调用帧：

```rust
if is_tail_call {
    caller.slots.clear();
    caller.slots.resize(info.n_slots as usize, Value::Nil);
    // ... 参数按 ParamLayout 弹填（定参直填 / 展开参数整包）
    caller.ups = ups;
    caller.sp = 0;
}
```

CPS转换则仍然没有做。它原本是“作用域块即函数”时代的性能救命稻草，如今thunk已拆、尾调用已消，它的重要性降级了——暂时没有强烈的需求，留坑。

## 对象的实现

假如在虚拟机中，我们要实现`println`的功能，该怎么做？由于`println`涉及到系统接口，它通常是宿主环境注入的方法，那么我们设计一个`SYSCALL`指令是否就够用？还不够，因为我们一般会希望它的表现和其他函数一样，也能够作为一类函数传来传去，因此我们需要拓展一下虚拟机运行时值的定义，它不仅仅可以是一个闭包，也可能是一个`Syscall`：

```rust
#[derive(Debug, Clone, PartialEq)]
pub enum Function {
    ClosureMeta(Rc<ClosureInfo>), // compile time, PUSH_CLOSURE 的元信息
    Closure(Rc<ClosureInfo>, usize, Rc<Vec<Rc<RefCell<Value>>>>), // runtime, (info, ip, 共享 upvalue 单元表)
    Syscall(&'static str),
}

#[derive(Debug, Clone)]
pub enum Value {
    Bool(bool),
    Num(f64),
    Str(Rc<str>),

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

### 代理与原型链

虚拟机中并没有直接实现原型链，但提供了一种类似 JS `Proxy` 的拦截机制，使代理、只读、私有属性，乃至原型链继承都成为可能。

关键在于：点访问 `o.x` 在编译期就脱糖为属性访问，赋值 `o.x = v` 同理，一切成员访问最终都汇聚到 `get`/`set` 两个系统调用上——只要让它们能识别“代理对象”并改走自定义逻辑，就等于把查找赋值的控制权交给了用户。值得一提的是，`GET`/`SET`两条指令兜兜转转又回来了：早期版本靠它们触发对象上的 `__get__`/`__set__` 魔法键，有点类似运算符重载，统一`proxy`时移除；性能优化时发现一切成员访问都汇到syscall太亏，又把它们请了回来——现在是`Obj`的快速直访路径，遇到`Proxy`目标才回退到`get`/`set`内建的拦截逻辑。语义不变，快慢分开。

代理对象由 `proxy` 内置函数创建，同为运行时`Value`的一种：

```rust
pub enum Value {
    // ...
    Obj(Rc<RefCell<Object>>),
    Proxy {
        target: Rc<RefCell<Object>>,
        get: Option<Rc<RefCell<Function>>>,
        set: Option<Rc<RefCell<Function>>>,
    },
    // ...
}
```

`[proxy o 'get' /[t k] ... 'set' /[t k v] ...]` 把普通对象 `o` 包裹成代理，挂上可选的 `get`/`set` handler。访问代理时，`get`/`set` 不再直接读写底层 `HashMap`，而是把目标对象连同键（乃至值）交给对应 handler；没有挂 handler 的操作则透传到底层对象。

## 延续的实现

在不考虑性能的情况下，保存现场非常的简单粗暴：将整个调用栈复制一份即可，复制后和当前`pc`一起保存在延续对象中，而延续对象不过是一种另类的函数：

```rust
#[derive(Debug, Clone, PartialEq)]
pub enum Function {
    Closure(Rc<ClosureInfo>, usize, Rc<Vec<Rc<RefCell<Value>>>>), // runtime, (info, ip, upvalues)
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

## 标准库：prelude 与内建的收敛

`map`/`filter`/`fold`这些函数理应是库而不是指令。最直觉的做法是运行时读入一段 prelude 源码、编译、装载进全局表，但这里有个我踩过的坑：闭包值只携带指向指令数组的 ip 下标，而**所有指令必须位于同一个代码空间**（单一`Vec<Inst>`，槽位化架构的基本假设）——prelude 单独编译，装载函数返回后那段指令数组就被释放了，全局闭包的 ip 随即悬垂。所以 prelude 是**编译期拼接**：把 prelude 源码拼在用户源码前面一起编译，DELIMITER 段号、名字表、超指令融合都由同一次`emit()`统一处理。单步调试器也顺带受益：宿主可以查询`user_start()`拿到用户代码首指令的 pc，先把几百条 prelude 快进掉再交互单步。

哪些东西进 prelude、哪些留在内建，判据很朴素：**拿掉它之后，语言本身还能不能把它写出来**。`vec`就是参数包的恒等函数——`/[...]`是纯贪婪占位，不 PEEK、不限元数，整个参数包经编译器注册的`__args`引用，这顺带成了语言的 variadic 形态：

```scheme
[= vec /[...] __args]
[= mylist /[a ...] [vec a __args]] ; 定参 + 参数包
```

`slice`是`at`+`splice`的循环派生（负起点/越界从 panic 收敛为截断/空），`str`是`fold`加`+`的混合拼接（走同一个`Display`，输出与内建版逐字节一致）。剩下的内建都是拆不动的真原语：`print/println`是唯一的宿主IO通道，`at/put/len/splice`是数据访问核心，`substr`是唯一的字符串区间操作（没有字符串索引原语就拆不动它），`typeof/keys/obj/set/get/proxy`构成对象系（`get`/`set`还是`GET`/`SET`指令的回退路径），加上`callcc`、`js`/`await`和libm数学族。有个反面教材值得记一下：我曾以为`[... xs]`能绑定“剩余参数包”，实测它绑的是**末位元素**——`...`是弹性占位而非 rest 收集，`[let [... x] [vec 1 2 42]]`里`x = 42`，想拿整个参数包得用`__args`。

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

### 异步：await、回调跨界与 call_cb

`sleep`、`defer`曾一度是内建，对应 Web 环境的 `setTimeout`、`queueMicrotask`。后来我把整个异步层收敛成两个原语，它们降级成了普通函数——宿主无需注册任何 square 专有全局：

```scheme
[= sleep /[ms] [promisify 'setTimeout' /[] nil ms]]
[= defer /[f] [js 'queueMicrotask' f]]
```

Promise 约定的入口是**await**：`[await 'path' arg1 ...]`（实参散传，vec 值作为单实参即数组）调用宿主函数并 park 等待。参数序列化成 JSON 写进线性内存，经`host.js_await_call`导入交给宿主；宿主解析点路径、展开调用，结果是 Promise 则`.then/.catch`，同步值则 microtask 化立即回调。回调的入口统一是导出的`call_cb(id, ptr, len)`：实参数组 JSON 写回线性内存，唤醒 id 对应的任务，投递的值就是 await 的结果。

回调约定的入口是**promisify**：回调风格宿主函数的 Promise 化——实参里的闭包标记回调位置（写在哪个参数位，唤醒句柄就注入到哪），宿主调用它即以其实参为结果（多实参以 vec 进首参）。标记闭包要带个哑体（`/[] nil`）：`fn -> / expand expr` 会贪婪吞掉后随表达式作 body，不带的话下一个实参会被吞进闭包里——这是个实测踩过的坑。

其三是**闭包跨界**：square 闭包作为实参传给 JS 时，序列化为`{"__sq_cb": id}`句柄，宿主把它换成 JS 函数——调用它就是一次`call_cb`唤醒。事件/Promise 型 API 天然契合；宿主异常和 Promise 拒绝以`{"__sq_err": msg}`回传，客机转成语言级错误，`try`可以直接捕获。

至于「挂起」本身，它还是 **VM 状态保存**——和上文「延续的实现」同一套 unwind/rewind，区别只在于状态由调度器持有、由宿主事件循环驱动恢复：任务就是一段`UnwindFrame`快照（连同活动的 try handler 栈一起快照，任务交错时各自的 try 域互不串扰），`tick`把队头任务的快照 rewind 回 VM 续跑到下一个 park 或完成。调试这套东西时挖出过三个颇有普遍价值的 bug——哨兵 ra 覆盖了恢复中闭包帧的活返回地址、闭包任务的 ra 默认值引发“从程序头重跑”的级联、同步投递赶在 park 完成之前——都记在仓库的 OPTIMIZATION.md 里了。

这套「宿主事件循环 + 延续 unwind/rewind」的异步运行时设计（任务、就绪队列、宿主事件循环驱动等）在 [Rust 与 Wasm 中的异步](./Snippets/Rust-Wasm-Async.md) 里有完整阐述；square 相对那套`Future`/`Waker`模型的取舍（续延快照代替状态机、`call_cb`合一唤醒）也记在了那篇文章的末节。

::: details 早期的 JSPI 方案（已弃用）
早期版本用 [JSPI](https://github.com/WebAssembly/js-promise-integration/blob/main/proposals/js-promise-integration/Overview.md) 实现：以 `WebAssembly.Suspending` 包裹导入的异步方法、`WebAssembly.promising` 包裹调用它的导出，WASM 执行到该方法时挂起、异步完成后再恢复。但 JSPI 当时仍在测试阶段（Chrome 需开 flag，详见 v8 [这篇博客](https://v8.dev/blog/jspi)），且依赖宿主做 Promise 包装，不如「事件循环 + 续延」纯粹，故弃用。
:::

::: details 中间的 wake_by_id 方案（也已收敛）
后来宿主导入是`js_sleep(id, ms)`/`js_queue_microtask(id)`，唤醒走专门的`wake_by_id(id)`。统一为`call_cb`后，“裸唤醒”只是它零实参的特例，而带实参的唤醒让回调传值、await 结果投递共用同一入口——宿主侧的桥接代码因此少了一半。
:::
