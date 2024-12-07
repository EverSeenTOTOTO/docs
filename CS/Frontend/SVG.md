<script setup>
import QuadraticBezier from '@vp/page-only/QuadraticBezier.vue'
import ForeignObjectDemo from '@vp/page-only/ForeignObjectDemo.vue'
</script>

# SVG

## Quadratic-bezier

[svg-tutorial](https://svg-tutorial.com/svg/quadratic-bezier) 中这个例子很漂亮，尝试复刻一下。

<QuadraticBezier />

::: details 点击展开源码

```vue
<script setup lang="tsx">
import React, { useState } from 'react';
import ReactWrap from '../ReactWrap.vue';
import { useRef } from 'react';
import clsx from 'clsx';

const DraggableIcon: React.FC<{ svgRef: React.MutableRefObject<SVGSVGElement | null>, pos: [number, number], setPos: React.Dispatch<React.SetStateAction<[number, number]>> }> = ({ svgRef, pos, setPos }) => {
  const draggingHandler = useRef<any>();

  return <g
    className={clsx('draggable', { dragging: !!draggingHandler.current })}
    transform={`translate(${pos[0]},${pos[1]})`}
    onDragStart={e => e.preventDefault()}
    onMouseDown={() => {
      if (draggingHandler.current) document.removeEventListener('mousemove', draggingHandler.current);

      draggingHandler.current = (e: React.MouseEvent<SVGGElement>) => {
        const rect = svgRef.current!.getBoundingClientRect()
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (x < 0 || y < 0 || e.clientX > rect.right || e.clientY > rect.bottom) return;

        setPos([Math.round(x), Math.round(y)]);
      }

      document.addEventListener('mousemove', draggingHandler.current);
    }}
    onMouseUp={(e) => {
      const forceUpdate = draggingHandler.current;

      document.removeEventListener('mousemove', draggingHandler.current);
      draggingHandler.current = null;
      forceUpdate?.(e);
    }}
  >
    <circle x="-20" y="-20" r="20"></circle>
    <line className="arrowLine" x1="-7.5" y1="0" x2="7.5" y2="0"></line>
    <line className="arrowLine" x1="0" y1="-7.5" x2="0" y2="7.5"></line>
    <g transform="translate(0, -10)">
      <polygon className="arrowHead" points="0,0 -3,5 +3,5" transform="rotate(0)"></polygon>
    </g>
    <g transform="translate(0, 10)">
      <polygon className="arrowHead" points="0,0 -3,5 +3,5" transform="rotate(180)"></polygon>
    </g>
    <g transform="translate(-10, 0)">
      <polygon className="arrowHead" points="0,0 -3,5 +3,5" transform="rotate(270)"></polygon>
    </g>
    <g transform="translate(10, 0)">
      <polygon className="arrowHead" points="0,0 -3,5 +3,5" transform="rotate(90)"></polygon>
    </g>
    <text x="20" y="-20" textAnchor="left" stroke="none">{pos[0]}, {pos[1]}</text>
  </g>
}

const app: React.FC = () => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [leftPos, setLeftPos] = useState<[number, number]>([100, 350]);
  const [rightPos, setRightPos] = useState<[number, number]>([350, 350]);
  const [ctrlPos, setCtrlPos] = useState<[number, number]>([225, 50])

  return <svg ref={svgRef} width="450" height="450">
    <path d={`M ${leftPos[0]} ${leftPos[1]} Q ${ctrlPos[0]} ${ctrlPos[1]}, ${rightPos[0]} ${rightPos[1]} `} stroke="red" strokeWidth="20" fill="none" />

    <line className="presentationHelper" x1={`${leftPos[0]} `} y1={`${leftPos[1]} `} x2={`${ctrlPos[0]} `} y2={`${ctrlPos[1]} `}></line>
    <line className="presentationHelper" x1={`${rightPos[0]} `} y1={`${rightPos[1]} `} x2={`${ctrlPos[0]} `} y2={`${ctrlPos[1]} `}></line>

    <DraggableIcon svgRef={svgRef} pos={leftPos} setPos={setLeftPos} />
    <DraggableIcon svgRef={svgRef} pos={rightPos} setPos={setRightPos} />
    <DraggableIcon svgRef={svgRef} pos={ctrlPos} setPos={setCtrlPos} />
  </svg>
}
</script>
<template>
  <ReactWrap :app="app" class="svg-demo" />
</template>
<style lang="css">
.svg-demo {
  svg {
    border: 1px solid #d5d5d5;
    user-select: none;
  }

  .draggable {
    fill: hsla(0, 0%, 82%, .585);
    cursor: grab;

    &:hover {
      fill: rgba(96, 0, 30, .8);

      .arrowHead {
        fill: white;
      }

      .arrowLine {
        stroke: white;
      }
    }

    .arrowHead {
      fill: dimgray;
    }

    .arrowLine {
      stroke-width: 2px;
      stroke: dimgray;
    }
  }

  .presentationHelper {
    stroke: dimgray;
    stroke-width: 1px;
    stroke-dasharray: 20, 20;
    fill: none;
  }

  .dragging {
    fill: rgba(193, 0, 61, .8);
    cursor: grabbing;
  }
}
</style>
```

:::

### foreignObject

SVG 中有一个`foreignObject`，理论上可以放置各种HTML元素，因此可以在一些静态场景用于“快照”截图，或者在SVG驱动的绘图引擎中与框架组件集成。这个例子中，第一个按钮是真实的按钮，其他的都是“快照”：

<ForeignObjectDemo />


::: details 点击展开源码

::: code-group

```tsx [Snapshot.tsx]
import React, { HTMLAttributes, useCallback, useEffect, useRef } from "react";

const serializer = new XMLSerializer();

export default (name: string) => {
  const From: React.FC<{ render: (props: any) => React.ReactNode }> = ({ render }) => {
    const ref = useRef<any>();

    const snapshot = useCallback((e: Event) => {
      const el = ref.current;

      if (!el) return;

      const clone = el.cloneNode(true);
      const styles = window.getComputedStyle(el);

      for (let style of styles) {
        clone.style[style] = styles[style];
      }

      const toIndex = (e as CustomEvent).detail;

      document.dispatchEvent(new CustomEvent(`${name}_${toIndex}`, {
        detail: serializer.serializeToString(clone)
      }))
    }, []);

    useEffect(() => {
      document.addEventListener(`${name}_snap`, snapshot);

      return () => document.removeEventListener(`${name}_snap`, snapshot);
    }, []);

    return render({ ref });
  }

  let toIndex = 0;
  const To: React.FC<{ dependencies?: any[] } & HTMLAttributes<SVGElement>> = ({ dependencies = [], ...rest }) => {
    const ref = useRef<SVGForeignObjectElement>(null);

    useEffect(() => {
      ++toIndex;
      const handle = (e: Event) => {
        if (!ref.current) return;
        ref.current.innerHTML = (e as CustomEvent).detail;
      }

      document.addEventListener(`${name}_${toIndex}`, handle);

      return () => document.removeEventListener(`${name}_${toIndex}`, handle);
    }, []);
    useEffect(() => {
      document.dispatchEvent(new CustomEvent(`${name}_snap`, {
        detail: toIndex // only notify myself
      }));
    }, dependencies);

    return <svg xmlns="http://www.w3.org/2000/svg" {...rest}>
      <foreignObject ref={ref} x="0" y="0" width="100%" height="100%" />
    </svg>
  };


  return { From, To }
}
```

```vue [Demo.vue]
<script setup lang="tsx">
import React, { useMemo, useState } from 'react';
import { h } from 'vue';
import Button from '../Button.vue';
import ReactWrap from '../ReactWrap.vue';
import createSnapshot from '../Snapshot.tsx';
import VueWrap from '../VueWrap.tsx';

const Snapshot = createSnapshot("demo");

const app = () => {
  const [count, setCount] = useState(0);

  const btn = useMemo(() => ({
    setup() {
      return () => h(
        Button,
        {
          onClick() {
            setCount(count + 1);
          }
        },
        () => `Clicked ${count} times`
      )
    }
  }), [count])

  return <>
    <Snapshot.From
      render={inject => {
        return <VueWrap app={btn} {...inject} />
      }}
    />
    <Snapshot.To />
    <Snapshot.To dependencies={[count]} />
  </>
}

</script>
<template>
  <ReactWrap :app="app" />
</template>
```

::: 
