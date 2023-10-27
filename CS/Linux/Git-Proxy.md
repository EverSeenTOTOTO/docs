# git clone设置代理

git clone分为两种方式，http 或者 ssh：

## ssh

通过修改`~/.ssh/config`：

    Host github.com
        HostName github.com
        User git
        # 走 socks5 代理（如 Shadowsocks）
        ProxyCommand nc -v -x 127.0.0.1:1080 %h %p

对于Windows用户，要使用socks5代理却没有 nc 的，可以将`ProxyCommand nc -v -x 127.0.0.1:1080 %h %p` 换成`ProxyCommand connect -S 127.0.0.1:1080 %h %p`。

:::warning
`nc`有几个不同的版本，命令参数有很大差异，例如`ncat`的设置代理方式是`--proxy`而非`-x`，并且代理不能设置为`localhost`，必须写明`127.0.0.1`，否则会连接失败。
:::

## http

```bash
git config --global http.proxy 'socks5://127.0.0.1:1080'
git config --global https.proxy 'socks5://127.0.0.1:1080'
```

走http代理的

```bash
git config --global http.proxy 'http://127.0.0.1:1080'
git config --global https.proxy 'http://127.0.0.1:1080'
```

## 忽略lfs

```bash
git config --global filter.lfs.smudge "git-lfs smudge --skip"
git config --global filter.lfs.smudge "git-lfs smudge -- %f"
```
