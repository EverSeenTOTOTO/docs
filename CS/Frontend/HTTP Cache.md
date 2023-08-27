# HTTP缓存

1.  Expires：使用确定的时间而非通过指定经过的时间来确定缓存的生命周期。由于时间格式难以解析，以及客户端服务端的时钟差异，目前更多的是使用`Cache-Control`的`max-age`来指定经过的时间。

2.  Cache-Control

    1.  `max-age`：以秒为单位，代表缓存在什么时间后会失效，从服务端创建报文算起；
    2.  `no-store`：不要将响应缓存在任何存储中；
    3.  `no-cache`：允许缓存，但无论缓存过期与否，使用缓存前必须去服务端验证，一般会配合ETag和Last-Modified使用：如果请求的资源已更新，客户端将收到`200 OK`响应，否则，服务端应返回`304 Not Modified`；
    4.  `must-revalidate`：允许缓存，在缓存过期的情况下必须去服务端验证，看看服务端资源是否有变化，因此一般与`max-age`配合使用；
    5.  `public`：响应可以被任何缓存区缓存，包括共享缓存区；
    6.  `private`：缓存内容不可与其他用户共享，一般用于有cookie的个性化场景；
    7.  `immutable`：资源不会变，无需验证；
    8.  `proxy-revalidate`：过时的控制代理缓存的技术。

3.  If-Modified-Since

    客户端缓存过期了也未必就要立即丢弃，很可能服务端资源没变，这时可以简单刷新下客户端缓存的生命周期而不必重新传输数据，即所谓的“重新验证（revalidate）”。具体实现方式是在请求时带上`If-Modified-Since`及之前缓存下来的`Last-Modified`时间，服务端将返回200或304指示是否需要刷新。

    由于`If-Modified-Since`和`Last-Modified`都是时间戳格式，与Expires存在类似问题，因此有`ETag/If-None-Match`方案。

4.  ETag/If-None-Match

    ETag是服务端生成的任意值，通常是文件Hash或者版本号等。客户端缓存过期时，请求会带上`If-None-Match`及缓存的`ETag`值去询问服务端是否改变了，如果服务端为该资源确定的最新`ETag`与客户端发来的一致，说明无需重新发送资源，应返回`304`，客户端刷新缓存生命周期并复用即可。

5.  Vary：区分响应的基本方式是利用它们的URL，但有些情况下同一个URL的响应也可能不同，例如根据`Accept-Language`返回了不同的语言版本，这时可利用`Vary`指明额外用于区分响应的字段。
