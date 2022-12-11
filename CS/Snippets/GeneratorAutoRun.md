# Generator自动执行器

今天也是炫技的一天呢～原意是设法将异步回调变成瀑布执行，然后写出了一个比较奇怪的模式，觉得有趣的话在[Github](https://gist.github.com/EverSeenTOTOTO/ac0a60de5568be71f6fc80c9e155ac7f)点个Star哦。

## Js版本

`Promise`、`async`和`await`不过是Generator的语法糖。

```js
const autoRun = (gen) => {
  const g = gen();

  const run = () => {
    const result = g.next();
    if (result.done) return;
    result.value(run);
  };

  run();
};

autoRun(function* () {
  yield (next) => setTimeout(() => { // await new Promise((next) => setTimeout(next, 1000))
    console.log(2);
    next();
  }, 1000);
  yield (next) => setTimeout(() => {
    console.log(3);
    next();
  }, 1000);
});
```

## Lua版本：

```lua
local co = coroutine 

function setTimeout(callback, timeout)
  local start = os.clock()
  while os.clock() - start <= timeout do end
  callback()
end

local autoRun = function(gen)
  local g = co.create(gen)

  function run() 
    local _,result = co.resume(g)
    if result == nil then return end
    result(run)
  end

  run()
end

autoRun(function() 
  co.yield(function(next) 
    setTimeout(function() 
      print(2)
      next()
    end, 1)
  end)
  co.yield(function(next)
    setTimeout(function() 
      print(3)
      next()
    end, 1)
  end)
end)
```

## Python版本

```python 
import time

def setTimeout(callback, timeout):
    time.sleep(timeout)
    callback()

def autoRun(gen):
    g = gen()

    def run():
        result = next(g)
        if result != None:
            result(run)

    run()


autoRun(lambda: [
    (yield (lambda n: setTimeout(lambda: [print(2), n()], 1))),
    (yield (lambda n: setTimeout(lambda: [print(3), n()], 1))),
    (yield None)])
```

## Racket版本

用continuation实现。

```scheme
#lang racket

(define (setTimeout callback timeout)
  (sleep timeout)
  (callback))
     
(define (autoRun g)
  (let [(next (call/cc (lambda (yield) (g yield))))]
    (if (eq? #f next)
      (void)
      (next))))

(autoRun (lambda (yield)
           (setTimeout (lambda () (println 2) (call/cc (lambda (next) (yield next)))) 1)
           (setTimeout (lambda () (println 3) (call/cc (lambda (next) (yield next)))) 1)
           (yield #f)))
```

## Go版本

用channel模拟`yield`。这种模拟给了我们一种很微妙的感觉，如果站在整个程序执行流的视角，写入channel和读取channel的两个线程没有任何同时执行的契机，名为多线程，其实还是单线程模型。

```go
package main

import (
	"fmt"
	"time"
)

type Yield chan func(func())

func setTimeout(callback func(), timeout time.Duration) {
	time.Sleep(timeout * time.Millisecond)
	callback()
}

func autoRun(gen func(Yield)) {
	yield := make(Yield)
	
	var run func()

	run = func() {
		result := <- yield
		if result != nil {
			result(run)
		}
	}

	go gen(yield)
	run()
}

func main() {
	autoRun(func (yield Yield) {
		yield <- func(next func ()) {
			setTimeout(func () {
				fmt.Println(2)
				next()
			}, 1000)
		}
		yield <- func(next func ()) {
			setTimeout(func () {
				fmt.Println(3)
				next()
			}, 1000)
		}
		yield <- nil
	})
}
```

## Rust版本

也基于channel。对Rust的lifetime还不够了解，见注释。

```rust
#![allow(non_snake_case)]
use std::{
    sync::mpsc::{sync_channel, SyncSender},
    thread,
    time::Duration,
};

fn setTimeout(callback: &dyn Fn(), timeout: u64) {
    std::thread::sleep(Duration::from_millis(timeout));
    callback();
}

type Lambda<Param> = Box<dyn Fn(Param) + Send + Sync>;

// Rust does not support recursive lambda function
struct Closure<'a> {
    lambda: &'a dyn Fn(&Closure),
}

// How to convert to SyncSender<Lambda<&Closure>> with appropriate lifetime?
type Yield = SyncSender<Box<dyn Fn(&Closure) + Send + Sync>>;

fn autoRun(gen: Lambda<Yield>) {
    let (tx, rx): (Yield, _) = sync_channel(1);

    let run = Closure {
        lambda: &|this| {
            if let Ok(result) = rx.recv() {
                result(this);
            }
        },
    };

    thread::spawn(move || gen(tx));
    (run.lambda)(&run);
}

pub fn test_yield() {
    autoRun(Box::new(|tx| {
        tx.send(Box::new(|next| {
            setTimeout(
                &|| {
                    println!("2");
                    (next.lambda)(next);
                },
                1000,
            );
        }))
        .unwrap();

        tx.send(Box::new(|next| {
            setTimeout(
                &|| {
                    println!("3");
                    (next.lambda)(next);
                },
                1000,
            );
        }))
        .unwrap();
    }));
}
```

## C++版本

channel不过是信号量的语法糖。

```cpp
#include <future>
#include <thread>
#include "example/semaphore.h"

void setTimeout(std::function<void()> const& callback, std::chrono::milliseconds const& timeout) {
  std::this_thread::sleep_for(timeout);
  callback();
}

using Yield = std::function<void(std::function<void()>)>;
// simulate one size channel
class Channel {
 public:
  // write to channel
  friend void operator<<(Channel& chan, Yield const& data) {
    chan.slot.P();
    chan.data = data;
    chan.item.V();
  }

  // read from channel
  friend Yield const& operator>>(Channel& chan, void*) {
    chan.item.P();
    auto data = new Yield(chan.data);
    chan.slot.V();
    return *data;
  }

 private:
  Yield     data;
  Semaphore slot{1};
  Semaphore item{0};
};

void autoRun(std::function<void(Channel&)> const& gen) {
  Channel yield;

  std::function<void()> run = [&]() {
    auto result = yield >> 0;
    if (result == nullptr) return;
    result(run);
  };

  auto p = std::async([&]() { gen(yield); });
  run();
  p.wait();
}

int main() {
  using namespace std;
  using namespace std::chrono_literals;

  autoRun([](Channel& yield) {
    yield << [](std::function<void()> const& next) {
      setTimeout(
          [&next]() {
            cout << 2 << endl;
            next();
          },
          1000ms);
    };

    yield << [](std::function<void()> const& next) {
      setTimeout(
          [&next]() {
            cout << 3 << endl;
            next();
          },
          1000ms);
    };

    yield << nullptr;
  });

  return 0;
}
```
