# make参数`PREFIX`和`DESTDIR`的小问题

一个很小的问题，最近才留意到。我的`cargo`安装在`~/.cargo`下面，导致在`sudo make install`安装`neovim-gtk`的时候会提示`cargo`找不到。一个更合理的方式是永远不使用`sudo make install`。首先在临时目录里面编译，
再手动去设置`bin`目录的软链，这时需要配置make时的`PREFIX`和`DESTDIR`。

从前端开发的角度来说，`PREFIX`与`DESTDIR`和构建应用时的`publicPath`与`outputDir`类似，前者说明应用实际要跑起来
的路径，很多时候应用都不是部署在`/`下，而是`/xxx`下，`PREFIX`也是同理，在这里我将其设置为`/usr/share/neovim-gtk`。
而`DESTDIR`是构建输出目录，这里在`neovim-gtk`仓库下建了个`build`文件夹：

```bash
make DESTDIR=./build PREFIX=/usr/share/neovim-gtk install
sudo mv build/usr/share/neovim-gtk /usr/share/neovim-gtk
sudo ln -svf /usr/share/neovim-gtk/bin/nvim-gtk /usr/bin/ng  # 用ng作为快捷命令
```

> 话说neovim-gtk对汉字字符的支持不是很好，neovim-qt又不支持连字符，用FiraCode字体达不到完美的效果，难受。

> 更新：推荐[neovide](https://neovide.dev/index.html)，鼠标动画做得太丝滑了，编码成瘾！
