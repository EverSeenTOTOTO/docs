# 构建安装chromium和webkit的一些记录

## Chromium

在自己的机器上构建chromium，还算顺利，记录一下。

官方的安装指南在这里：<https://chromium.googlesource.com/chromium/src/+/refs/heads/main/docs/linux/build_instructions.md>

1.  第一关是下载源码，这里不能直接`git clone`官方放置在`github`的源码镜像，需要借助他们的`depot_tools`工具包。下载过程中需要配置git和`https_proxy`代理。尤其是`https_proxy`的代理貌似不能是socks5的。同时为了加快下载速度，可以跳过拉取整个git历史：`fetch --nohooks --no-history chromium`

2.  其次我的发行版来自Popos，基于ubuntu改的。会导致`src/build/install-build-deps.sh`脚本报错，在这一段：

```bash
supported_codenames="(hirsute|trusty|xenial|bionic|disco|eoan|focal|groovy)"
supported_ids="(Debian|Pop)"
```

这里的`hirsute`和`Pop`都是基于自己的机器新增的。但注意因为确信自己的机器是ubuntu才可以这样简单改下，其他平台请参考安装指南。

:::info
`hirsute`是ubuntu的发行版标记，就像`groovy`、`focal`这些。
:::

3.  在执行`install-build-deps.sh`的过程中可能会遇到依赖上的冲突，好在借助`aptitude`基本可以解决，稍微麻烦点。必要时可以在`https://packages.ubuntu.com/hirsute/amd64/`找找。

此外可以注释掉这里，不安装`NaCl`的相关依赖。`NaCl`的依赖是给原生客户端编译用的，暂时用不上。

```bash
# 64-bit systems need a minimum set of 32-bit compat packages for the pre-built
# NaCl binaries.
# if file -L /sbin/init | grep -q 'ELF 64-bit'; then
#   dev_list="${dev_list} libc6-i386 lib32stdc++6"
# 
#   # lib32gcc-s1 used to be called lib32gcc1 in older distros.
#   if package_exists lib32gcc-s1; then
#     dev_list="${dev_list} lib32gcc-s1"
#   elif package_exists lib32gcc1; then
#     dev_list="${dev_list} lib32gcc1"
#   fi
# fi
```

4.  依赖安装成功后，在`gn gen out/Default`之后可以调整下`gn`的构建配置，加快构建速度：

```bash
gn args out/Default

# 在打开的编辑器输入这几行，其含义在官网指南均可以找到

is_debug = false
enable_nacl = false
blink_symbol_level=0
symbol_level = 0
v8_symbol_level=0
```

## Webkit

相比之下Webkit的安装就轻松很多。在linux上构建Webkit可以选择GTK或者QT版本，我选择的是GTK，全程参照<https://trac.webkit.org/wiki/BuildingGtk>这篇文档就行，同样必要时需设置代理，并且在构建时最好设置下`-jXX`的flag，否则所有核心都参与构建电脑会很卡。

运行`Tools/Scripts/run-minibrowser --gtk`的时候还遇到了`WebProcess Crashed`的报错，google了半天之后看到有人说的换显卡试试，还真解决了：）。PopOS好就好在对显卡驱动的支持，配套的`system76-power`工具可以方便的由`nvidia`模式切换成`integrated`模式。

```bash
sudo system76-power graphics integrated
```
