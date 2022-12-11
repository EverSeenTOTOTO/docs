# LFS(Linux From Scratch)


记录实践LFS的踩坑与收获。当前使用的LFS版本为11.1.24。

## 一、检查宿主系统软件包的支持

见2.2节《宿主系统需求》，官方提供了一个检查的脚本，跑一下作对比调整即可。

1. `ERROR: /bin/sh does not point to bash`

    我的`/bin/sh`指向的是`dash`，需调整为指向`bash`。

    ```bash
    sudo ln -svf /bin/bash /bin/sh
    ```

    我的`/usr/bin/awk`指向的是`mawk`，需要调整为指向`gawk`，同理。

2. `makeinfo: command not found`

    在ubuntu机器上，需要安装`texinfo`。

## 二、准备用于LFS的分区

推荐为 LFS 选择⼀个可⽤的空分区，或者在有充⾜未划分空间的情况下，创建⼀个新分区。分区可以使用`fdisk`和`parted`工具，另外有个`gparted`的GUI版本挺好用的。
实际上在做这一步的时候我试图缩小正在使用的系统分区，成功搞崩了电脑🐶。好在重要的数据都有备份，权衡了一下之后干脆重装下系统，清爽多了。在重装的时候预留下给LFS的磁盘空间即可。

在系统分区表损坏无法启动的情况下重装系统不麻烦，参考步骤如下：

1. 利用另外一台电脑制作一个USB的Live CD启动盘
2. 调整电脑的BIOS boot设置，优先从USB启动
3. 进入在USB上的系统，这时基于GPT分区表的备份特性其实可以尝试修复损坏的GPT分区表，然而我还没学会😆。如果要格式化SSD磁盘可以参考[Arch Wiki的文档](https://wiki.archlinux.org/title/Solid_state_drive/Memory_cell_clearing)，如果要重新分区可以看一下[红帽的文档](https://access.redhat.com/documentation/zh-cn/red_hat_enterprise_linux/8/html/managing_file_systems/assembly_getting-started-with-partitions_managing-file-systems#assembly_viewing-the-partition-table_assembly_getting-started-with-partitions)和[ArchWiki的文档](https://wiki.archlinux.org/title/Partitioning_\(%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87\)#GUID_%E5%88%86%E5%8C%BA%E8%A1%A8)。

另外一些值得记录的点：

1. [这篇文章](https://segmentfault.com/a/1190000020850901)值得一读，对很多基础概念都有介绍。
2. 网上很多教程都是SATA驱动的磁盘，常见的显示名称是`/dev/sda`，我的是NVMe驱动的磁盘，设备标识`/dev/nvme0n1`，格式化的时候可以使用`nvme-cli`格式化。
3. 如果不确定怎么分，一般来说一个`FAT32`格式的boot分区（仅适用于UEFI，挂载到`/boot/efi`），通常是MB单位（我使用的PopOs系统要求500+MB）、一个`ext4`格式的主分区（仅适用于flash设备例如SSD和U盘，传统的硬盘一般是NTFS格式，挂载到`/`），一个可选的`linux swap`格式的swap分区，swap分区不需要太大（我设置的4G，常年用不上），可以[动态调整](/CS/Linux/swap.md)的。

    下面是我分区之后进入`parted`交互页面`p all`的输出结果：

    ```bash
    Disk /dev/nvme0n1: 512GB
    Sector size (logical/physical): 512B/512B

    Number  Start   End     Size    File system     Name  Flags
     1      1049kB  538MB   537MB   fat32                 boot, esp
     2      429GB   512GB   82.6GB  ext4
     3      538MB   4833MB  4295MB  linux-swap(v1)        swap
     4      4833MB  429GB   425GB   ext4
    ```

    下面是`fdisk -l`的输出，值得注意的是两边显示的分区大小不一样，还没搞懂是为什么……总感觉是之前瞎分区的时候导致哪里损坏了，凭空蒸发了30多GB的容量：

    `/dev/nvme0n1p1`是ESP（EFI System Partition），`/dev/nvme0n1p2`是预留给LFS的空间，`/dev/nvme0n1p4`是宿主系统所在分区，`/dev/nvme0n1p3`是交换内存。

    ```bash
    Device             Start        End   Sectors   Size Type
    /dev/nvme0n1p1      2048    1050623   1048576   512M EFI System
    /dev/nvme0n1p2 838864896 1000214527 161349632  76.9G Linux filesystem
    /dev/nvme0n1p3   1050624    9439230   8388607     4G Linux swap
    /dev/nvme0n1p4   9439232  838864895 829425664 395.5G Linux filesystem
    ```

    :::Info
    后续看了下，可能和`fdisk`与`parted`使用的单位不同有关，SSD厂商使用1000作为进制，而我们常说GB、MB都是以1024为进制。512GB的SSD有$\frac{512*1000^3}{1024^3}\approx 476.83GB$的实际容量，严格算的话可以利用扇区数$\frac{(1000214527-2048)*512}{1024^3}\approx 476.94GB$，（需确认自己的扇区大小Sector size是512B）差不多。[这里](http://www.jinbuguo.com/storage/ssd_usage.html)有一篇比较好的文档。
    :::

4. 分区后LFS文档推荐将其挂载在`/mnt/lfs`下，并编辑`/etc/fstab`设置开机时自动挂载。

    `/etc/fstab`编辑新增的行：

    ```bash
    /dev/nvme0n1p2 /mnt/lfs ext4 defaults 1 1
    ```

    下面是挂载信息`mount | column -t | grep nvme`：

    ```bash
    /dev/nvme0n1p4  on  /                          type  ext4             (rw,noatime,errors=remount-ro)
    /dev/nvme0n1p1  on  /boot/efi                  type  vfat             (rw,relatime,fmask=0077,dmask=0077,codepage=437,iocharset=iso8859-1,shortname=mixed,errors=remount-ro)
    /dev/nvme0n1p2  on  /mnt/lfs                   type  ext4             (rw,relatime)
    ```

5. `parted`分区的时候可以设置`unit s`以扇区（sector）为单位，也可以用`GB`、`GiB`或`%`作为单位，一般起始的时候可能以某个扇区起始，分配多少GB，最后一个分区以100%为结束位置防止浪费。
6. `blkid`可以查看分区的详细信息`blkid -p /dev/nvme0n1p2`。
7. [wiki](https://en.wikipedia.org/wiki/EFI_system_partition)上有这么一句话：GUID 分区表(GPT) 方案中EFI 系统分区的全局唯一标识符(GUID) 为C12A7328-F81F-11D2-BA4B-00A0C93EC93B。通过`fdisk -x`可以得到验证：

    ```bash
    Device             Start        End   Sectors Type-UUID                            UUID                                 Name Attrs
    /dev/nvme0n1p1      2048    1050623   1048576 C12A7328-F81F-11D2-BA4B-00A0C93EC93B 32B1B505-0371-4CB0-96E9-10D30F8A8626
    ```

8. 虽然现在普遍采用的都是GPT分区表和UEFI，但是在了解BIOS和MBR的时候对于为什么MBR分区最大只能识别2TB硬盘很有疑问。看到很多文档要么说每个分区表项占用16个字节导致的，要么说为32位系统设计导致的，含糊其辞。真正的原因是MBR的分区表采用4字节数来存储分区扇区数，所以能表示的最大容量为$2^{4*8}*512B = 2TB$。

## 三、下载软件包和补丁、构建

使用官方给出的`wget-list`文件下载比较快：<https://www.linuxfromscratch.org/lfs/downloads/stable/>。

```bash
wget --input-file=wget-list --continue --directory-prefix=$LFS/sources
```

之后的安装和编译步骤比较枯燥，一个一个来的话历时两天左右，需要注意的是交叉编译的一些库在后面进入chroot环境重新编译的时候最好重新解压构建。

一些值得记录的点：

1. glibc和kernel是灵魂。虽然LFS因为没有`rsync`不推荐使用linux内核源码树提供的`make headers_install`，但是这个`headers_install`命令本身还有一段故事：<http://www.jinbuguo.com/kernel/header_story.html>；
2. eudev安装步骤里面的`make -f udev-lfs-20171102/Makefile.lfs install`是LFS预提供的udev规则和支持文件，和udev如何处理驱动设备有关。可以查阅ArchWiki上相关的文档，[这篇文章](http://www.jinbuguo.com/kernel/device_files.html)也值得一读。
3. （见第9.6章）LFS使用`sysvinit`的引导架构启动，基于运行级别（run-level）的概念而构建。同时LFS预先提供了LFS-Bootscripts脚本来启动和停止系统。查看一下LFS-Bootscripts包的Makefile可知，它会拷贝各种启动shell脚本到`/etc/rc.d/`下面去。具体的脚本执行可以参考9.6.2节。另一种流行的引导架构是systemd，LFS也有对应的一个操作手册版本。这里为了简单使用的是sysvinit。

## 四、内核和grub配置

到系统配置和grub启动配置的时候LFS文档显得很杂乱，而且需要对udev有一定了解。一些记录如下：

1. udev设备和驱动配置基本没动，等熟悉了再去配置，在LFS文档上安装eudev软件包的时候预安装了一些规则，应该足够启动内核了；
2. 配置启动分区我参考BLFS文档配置UEFI启动，中途又安装构建了许多软件不表。这里我还犯了一个沙雕错误，LFS提到宿主系统如果有单独的`/boot`分区需执行`mount --bind /boot /mnt/lfs/boot`将LFS系统的`/boot`绑定为该分区再拷贝内核文件，我没有独立的`/boot`分区却也这样做了，使得LFS系统的`/boot`指向了宿主系统的`/boot`，结果将导致系统启动挂载`/boot/efi`时提示找不到挂载点`/boot`（因为LFS系统放置在`/dev/nvme0n1p2`分区，grub里面的root也是这个，而该分区的`/boot`里面没东西，内核文件全被我拷贝到宿主系统的`/boot`去了）。正确做法是内核文件拷贝到LFS系统的`/boot`目录，并将ESP（EFI System Partition，即我这里的`/dev/nvme0n1p1`）挂载到LFS系统的`/boot/efi`。下面是LFS系统的`/etc/fstab`配置，实际我写的是fs UUID：

    ```bash
    /dev/nvme0n1p1 /boot/efi  vfat defaults 0 1
    /dev/nvme0n1p2 / ext4 defaults 1 1
    ```

3. 还有一个大坑和启动时根分区挂载有关，一开始我在grub.cfg里面写入的内核引导参数是`root=/dev/nvme0n1p2`，会导致`kernel panic`，提示找不到`/dev/nvme0n1p2`，换成fs UUID也不行，查了下[grub的文档](https://www.gnu.org/software/grub/manual/grub/html_node/Root-Identifcation-Heuristics.html)以为是在`GRUB_DISABLE_LINUX_PARTUUID`和`GRUB_DISABLE_LINUX_UUID`都默认`false`的情况下，grub采用part UUID而非fs UUID导致的，我提供的是fs UUID。因此可以参考[ArchWiki的文档](https://wiki.archlinux.org/title/Persistent_block_device_naming_\(%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87\))调整grub配置参数`GRUB_DISABLE_LINUX_PARTUUID`和`GRUB_DISABLE_LINUX_UUID`，要求使用fs UUID。当然问题不是这个，没有解决。随后猜测是udev的规则不对无法识别到nvme磁盘驱动，拷贝了宿主机`/usr/lib/udev/rules.d`下面的规则过去也不行，并且看了下LFS文档提供的规则是有识别nvme设备的（可以`grep nvme /lib/udev/rules.d`查看）的规则的。又查了很久的文档，结合下面的grub配置宿主机系统和使用宿主机系统内核的LFS系统均能够正常启动的现象，猜测是内核编译的时候没有开启NVME支持，于是尝试通过调整内核构建配置开启nvme相关的配置，依然不行😿……最后索性把宿主机的内核给copy过去了，并且沿用了宿主机内核配套的initrd.img，重启后终于成功进入了LFS的终端界面。白piao虽然开心，没用上自己构建的内核总感觉少了点意思，这里的失败还需要进一步探究。

    :::Info
    后续又折腾了两天，结合使用宿主机内核能进入LFS系统的现象和启动时的一些报错，以`initrd nvme`为关键字搜索终于看到了蛛丝马迹（宿主系统和LFS系统grub.cfg里面kernel参数配置基本一致，宿主系统的initrd.img能够正常挂载根分区，而使用BLFS提供的`mkinitramfs`脚本生成的initrd.img则不能，估计是需要`initrd.img`支持挂载`nvme`根分区啥的。最终使用的是使用BLFS提到的dracut工具去创建`initrd.img`，下面是[dracut](https://mirrors.edge.kernel.org/pub/linux/utils/boot/dracut/dracut.html#_dracut_8)的配置：

    * /etc/dracut.conf：

    ```bash
    hostonly=no
    hostonly_cmdline=no
    persistent_policy=by-uuid
    use_fstab=yes
    sysloglvl=3
    compress=xz
    ```

    使用`dracut --kver 5.16.12 -c /etc/dracut.conf  -f`生成inird.img并且拷贝到`/boot`文件夹里面去。再重启就可以进入LFS系统了，这时候使用的是自己编译的内核，舒服。
    :::

4. 最后是我的grub.cfg，参考[ArchWiki的文档](https://wiki.archlinux.org/title/GRUB_\(%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87\)#%E7%94%9F%E6%88%90%E4%B8%BB%E9%85%8D%E7%BD%AE%E6%96%87%E4%BB%B6)编写，中途为了找出根分区挂载不上的问题添加了很多调试参数，LFS文档太浅显了……下面的`Pop OS`是原有的宿主系统，在第四个分区`/dev/nvme0n1p4`所以`set root=(hd0,4)`：

    ```bash
    # Begin /boot/grub/grub.cfg

    set default=0
    set timeout=5
    serial --unit=0 --speed=9600
    terminal --timeout=5 serial console
    
    # set pager=1
    # set debug=all

    insmod part_gpt
    insmod ext2

    if loadfont /boot/grub/fonts/unicode.pf2; then
      set gfxmode=auto
      insmod all_video
      terminal_output gfxterm
    fi

    menuentry "Pop OS" {
     set root=(hd0,4)
     linux /boot/vmlinuz-5.16.11-76051611-generic root=UUID=01454fcc-c1a2-43b8-8d2c-c4f01a9bd671 ro
     initrd /boot/initrd.img
    }

    menuentry "Everseen LFS"  {
     set root=(hd0,2)
            linux /boot/vmlinuz-5.16.12-lfs-r11.1-24 root=UUID=a0f3219f-2875-4853-b7ec-b5ead88691bb rootflags=rw,relatime,discard,data=ordered rootfstype=ext4 panic=30 rd.shell rd.debug rd.udev.debug log_buf_len=1M console=tty0 console=ttyS0,9600 rd.retry=60 rd.timeout=120
     initrd /boot/initramfs-5.16.12.img
    }

    menuentry "Firmware Setup" {
      fwsetup
    }
    ```

小结一下，学到的东西还是很多的。不仅对`/dev`、`/sys`这些常见的目录和目录里面的内容是怎么来的、都是什么作用有了一定的了解，也熟悉了不少概念和工具，比如`MBR`、`GPT`、`fdisk`、`parted`、`grub`、`udev`等，对如何分区、拯救系统也愈发地得心应手了。最后感谢一下ArchWiki的各位维护者，无数次救我苦命的机器于水火😄。
