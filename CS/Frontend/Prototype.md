# Javascript和Lua中的原型

## JS的原型机制

`prototype`和`__proto__`傻傻分不清楚？MDN的[这篇文档](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Objects/Object_prototypes)有一些介绍。其实只要记住一句话就行了，**`prototype`是一个函数作为构造函数时所拥有的一个对象，其上的属性会被实例继承。例如`Object`、`Function`这些对象就都有一个`prototype`，而从这些对象继承来的属性则放在实例对象的`__proto__`上**。

:::info
由于`__proto__`是一个已经废弃的属性，下文我们使用官方推荐的API`Object.getPrototypeOf`和`Object.setPrototypeOf`来操作之。
:::

```js
function Base() {}

Base.prototype.sth = 42;

const foo = new Base();

console.log(foo.sth); // 42
```

要实现继承，核心是让派生类的`prototype`上具有的属性与基类`prototype`上的相同，可以直接设置相等，但更好的方式是设置原型链，以便在`Derived2.prototype`上查找属性时，可以沿着链向上到`Base.prototype`上查找。

```js
function Derived2() {}

// 比 Derived2.prototype = Base.prototype 更好
Object.setPrototypeOf(Derived2.prototype, Base.prototype);

const baz = new Derived2();

console.log(baz.sth); // 42
```

`class`语法不过是函数写法的语法糖：

```js
class Derived extends Base {}

const bar = new Derived();

console.log(bar.sth); // 42
console.log(Object.getPrototypeOf(Derived.prototype) == Base.prototype); // true
```

现在我们有了`Base`、`Derived`、`Derived2`、`foo`、`bar`、`baz`以及它们或有或无的`__proto__`与`prototype`属性对象，这些对象之间有哪些关系呢？

首先每个实例的`__proto__`都等于基类的`prototype`：

```js
console.log(Object.getPrototypeOf(foo) === Base.prototype); // true
console.log(Object.getPrototypeOf(bar) === Derived.prototype); // true
console.log(Object.getPrototypeOf(baz) === Derived2.prototype); // true
```

其次想到函数的原型一层层往上找最终应该（！）是`Function.prototype`，同理对象的原型层层往上应得到`Object.prototype`，上文出现的基类本质是函数，而实例是创建出来的对象，因此应该有：

```js
function getTopLevelPrototypeOf(target) {
  let proto = target;

  while (true) {
    const newProto = Object.getPrototypeOf(proto);

    if (newProto && newProto !== proto) {
      proto = newProto;
    } else {
      return proto;
    }
  }
}

console.log(getTopLevelPrototypeOf(Base) === Function.prototype); // false !!!
console.log(getTopLevelPrototypeOf(Derived) === Function.prototype); // false !!!
console.log(getTopLevelPrototypeOf(Derived2) === Function.prototype); // false !!!

console.log(getTopLevelPrototypeOf(foo) === Object.prototype); // true
console.log(getTopLevelPrototypeOf(bar) === Object.prototype); // true
console.log(getTopLevelPrototypeOf(baz) === Object.prototype); // true
```

这三个`false`有点出乎意料，仔细一想就能明白，`Function.prototype`是一个对象，因此它还有上一层指向`Object.prototype`，而`Object.getPrototypeOf(Object.prototype)`就是货真价实的`null`了：

```js
console.log(Object.getPrototypeOf(Base) === Function.prototype); // true
console.log(Object.getPrototypeOf(Function.prototype) === Object.prototype); // true
console.log(Object.getPrototypeOf(Object.prototype) === null); // true
```

写这篇博客的起因是遇到了一个BUG，在试图修改并重用对象的`__proto__`时，不小心污染了`Function.prototype`。因此有这种需求的话要注意两点，一要避免丢失原型上本来有的东西，二要避免污染全局空间：

```js
// Base.__proto__不再是Function.prototype，意味着来自Function.prototype的bind、apply等方法都丢失了
Object.setPrototypeOf(Base, { x: 2 });

// Function.prototype.x = 2，污染了全局空间
Object.assign(Object.getPrototypeOf(Base), { x: 2 });
```

一种解决方法是先将对象的`__proto__`克隆一份，在克隆出来的原型上进行修改，最后再重设为对象的原型：

```js
const proto = Object.getPrototypeOf(Base);
const newProto = Object.assign(Object.create(proto), { x: 2 });

Object.setPrototypeOf(Base, newProto);
```

这里使用`Object.create`也是必要的，因为常见的对象拷贝的方法不会拷贝诸如`Function.prototype`上的`bind`等固有属性（可以使用`Object.getOwnPropertyNames`查看固有属性）：

```js
p = Object.getPrototypeOf(Base);
x = {...p};
y = Object.assign(Object.create(null), p);
z = Object.create(p);

p.bind; // ƒ bind() { [native code] }
x.bind; // undefined
y.bind; // undefined
z.bind; // ƒ bind() { [native code] }
```

## Lua中的对比

最近写了一点Lua，不妨做个类比。在Lua中有个与原型对象很相似的东西叫做元表（metatable），一个`table`有了元表，我们就可以通过在元表上定义一些元方法（metamethods）来控制`table`的行为。

这里的关键在于元表上的元方法，只有定义合适的元方法才能让元表起到和原型对象类似的作用。例如沿着原型链向上的查找机制，如果仅仅这样写是不够的：

```lua
local a = { x = 2 }
local b = {}
local c = {}

setmetatable(c, b)
setmetatable(b, a)

print(c.x) -- nil
```

在Lua中，get和set涉及到的元方法是`__index`和`__newindex`，例如要让对`c.x`的访问能够向上查找到`a`，只需要给`b`和`a`添加`__index`方法即可：

```lua
local a = { x = 2 }
local b = {}
local c = {}

setmetatable(c, b)
b.__index = b
setmetatable(b, a)
a.__index = a

print(c.x) -- 2
```

首先在`c`上找`.x`，没有，但注意到`c`有一个元表 `b`，同时这个元表有一个`__index`方法，其值是一个`table`。`__index`的值可以是set函数或者`table`，是`table`的时候会将该值作为新的查找对象，于是就在`b`上找`.x`，并依次向上……

再来看如何实现继承，《Programming in Lua》在讲到[继承](https://www.lua.org/pil/16.2.html)的时候有这么一段代码：

```lua
Account = {balance = 0}

function Account:new (o)
  o = o or {}
  setmetatable(o, self)
  self.__index = self
  return o
end

function Account:deposit (v)
  self.balance = self.balance + v
end

SpecialAccount = Account:new()
s = SpecialAccount:new()

s.deposit(1)
```

这里用词`new`其实很迷惑，实际上它的语义更像是派生，应该叫做`derive`、`extend`啥的，因为这里`SpecialAccount = Account:new()`的作用和`class SpecialAccount extends Account`差不多，而`balance`更像是一个静态属性。各实例在调用修改`self.balance`的时候能够互不干扰，完全是因为原型链的查找顺序是先从自己开始的，即首次访问`self.balance`的时候发现自己的`o`上没有，于是从metatable中拿到`Account`的`balance`，然后在赋值的时候在自己的`o`上创建了一个副本，以后`self.balance`操作的是自己的了。

将静态方法和实例方法混为一谈有点不符合我们对OOP的认知，我们更习惯的`new`方法类似这样：

```lua
Account = {balance = 0}

function Account:new()
  -- implementation
end

function Account:derive(o)
  -- implementation
end

function Account:deposit (v)
  self.balance = self.balance + v
end

SpecialAccount = Account:derive() -- 作用等同于 class SpecialAccount extends Account

s1 = Account:new()
s2 = SpecialAccount:new()

s1:deposit(1)
s2:deposit(2)

s1:new() -- error, no such method "new"
```

那么具体要怎么实现`new`方法和`derive`方法呢？可以从JS中受到启发，还是把握住“派生类的`prototype`和父类的`prototype`相同，实例的`__proto__`和构造类的`prototype`相同”这句话。

首先制作一个`prototype`，将类方法和实例方法区分开来：

```lua
Account.prototype = {balance = 0}

function Account.prototype:deposit(v)
  self.balance = self.balance + v
end
```

> 这里我们依然保留了利用原型链查找机制的静态默认值`{balance = 0}`，如果要更OOP一点的话，可以在下面的构造函数`new`中设置`o.balance = 0`。

创建实例的要点是让实例的`__proto__`等同于`Account.prototype`，并且能够向上在`__proto__`上查找属性：

```lua
function Account:new() -- 注意不是Account.prototype:new
  local o = {
    __proto__ = self.prototype
  }

  setmetatable(o, o.__proto__)
  self.prototype.__index = self.prototype -- o.__proto__.__index = o.__proto__

  return o
end
```

创建派生类的要点是让派生类获取`Account`上面的方法，参考之前的`new`，同时补充了“让派生类的`prototype`和基类`prototype`一致”的内容，参考前面的JS代码`Object.setPrototypeOf(Derived2.prototype, Base.prototype)`：

```lua
function Account:extend()
  local o = { prototype = { __proto__ = self.prototype } }

  setmetatable(o.prototype, o.prototype.__proto__)
  self.prototype.__index = self.prototype

  setmetatable(o, self)
  self.__index = self

  return o
end
```

完整的代码如下：

```lua
Account = { prototype = { balance = 0 } }

function Account.prototype:deposit(v)
  self.balance = self.balance + v
  print(self.balance)
end

function Account:new()
  -- 目标 instance.__proto__ = this.prototype
  local o = {
    __proto__ = self.prototype
  }

  setmetatable(o, o.__proto__)
  self.prototype.__index = self.prototype

  return o
end

function Account:extend()
  -- 目标 Derived.prototype.__proto__ = this.prototype
  local o = { prototype = { __proto__ = self.prototype } }

  -- 下面这两行等价于 o.prototype = self.prototype:new()
  setmetatable(o.prototype, o.prototype.__proto__)
  self.prototype.__index = self.prototype

  -- 继承Account的类方法
  setmetatable(o, self)
  self.__index = self

  return o
end

local s1 = Account:new()

print(s1.__proto__ == Account.prototype) -- true

SpecialAccount = Account:extend() -- 作用等同于 class SpecialAccount extends Account

print(SpecialAccount.prototype.__proto__ == Account.prototype) -- true

local s2 = SpecialAccount:new()

s1:deposit(1) -- 1
s2:deposit(2) -- 2

-- s1:new() -- error: attempt to call method 'new' (a nil value)

Account.prototype.foo = function() print(42) end

s2:foo() -- 42
```

注意区分`Account`和`Account.prototype`上的方法，前者是给派生类提供的，后者是给实例提供的。

上述实现有个微妙的问题，我还没有想好是从继承机制还是`.resolve`的实现上解决比较好。在JS中，假如我们继承`Promise`类，会发现`MyPromise.resolve`返回的对象也顺理成章地变成了`MyPromise`的实例：

```js
class MyPromise extends Promise{}

const p = MyPromise.resolve();

console.log(Object.getPrototypeOf(p) == MyPromise.prototype); // true
console.log(Object.getPrototypeOf(p) == Promise.prototype); // false
```

但在Lua中，假如我们像下面这样实现`.resolve`方法的话，`MyPromise:resolve`返回的将依然是`Promise`的实例：

```lua
local Promise = {prototype = {}}

-- function Promise:new
-- function Promise:extend 
-- function Promise.prototype:then
-- ...

function Promise:resolve(any)
  return Promise:new(function(res) res(any) end)
end

local MyPromise = Promise:extend()

local p = MyPromise:resolve()

print(p.__proto__ == MyPromise.prototype) -- false
print(p.__proto__ == Promise.prototype) -- true
```
