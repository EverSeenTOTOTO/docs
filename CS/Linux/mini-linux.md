# 最小化的Linux

突发奇想想将写的一些c++小demo构建为面向RISC-V64的可执行文件然后在RISC-V64上跑起来。既然同时在学习操作系统，不妨自己做一个最小的linux系统，用`qemu-system-riscv64`跑起来再尝试运行elf文件。

和网上的大部分教程差不多，我们的最小的linux系统有三个部分：内核、`busybox`和`init`脚本。完整的示例项目可以看[这里](https://github.com/EverSeenTOTOTO/mini-linux-riscv)，文中主要记录了踩的一些坑。

## `riscv64`编译工具链

首先需要能够将内核和`busybox`构建成面向`riscv64`平台的编译工具包，也就是我们常见的`gcc`、`ld`、`objdump`这些东西。这里有个大坑，不要使用`apt`拉取到的发行版本`riscv64-linux-gnu-*`，貌似`qemu`还是`riscv`做了不向下兼容的变更，最后运行内核的时候会报类似`rom: requested regions overlap (rom mrom.reset. free=<address>, addr=<address>)`的错误。因此我们还是克隆[这个仓库](https://github.com/riscv-collab/riscv-gnu-toolchain.git)自行构建的好。

> 后续折腾的时候意识到可能不是什么向下兼容的问题，而是内核启动的机制，使用文末Fedora提供的一个预编译Berkeley Boot Loader作为`kernel`参数就可以启动发行版操作系统，操作系统是以挂载到磁盘的文件镜像形式出现的。

## 构建`busybox`

`busybox`内置了很多常用命令的精简实现。构建`busybox`需注意在`make menuconfig`之后将`Build options`的静态链接勾选上，在示例项目里我们通过一行`sed`命令修改`.config`文件来实现。

## 构建内核

内核构建也有坑，我使用`gcc-10`编译`kernel-5.4`会报一个`kernel multiple definition of 'yylloc'`的错误，查了下貌似是`gcc`的BUG，需要降级到`gcc-9`以下。最后使用的`5.17.5`的内核。如果是ubuntu系统，也可以使用`update-alternatives`工具临时切换系统的gcc工具链版本。

## 制作`init`脚本

根据我们打不打算做根文件系统镜像，可以有多种`init`机制，网上这块的教程也比较杂乱。

### 无文件系统镜像

首先尝试无文件系统镜像的，这时我们可以使用`cpio`制作一个`initramfs.cpio.gz`，然后指定内核启动的`initrd`为它。这个东西我的理解不是很深刻，似乎和内核启动过程中的一个临时文件系统rootfs有关。

要实现这种启动方式，创建一个文件夹`initramfs`，在根目录下创建一个`init`文件，这里的关键在于`init`文件中的这两行，提供了操作系统运行所必需的目录结构：

```bash
mkdir -p /proc && mount -t proc none /proc
mkdir -p /sys && mount -t sysfs none /sys
```

随后再将构建好的`busybox`拷贝到`initramfs/bin/`下，使用`cpio`打包，最终`qemu-system-riscv64`启动内核的命令如下：

```bash
qemu-system-riscv64 \
  -M virt \
  -kernel build/vmlinux \
  -nographic \
  -initrd build/initramfs.cpio.gz \
  -append "console=ttyS0,9600"
```

各种命令的细节可参考示例项目的`initramfs`分支，启动后大致长下面这样：

```bash
OpenSBI v0.9
   ____                    _____ ____ _____
  / __ \                  / ____|  _ \_   _|
 | |  | |_ __   ___ _ __ | (___ | |_) || |
 | |  | | '_ \ / _ \ '_ \ \___ \|  _ < | |
 | |__| | |_) |  __/ | | |____) | |_) || |_
  \____/| .__/ \___|_| |_|_____/|____/_____|
        | |
        |_|

Platform Name             : riscv-virtio,qemu
Platform Features         : timer,mfdeleg
Platform HART Count       : 1
Firmware Base             : 0x80000000
Firmware Size             : 100 KB
Runtime SBI Version       : 0.2

...

[    0.262086] Run /init as init process
sh: can't access tty; job control turned off
> uname -a
Linux (none) 5.17.5 #2 SMP Mon Jul 4 11:47:00 CST 2022 riscv64 GNU/Linux
>
```

### 制作文件系统镜像

我们也可以使用`mkfs`实际制作一个文件系统镜像。首先使用`dd`生成一个128MB的二进制文件，然后使用`mkfs`格式化，并挂载到磁盘上。之后和上面创建`initramfs`文件夹里面的内容一样，我们在挂载的目录里面手动创建`init`文件并拷贝`busybox`。最终使用`qemu-system-riscv64`启动内核：

```bash
qemu-system-riscv64 \
  -M virt \
  -kernel build/vmlinux \
  -nographic \
  -drive file=build/rootfs.img,format=raw,id=hd0 \
  -device virtio-blk-device,drive=hd0 \
  -append "root=/dev/vda rw console=ttyS0,9600"
```

创建文件系统镜像的种种细节可见示例项目`main`分支的`mkfs.js`文件。

## 交叉编译

最后是未完成的部分……现在我们虽然可以进入linux系统了，但能做的事情并不多，由于没有`gcc`等工具链，只能运行一些静态链接且不使用标准库的可执行文件，~我尝试了，然后得到了一个Segment Fault~。如果想要运行动态链接的应用，会因为缺少动态链接库文件以及动态链接器自身而报错，并且报错信息是差了十万八千里的`Command not found`。

如果想要完善的linux功能，我们还需要再编译出一套运行在`riscv64`平台上的`gcc`工具链。这个过程和LFS的交叉编译过程一致，可以先将我们的文件系统镜像挂载在宿主机器上，然后利用宿主机器的工具链构建`gcc`工具链并拷贝到挂载的文件系统内。

仔细梳理一下整个过程，我们首先利用宿主机器（x86-64）的能够生成`x86-64`平台可执行文件的`gcc`工具链，构建了一套依然运行在`x86-64`平台但是能生成`riscv64`平台可执行文件的`gcc`工具链，再使用这套工具链构建一套运行在`riscv64`平台能生成`riscv64`平台可执行文件的`gcc`工具链。如果要严谨一点，在`riscv64`上我们还可以再使用`gcc`构建它自身来验证完整性。

| 步骤 | 构建工具运行平台host | 构建结果运行平台target |
| ---- | ---- | ---- |
| 在x86-64机器上用`gcc`构建运行在x86-64上的`gcc`，但是新的`gcc`生成的可执行文件将运行在riscv64机器上 | x86-64 | x86-64 |
| 使用新的`gcc`，产出自身和自身构建产物均运行在riscv64机器上的`gcc` | x86-64 | riscv64 |
| riscv64上的`gcc`再次构建一个`gcc`，验证完整性 | riscv64 | riscv64 |

## 后续

在[PLCT实验室的月报](https://github.com/plctlab/PLCT-Weekly)里看到他们有团队参与移植Arch Linux，于是找到了他们[制作好的rootfs镜像](https://archriscv.felixc.at/)，不过也是木有gcc工具链的。好在很快我又找到了Fedora官方提供的[发行版镜像](https://fedorapeople.org/groups/risc-v/disk-images/)，带有g++v7，就连构建好的内核他们也提供出来了，香！
