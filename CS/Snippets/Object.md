# You don't need an object

基于对象代理和原型链的继承可以进一步引申，例如在代理这一层做更细粒度的控制以实现只读属性、私有属性等。甚至“对象”这个语义都不是必须的，用getter和setter函数表达即可。

```js
makeObject = (predecessor) => (prop, value) => (value !== undefined  // 根据value是否为undefined判断是set还是get
  ? makeObject((p) => (p === prop ? value : predecessor(p)))         // set其实创建了一个新的“对象”
    : predecessor(prop));

get = (obj, prop) => obj(prop);
set = (obj, prop, value) => obj(prop, value);

// proto = { foo: 42 }
proto = makeObject(
  (prop) => (prop === 'foo' ? 42 : undefined),
  );

// o = {}
o = makeObject((prop) => undefined);

// self = new Proxy(o, {/*...*/})
self = makeObject((prop) => (get(o, prop) !== undefined
  ? get(o, prop)
    : get(proto, prop)));

console.log(get(self, 'foo')); // 42
self = set(self, 'foo', get(self, 'foo') - 18); // self.foo = self.foo - 18
console.log(get(self, 'foo')); // 24
console.log(get(proto, 'foo')); // 42
```
