# Web端二进制数据处理

## `ArrayBuffer`、`DataView`和`TypedArray`

这三个的概念还是比较清晰的，`ArrayBuffer`代表了一块原始内存，以字节为单位；`DataView`则代表对这块数据的解释方式，同样一块内存区域上的二进制bit，我们可以解释为`int8`、`int32`、`uint32`、`float32`等；`TypedArray`自身并不是一个类型，而是对`Uint8Array`、`Float32Array`这些类的统称。例如，我们可以创建一块8byte的内存，然后利用`DataView`给内存中部分区域赋值，这里将前16位设置成`1100 0001 0100 1100`，其他没有赋值的部分默认会初始化为`0`，然后对前32位按照浮点数解释，ECMA Script遵循IEEE754标准，因此这个数是$-12.75$。

```js
const buffer = new ArrayBuffer(8);
const view = new DataView(buffer)

view.setUint16(0, 0b1100000101001100);
console.log(view.getFloat32(0)); // -12.75

const f = new Float32Array(buffer, 0, 1); // 取buffer位置0处的1个32位浮点数，即将buffer前32位解释为浮点数
console.log(f[0]); // 2.753411352551833e-41
```

在使用`DataView`的时候，要特别注意大端和小端的问题。上面`f[0]`的值是`2.753411352551833e-41`，因为`view.setUint16`在第三个参数不设为`true`的时候默认按照大端方式放置，而`new Float32Array`的时候按照当前机器的大小端（我的机器是小端）方式解读`buffer`中的`-12.75`，因此得到这个奇怪的数。`-12.75`是`C1H 4CH 00H 00H`，我们手动按照小端方式低地址到高地址的顺序排好`00H 00H 4CH C1H`，再创建`f`就可以得到`-12.75`：

```js 
view.setUint32(0, 0x4cc1);

new Float32Array(buffer)[0]; // 按机器大小端解读，-12.75
view.getFloat32(0);          // 按大端解读，2.753411352551833e-41
view.getFloat32(0, true);    // 按小端解读，-12.75
```

详细看看“奇怪的数”的来源，大端解读低地址最高有效位，因此有`00H 00H 4CH C1H`。按照IEEE754浮点数标准，符号位是0，阶码全0，这是一个非规格数，因此阶码值固定为$-126$，而且小数点前面没有规格数默认省略的$1$。尾数部分还剩下23位，是`000 0000 0100 1100 1100 0001`，故最终的值就是$(2^{-9}+2^{-12}+2^{-13}+2^{-16}+2^{-17}+2^{-23}) * 2^{-126} = 2.753411352551833e-41$。

利用这个特性可以检测当前机器是大端还是小端，256等于`01H 00H`，按照小端存放从低地址到高地址依次是`00H 01H`，因此如果机器按照大端方式解读，这个数将是`1`：

```js
// see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView
function isLittleEndian() {
  const buffer = new ArrayBuffer(2);

  new DataView(buffer).setInt16(0, 256, true /* littleEndian */);

  // new DataView(buffer).getInt16(0); // 按照大端解读将是1

  // Int16Array uses the platform's endianness.
  return new Int16Array(buffer)[0] === 256;
}
```


除了`ArrayBuffer`之外，还有一个`SharedArrayBuffer`，它和`ArrayBuffer`的区别在于`Transferable`。通俗的说就是`ArrayBuffer`一旦作为`postMessage`的参数传递给其他线程（`web worker`）之后，本线程关联的内存资源将被`detach`，资源被`attach`给其他线程了，这时在本线程调用`buffer.byteLength`将得到`0`。而`SharedArrayBuffer`作为`postMessage`的参数时，双方都持有这块内存，故通常需要使用`Atomic`来操作该内存区域以防止竞态。~然后又造了一遍锁和信号量的轮子，谁说js没有多线程的~。出于浏览器安全性的考虑，使用`SharedArrayBuffer`还需要注意[跨域问题](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)。

## 优秀的“中间人”

*   `Response`可以接受`Blob`、`BufferSource`（指`ArrayBuffer`、`TypedArray`等）、`FormData`、`ReadableStream`、`USVString`等作为入参，通过`text`、`arrayBuffer`、`formData`、`blob`输出。

*   `FileReader`可以接受`Blob`、`File`作为输入，通过`readAsArrayBuffer`、`readAsBinaryString`、`readAsDataURL`、`readAsText`作为输出。

*   `Blob`可以通过`ArrayBuffer`、`DOMString`构造，通过`stream`、`text`、`arrayBuffer`方法输出。

## 编码转换

可以考虑`TextEncoder`和`TextDecoder`，但是存在兼容性问题，需考虑polyfill，或者用iconv。

```js
const str = [
  206, 210, 179, 162, 202, 212, 210, 187, 207, 194, 106, 115, 180, 166, 192, 237, 103, 98, 107,
];
const textDecoder = new TextDecoder('gbk');
console.log(textDecoder.decode(new Uint8Array(str))); // 我尝试一下js处理gbk
```

```js
const textEncoder = new TextEncoder();
const array = textEncoder.encode('我'); // [230, 136, 145]
const buffer = new Uint8Array(array);
const rsp = new Response(buffer);
rsp.text().then(console.log); // 我
```

## 示例

### `string` 转 `Blob`

```ts
const str2Blob = (str: string): Blob => new Blob(str.split(''));
```

### `Blob` 转 `string`

```ts
const blob2str = (blob: Blob) => blob.arrayBuffer().then((ab) => new Response(ab)).then((response) => response.text());
```

### `Blob` 转 `Data URL`/`string`/`ArrayBuffer`，可通过`FileReader`

```ts
const blob2DataUrl = (blob: Blob | File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();

  reader.onload = (e) => resolve(e.target?.result);
  reader.onerror = (e) => reject(e);

  reader.readAsDataURL(blob);
  // reader.readAsText(blob);
  // reader.readAsArrayBuffer(blob);
  // reader.readAsBinaryString(blob);
});
```

### `Blob` 转 `ObjectURL`

```ts
const blob2ObjectUrl = (blob: Blob | File) => URL.createObjectURL(blob);
```

url不用的时候应通过`URL.revokeObjectURL`回收。

### `URL` 转 `Blob`/`ArrayBuffer`/`string`

```ts
// eslint-disable-next-line arrow-body-style
const url2Blob = (url: string) => fetch(url).then((response) => {
  // return response.arrayBuffer();
  // response.text();
  return response.blob();
});
```

## 特别的

### xhr

```js
const request = new XMLHttpRequest()
request.responseType = 'arraybuffer'
// request.responseType = 'blob'
```

### File

```html
<input type="file" id="input">
```

使用`document.getElementById('input').files[0]`得到一个`File`对象

### Canvas

Canvas可以通过`toDataURL`和`toBlob`获取到图像信息。甚至可以在canvas中实时处理当前的`video`内容，通过`ctx.createImageData`、`ctx.getImageData`和`ctx.putImageData`。
