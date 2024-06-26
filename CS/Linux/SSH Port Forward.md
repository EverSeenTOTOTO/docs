# ssh端口转发

好记性不如烂笔头，`-L`、`-R`和`-D`三个命令的格式老是忘，还是记一下吧……下面的`$TSS`和`$BDW`代表服务器地址。

> 另有推荐文章：[An Excruciatingly Detailed Guide To SSH](https://grahamhelton.com/blog/ssh-cheatsheet/)

## 正向代理`-L`

在远程服务器`$TSS`上做web开发，开发服务器端口`8080`，本地机器能够`ssh`访问到远程服务器。为了方便，在本地机器上运行下述命令，从而访问`localhost:3000`相当于访问`$TSS:8080`。注意这要求远程服务器开放了`8080`端口。

```bash
ssh -qnNTCL 3000:localhost:8080 $TSS
```

## 反向代理`-R`

在远程服务器`$TSS`上不能访问某些镜像源，而本地机器的`7777`端口运行有代理服务，同时本地机器能够`ssh`访问远程服务器。为了在服务器上临时访问一下镜像，在本地机器上运行下述命令，之后登录到`$TSS`上后，可认为自己的`1080`端口运行有代理服务。也即访问`$TSS:1080`相当于访问本地机器的`localhost:7777`。

```bash
ssh -qnNTCR 1080:localhost:7777 $TSS
```

## 本地socks5代理`-D`

更直白的隧道代理，本地机器能`ssh`登录代理服务器`$BDW`，在本地机器上执行如下命令后，可视为代理运行在本地的`1080`端口。所有走`1080`端口的流量都被转发给`$BDW`，由`$BDW`代为访问。

```bash
ssh -qnNTCD 1080 root@$BDW -p 27266
```

## 其他

测试通路可以使用`curl`，例如`curl github.com --socks5 localhost:1080 -vL`测试socks5代理的连通性。

上面出现的一些常用选项解释如下：

*   `-q`：安静模式，例如会隐藏预设的ssh欢迎字样

*   `-n`：关闭标准输入

*   `-N`：不执行远程命令

*   `-T`：禁止远程分配终端

*   `-C`：压缩数据
