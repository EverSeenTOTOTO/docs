# xv6小记

MIT开放的课程[CS6.S081](https://pdos.csail.mit.edu/6.828/2021/index.html)围绕他们自己实现的教学用操作系统xv6-riscv来讲述操作系统设计的方方面面，这里是一些课程笔记。我并没有观看课程视频，~因为板书和录音太鬼畜了~，主要看的是xv6-riscv手册和课程notes，配合《OSTEP》食用更佳。

## 进程间切换

把CPU看成是一个无状态无副作用的函数，总是从固定位置（PC）处读取指令并操作上下文，上下文中有寄存器等信息。PC也在上下文中，所以可以通过切换上下文改变要执行的指令，切换的本质是切换外部状态。类似机制可以实现`setjmp`和`longjmp`，乃至实现协程。

```rust
trait Context {
  pc: u32,
  sp: u32,
  xregs: [u32; 32],
  // ...
}

fn cpu(ctx: Context) {
  let inst = get_instruction(ctx.pc);

  match inst.opcode {
    // ...
  }
}
```

触发时机：

1.  用户进程主动休眠，在`sleep`中会调用`sched`，在`wait`中也会调用`sleep`
2.  借助周期性的时钟中断，检查长时间运行的进程，在`usertrap`中会调用`yield`，`yield`调用`sched`

疑问：RISC-V的寄存器中不包括PC，在`context`的定义和`switch`的实现中也没有PC的身影，PC是怎么被保存的？

It does not save the program counter. Instead, `swtch` saves the *ra*  register, which holds the return address from which `swtch` was called.

When `swtch` returns, it returns to the instructions pointed to by the restored *ra* register, that is, the instruction from which the new thread previously called `swtch`.

RISC-V中*ra*是caller保存的寄存器，所以在调用`switch`时*ra*已经被设置为调用`switch`处下一条指令的地址，调用`switch`会改变*ra*，但这对CPU来说是透明的，CPU只会机械地返回到*ra*所指向的位置，从而实现了切换。原理和初始化进程时将*ra*修改为`main`以“返回”到`main`开始执行进程、和进程从系统调用中返回是一样的。

疑问：时钟中断到来的时候，在执行的是用户进程A，操作系统没有在执行，谁中止了用户程序并保存的现场？

和系统调用一样，也是由硬件隐式地保存寄存器(A)到内核栈(A)，保存完之后才跳转到内核的陷阱处理程序。如果是进程间切换，在陷阱处理程序中还会发生第二种寄存器保存/恢复，由内核显式地保存寄存器(A)到PCB(A)，并恢复PCB(B)到寄存器(B)，这使得原本由A陷入的内核看起来好像是从B陷入的一样，再返回将返回到B进程。

## 递归锁的坏处

会让程序分析变得更加困难。在这个例子中，如果锁可重入，由于`h()`可能也调用`call_once()`，因此不能保证`call_once()`只被调用一次：

```c
struct spinlock lock;
int data = 0; // protected by lock

f() {
  acquire(&lock);
  if(data == 0){
    call_once();
    h();
    data = 1;
  }
  release(&lock);
}
g() {
  aquire(&lock);
  if(data == 0){
    call_once();
    data = 1;
  }
  release(&lock);
}
```

## 为什么持有自旋锁的时候必须关中断？

和持有锁时不能随便被调度出CPU一样，都是为了防止死锁。

Suppose `sys_sleep` holds `tickslock`, and its CPU is interrupted by a timer interrupt. `clockintr` would try to acquire
`tickslock`, see it was held, and wait for it to be released. In this situation, `tickslock` will
never be released: only `sys_sleep` can release it, but `sys_sleep` will not continue running until
`clockintr` returns. So the CPU will deadlock, and any code that needs either lock will also freeze.

## 为什么还需要休眠锁？

Holding a spinlock that long would lead to waste if another process wanted to
acquire it, since the acquiring process would waste CPU for a long time while spinning. Another
drawback of spinlocks is that a process cannot yield the CPU while retaining a spinlock; we’d like
to do this so that other processes can use the CPU while the process with the lock waits for the disk.
Yielding while holding a spinlock is illegal because it might lead to deadlock if a second thread then
tried to acquire the spinlock; since acquire doesn’t yield the CPU, the second thread’s spinning
might prevent the first thread from running and releasing the lock. Yielding while holding a lock
would also violate the requirement that interrupts must be off while a spinlock is held. Thus we’d
like a type of lock that yields the CPU while waiting to acquire, and allows yields (and interrupts)
while the lock is held.

出于上述原因，实现`sleeplock`的首要问题就是要让持有锁的进程在被调度出CPU的时候让出锁。可以用`spinlock`来实现`sleeplock`，`sleeplock`的`lk`字段用于保护`locked`字段：

```c
// Long-term locks for processes
struct sleeplock {
  uint locked;       // Is the lock held?
  struct spinlock lk; // spinlock protecting this sleep lock
  
  // For debugging:
  char *name;        // Name of lock.
  int pid;           // Process holding lock
};
```

```c
void acquiresleep(struct sleeplock *lk) {
  acquire(&lk->lk);
  while (lk->locked) {
    sleep(lk, &lk->lk); // 相当于 release(&lk->lk); sched(); acquire(&lk->lk);
  }
  lk->locked = 1;
  lk->pid = myproc()->pid;
  release(&lk->lk);
}
```

在`sleep`里面，让出锁`lk`并进行进程间调度，`p->lock`是保护进程状态字段的锁，不要和`lk`混淆了：

```c
void sleep(void *chan, struct spinlock *lk) {
  struct proc *p = myproc();
  
  // Must acquire p->lock in order to
  // change p->state and then call sched.
  // Once we hold p->lock, we can be
  // guaranteed that we won't miss any wakeup
  // (wakeup locks p->lock),
  // so it's okay to release lk.

  acquire(&p->lock);  //DOC: sleeplock1
  release(lk);

  // Go to sleep.
  p->chan = chan;
  p->state = SLEEPING;

  sched();

  // Tidy up.
  p->chan = 0;

  // Reacquire original lock.
  release(&p->lock);
  acquire(lk);
}
```

有`sleep`就有`wakeup`，`wakeup`在`releasesleep`中被调用，进程`sleep`的时候`p->chan = chan`保存了一个标志位来表示当前进程正在等待某个锁，因此在`wakeup`中，在进程列表中找一找哪些进程持有这个标志位就可以唤醒了：

```c
void releasesleep(struct sleeplock *lk) {
  acquire(&lk->lk);
  lk->locked = 0;
  lk->pid = 0;
  wakeup(lk);
  release(&lk->lk);
}
```

```c
void wakeup(void *chan) {
  struct proc *p;

  for(p = proc; p < &proc[NPROC]; p++) {
    if(p != myproc()){
      acquire(&p->lock);
      if(p->state == SLEEPING && p->chan == chan) {
        p->state = RUNNABLE;
      }
      release(&p->lock);
    }
  }
}
```

## xv6的文件系统架构

| layer | description |
| ---- | ---- |
| File descriptor | The file descriptor layer abstracts many Unix resources using the file system interface, simplifying the lives of application programmers. |
| Pathname | The pathname layer provides hierarchical path names like `/usr/rtm/xv6/fs.c`, and resolves them with recursive lookup. |
| Directory | The directory layer implements each directory as a special kind of inode whose content is a sequence of directory entries, each of which contains a file’s name and i-number. |
| Inode | The inode layer provides individual files, each represented as an inode with a unique i-number and some blocks holding the file’s data. |
| Logging | The logging layer allows higher layers to wrap updates to several blocks in a transaction, and ensures that the blocks are updated atomically in the face of crashes. |
| Buffer cache | The buffer cache layer caches disk blocks and synchronizes access to them, making sure that only one kernel process at a time can modify the data stored in any particular block. |
| Disk | The disk layer reads and writes blocks on an virtio hard drive. |

疑问：如果在日志写入期间磁盘发生错误怎么办？

由硬件保证原子性，比如磁盘应保证对一个512B块的写入是原子的，按块写入磁盘。

### 软链和硬链

首先要理解什么是inode，inode是文件系统的底层抽象，是磁盘上的一些区块，一个文件在底层不过是若干inode，而目录是一类特殊的inode，其中存放着从人类可读路径到inodes的**链接**。文件系统的首要任务便是划分磁盘并管理这些inodes。

硬链接：在目录中添加一项指向相同inodes，因此硬链接文件和原文件在底层是同一个inode编号，大小也相同。文件系统通过引用计数跟踪有多少文件链接到当前inode，只有引用计数为0才会真正释放inode及相关数据结构。所以通常所说的删除操作其实都是unlink操作。由于引用计数的存在，硬链接无法成环，所以不允许创建目录的硬链接，防止目录之间形成循环依赖。并且由于与底层inode实现的耦合，通常无法创建其他文件系统的硬链接。

软链接（符号链接）：建立一个新文件（有自己的inodes），存放若干信息，文件系统处理时会找到原始文件进行处理，比如Windows的快捷方式。因为软链接其实只是一些数据结构，所以它可以成环，并且即使删除了原始文件软链接也依然存在，形成“悬挂引用”。

下面是某次`ls -i`的结果，其中`a`是原始文件，`c`是`ln -s`创建的符号链接，`d`是`ln`创建的硬链接，可以看到`a`和`d`的inode编号都是相同的，和`c`不同，`c`权限列表开头的`l`指明它是一个软链接：

```bash
24943013 .rw-rw-r-- everseen everseen   6 B  Thu Jan 19 07:53:24 2023  a
24943386 lrwxrwxrwx everseen everseen   1 B  Thu Jan 19 07:36:49 2023  c ⇒ a
24943013 .rw-rw-r-- everseen everseen   6 B  Thu Jan 19 07:53:24 2023  d
```

## 虚拟机的三种实现机制

1.  软件模拟，编写一个能够执行机器指令的模拟器：切实可行，完全控制，但是慢；

2.  在真实CPU上执行guest instructions：如果要执行特权指令怎么办？产生trap，可以用软件包装并捕获，自定义trap handler，称为“trap-and-emulate”；

3.  硬件支持的虚拟化：VT-x/VMX/SVM：比“trap-and-emulate”还要快，软件实现简单，被广泛用于虚拟机实现。

## 读锁在多核缓存上表现不佳

常见的一种读写锁实现，允许并行读，互斥写：

```c
struct rwlock { int n; };
  n=0  -> not locked
  n=-1 -> locked by one writer
  n>0  -> locked by n readers
r_lock(l):
  while true:
    x = l->n
    if x < 0
      continue
    if CAS(&l->n, x, x + 1)
      return
w_lock(l):
  while true:
    if CAS(&l->n, 0, -1)
      return
```

假设有N个读者运行在不同CPU核上，无写者，每次有一个读者获得锁，然后执行`CAS`将`l->n`计数加1，但这个调用的工作量是$O(N)$，因为需要使`l->n`的另外N-1个缓存失效，所有其他核都会重新读取。总共要执行N次来让所有核完成`r_lock()`，因此一共是$O(N^2)$。在重（zhong）读场景下，代价高昂。
