# 临时调整swap分区大小

构建一些大型项目时经常会遇到`collect2: fatal error: ld terminated with signal 9 [Killed]`这样的报错，通常是因为可用内存不够。
可以通过临时调整swap分区大小来解决，swap分区为利用磁盘文件做的虚拟内存：

```bash
# 创建临时文件夹
mkdir /tmp/swap && cd $_
# 创建swap分区大小，通常设置为内存的两倍左右，这里是32G
dd if=/dev/zero of=swap bs=1024 count=32000000
# 创建swap文件系统
mkswap -f swap
# 启用swap文件
swapon swap
# 查看
free -h

# 卸载swap分区
swapoff swap
# 删除swap文件
rm swap
```

`free -h`的输出类似：

                   total        used        free      shared  buff/cache   available
    内存：       15Gi       1.7Gi        11Gi       377Mi       2.7Gi        13Gi
    交换：       34Gi       2.4Gi        32Gi

`dd`命令用于从一个输入流`if`转换到输出流`of`，不提供参数时为标准输入输出。而`/dev/zero`会无穷尽地提供空字符，常被用来初始化固定大小的数据存储。

创建一个1kb的文件：

```bash
dd if /dev/zero of data.txt bs=1k count=1
```
