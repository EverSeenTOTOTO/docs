# Web端二进制数据处理

## `ArrayBuffer`、`DataView`和`TypedArray`

这三个的概念还是比较清晰的，`ArrayBuffer`代表了一块原始内存，以字节为单位；`DataView`则代表对这块数据的解释方式，同样一块内存区域上的二进制bit，我们可以解释为`int8`、`int32`、`uint32`、`float32`等；`TypedArray`自身并不是一个类型，而是对`Uint8Array`、`Float32Array`这些类的统称。

在使用`DataView`的时候，要特别注意大端（Big Endian）和小端（Little Endian）的问题。`TypedArray` 会使用当前操作系统的 Endianness，而 `DataView` 则可以手动指定，默认为大端。

例如，对于一个 16-bit 的整数 `0x0102` (十进制的 258):
- **Big Endian**: 高位字节在前，低位字节在后。内存中存储为 `01 02`。
- **Little Endian**: 低位字节在前，高位字节在后。内存中存储为 `02 01`。

如果我们在一个采用小端模式的机器上，以大端模式写入数据，然后以系统默认的小端模式去读，就会产生非预期的结果。

```js
const buffer = new ArrayBuffer(2);
const view = new DataView(buffer);

// 默认以大端模式写入 0x0102
view.setUint16(0, 0x0102);

// DataView 默认以大端模式读取，结果正确
console.log(view.getUint16(0).toString(16)); // "102"

// TypedArray 会使用系统默认的 Endianness（大部分现代设备是小端）
// 小端模式下，内存中的 `01 02` 会被解释为 `0x0201` (十进制 513)
console.log(new Uint16Array(buffer)[0].toString(16)); // "201"
```

利用这个特性可以检测当前机器是大端还是小端：

```js
// see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DataView
function isLittleEndian() {
  const buffer = new ArrayBuffer(2);
  // 以小端模式写入 16-bit 整数 256 (0x0100)
  new DataView(buffer).setInt16(0, 256, true /* littleEndian */);
  // 在小端机器上，内存布局为 00 01。
  // Int16Array 使用平台的 Endianness 读取。
  // 如果平台是小端，它会正确读取为 256。
  // 如果平台是大端，它会把 `00 01` 读作 1。
  return new Int16Array(buffer)[0] === 256;
}
```

除了`ArrayBuffer`之外，还有一个`SharedArrayBuffer`，它和`ArrayBuffer`的区别在于`Transferable`。通俗的说就是`ArrayBuffer`一旦作为`postMessage`的参数传递给其他线程（`web worker`）之后，本线程关联的内存资源将被`detach`，资源被`attach`给其他线程了，这时在本线程调用`buffer.byteLength`将得到`0`。而`SharedArrayBuffer`作为`postMessage`的参数时，双方都持有这块内存，故通常需要使用`Atomic`来操作该内存区域以防止竞态。出于浏览器安全性的考虑，使用`SharedArrayBuffer`还需要注意[跨域问题](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)。

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
const str2Blob = (str: string): Blob => new Blob([str]);
```

### `Blob` 转 `string`

```ts
const blob2str = (blob: Blob): Promise<string> => blob.text();
```

### `Blob` 转 `Data URL`/`string`/`ArrayBuffer`，可通过`FileReader`

```ts
const blob2DataUrl = (blob: Blob | File): Promise<string> => {
  const reader = new FileReader();
  reader.readAsDataURL(blob);
  // reader.readAsText(blob);
  // reader.readAsArrayBuffer(blob);
  return new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
};
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
