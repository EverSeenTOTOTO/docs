# JavaScript 和 Lua 中的原型继承

原型继承是一种编程模式，其中对象可以直接从其他对象继承属性和方法。与基于类的继承（如 Java 或 C++）不同，它不依赖于类的蓝图，而是通过一个“原型”对象来克隆和扩展。JavaScript 和 Lua 都采用了这种灵活的继承模型，但实现方式各有特色。本文将深入探讨并比较这两种语言中的原型机制。

## JavaScript 的原型机制

在 JavaScript 中，原型是理解对象和继承的核心。

### 核心概念：`prototype` 与 `__proto__`

这个概念可以用一句话概括：<Notation>实例的 `__proto__` 指向其构造函数的 `prototype`</Notation>。

-   **`prototype`**: 每个函数（Function）都有一个特殊的属性叫做 `prototype`，它是一个对象。这个对象包含了希望由该函数创建的所有实例共享的属性和方法。
-   **`__proto__`**: 每个对象实例都有一个 `__proto__` 属性，它指向创建该实例的构造函数的 `prototype` 对象。当试图访问一个对象的属性时，如果对象本身没有，解释器就会沿着 `__proto__` 链向上查找。

:::info
`__proto__` 已被废弃。现在推荐使用 `Object.getPrototypeOf()` 和 `Object.setPrototypeOf()` 来访问和设置对象的原型。
:::

### `new` 操作符与手动实现继承

`new` 关键字为我们自动处理了原型链接。

```js
function Base() {}

// 在 Base 的“蓝图”上添加一个属性
Base.prototype.sth = 42;

// `new` 创建一个新对象，并将其 __proto__ 指向 Base.prototype
const foo = new Base();

// 访问 foo.sth 时，foo 本身没有，于是沿着原型链找到 Base.prototype.sth
console.log(foo.sth); // 42
```

我们可以将 `new` 看作语法糖，手动实现这个过程：

```js
function Base() {}
Base.prototype.sth = 42;

const foo = {}; // 创建一个空对象

// 手动将 foo 的原型链接到 Base.prototype
Object.setPrototypeOf(foo, Base.prototype);

console.log(foo.sth); // 42
```

### `class` 语法糖

ES6 的 `class` 语法让 JavaScript 看起来更像传统的面向对象语言，但它本质上仍然是原型继承的语法糖。`extends` 关键字会自动处理派生类和基类原型之间的链接。

```js
class Base {
  constructor() {
    this.sth = 42;
  }
}

class Derived extends Base {}

const bar = new Derived();

console.log(bar.sth); // 42

// `extends` 的关键在于下面这行代码
// 它将派生类的 prototype 的原型（__proto__）指向了基类的 prototype
console.log(Object.getPrototypeOf(Derived.prototype) === Base.prototype); // true
```

Desugar 之后的样子：

```js
function Base() {}
Base.prototype.sth = 42;

function Derived() {}

// 这是实现继承的关键：将派生类的原型链连接到基类的原型上
// 这比 `Derived.prototype = Base.prototype` 更好，因为它保留了派生类自己的 prototype 对象
Object.setPrototypeOf(Derived.prototype, Base.prototype);

const bar = new Derived();

console.log(bar.sth); // 42
```

:::tip
某种意义上，我们可以将 `Derived.prototype` 看成是 `Base` 的实例，因为 `Derived.prototype.__proto__` 和 `(new Base()).__proto__` 都指向 `Base.prototype`。<Notation>派生类的`prototype`的`__proto__`指向父类的`prototype`。</Notation>因此，`Derived.prototype = new Base()` 也是一种（尽管有些过时）实现继承的方式。
:::

### 原型污染的风险与防范

在动态修改原型时，需要特别小心，既要避免丢失原有功能，也要避免污染全局对象。

```js
// 错误做法 1: 完全替换原型，导致丢失原有方法（如 .bind, .apply）
// Base.__proto__ 不再是 Function.prototype
Object.setPrototypeOf(Base, { x: 2 });

// 错误做法 2: 直接修改 Function.prototype，污染了全局空间
// 所有函数都会被加上 x: 2
Object.assign(Object.getPrototypeOf(Base), { x: 2 });
```

正确的做法是创建一个继承自原始原型的**新原型对象**，然后进行修改：

```js
// 获取原始原型
const proto = Object.getPrototypeOf(Base);
// 创建一个新对象，其原型是 `proto`，并添加新属性
const newProto = Object.assign(Object.create(proto), { x: 2 });

// 将 Base 的原型设置为这个新创建的对象
Object.setPrototypeOf(Base, newProto);
```

这里 `Object.create(proto)` 是关键，它能确保新的原型对象仍然链接到原始的原型链上，从而继承 `bind` 等固有属性。

## Lua 中的元表与继承

Lua 没有内置的“原型”概念，但通过其强大的**元表（metatable）**机制，可以实现同样灵活的继承。

### 元表（Metatables）与 `__index`

元表是一个普通的 Lua table，用于定义另一个 table 在特定操作下的行为。要实现原型继承，关键在于 `__index` 元方法。

当你在一个 table 中查找一个不存在的键时，Lua 会检查该 table 是否有元表，以及该元表是否有一个 `__index` 字段。

-   如果 `__index` 是一个**函数**，Lua 会调用它。
-   如果 `__index` 是一个**table**，Lua 会在该 table 中继续查找。这就是实现原型链的关键。

```lua
local a = { x = 2 }
local b = {}
local c = {}

setmetatable(c, b) -- c 的元表是 b
setmetatable(b, a) -- b 的元表是 a

-- 此时查找失败，因为我们没有告诉 Lua 如何沿着链查找
print(c.x) -- nil
```

为了让查找能够“向上”传递，我们需要设置 `__index`：

```lua
local a = { x = 2 }
local b = {}
local c = {}

-- 当在 b 中找不到键时，去 a 中查找
b.__index = a
setmetatable(c, b)

-- 当在 c 中找不到键时，去 b 中查找，b 又会委托给 a
print(c.x) -- 2
```

我们可以封装一个辅助函数，使其行为更像 JavaScript 的 `setPrototype`：

```lua
local function setPrototype(t, p)
  p.__index = p
  setmetatable(t, p)
end
```

### 在 Lua 中实现类继承

《Programming in Lua》提供了一个经典的继承实现，但其 `new` 的命名容易引起误解。

```lua
-- 基类
Account = {balance = 0}

-- 这个 "new" 函数更像是 "extend" 或 "derive"，它创建了一个继承自 Account 的新类
function Account:new (o)
  o = o or {}
  setmetatable(o, self)
  self.__index = self
  return o
end

-- 实例方法
function Account:deposit (v)
  self.balance = self.balance + v
end

-- SpecialAccount 是一个继承了 Account 的新“类”
SpecialAccount = Account:new()
-- s 是 SpecialAccount 的一个实例
s = SpecialAccount:new()

s:deposit(1)
```

为了让代码更符合我们对 `new`（创建实例）和 `extend`（创建子类）的直觉，我们可以借鉴 JS 的思想，将类方法和实例方法（原型）分离开。

```lua
-- 辅助函数
local function setPrototype(t, p)
  setmetatable(t, p)
  p.__index = p
end

-- 1. 定义基类和它的 prototype
Account = { prototype = { balance = 0 } }

function Account.prototype:deposit(v)
  self.balance = self.balance + v
  print(self.balance)
end

-- 2. 定义类方法 `new`，用于创建实例
function Account:new()
  local o = {}
  -- 实例的 __proto__ 指向类的 prototype
  setPrototype(o, self.prototype)
  return o
end

-- 3. 定义类方法 `extend`，用于创建子类
function Account:extend()
  -- 创建一个新类，其 prototype 是基类的一个实例
  local o = { prototype = self:new() }
  -- 获取Account上面的方法
  setPrototype(o, self)
  return o
end

-- --- 使用 ---

-- 创建实例
local s1 = Account:new()
print(getmetatable(s1) == Account.prototype) -- true

-- 创建子类
SpecialAccount = Account:extend()
print(getmetatable(SpecialAccount.prototype) == Account.prototype) -- true

-- 创建子类的实例
local s2 = SpecialAccount:new()

s1:deposit(1) -- 1
s2:deposit(2) -- 2

-- 在原型上添加新方法，所有实例（包括子类的实例）都能访问
Account.prototype.foo = function() print(42) end
s2:foo() -- 42
```

<img src="./prototype.svg" />

## 总结：JS 与 Lua 的异同

| 特性 | JavaScript | Lua |
| :--- | :--- | :--- |
| **核心机制** | `prototype` 属性和 `__proto__` 链 | `metatable` 和 `__index` 元方法 |
| **实现方式** | 语言内置，语法更明确 | 开发者通过元表手动实现，更灵活 |
| **语法糖** | `class`, `extends` | 无，完全依赖 table 和函数 |
| **生态** | 继承模式相对标准化 | OOP 实现模式多样，取决于库或框架 |

::: tip
[这里](https://github.com/EverSeenTOTOTO/eventloop-in-lua/blob/main/src/class.lua)有基于本文沉淀的一套 Lua 原型链实现，支持 `new`、`extend`、`isInstance`、`isDerived` 等方法。
:::
