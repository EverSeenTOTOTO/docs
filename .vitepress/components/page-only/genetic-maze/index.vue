<script setup lang="ts">
import { useData } from 'vitepress'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import VpButton from '../../Button.vue'
import { useGeneticMaze } from './useGeneticMaze'

const { isDark } = useData()

const {
  size, start, end,
  cells,
  popSize, mutationRate, speed,
  generation, running,
  best, bestHistory, avgHistory,
  stepGenerations, regenerateMaze, reset, toggleWall,
} = useGeneticMaze()

const solved = computed(() => best.value.reached)
const lastAvg = computed(() => avgHistory.value[avgHistory.value.length - 1] ?? 0)
const bestDisplay = computed(() => {
  if (best.value.reached) return `已到达（${best.value.steps} 步）`
  return best.value.fit > -1e9 ? best.value.fit.toFixed(0) : '—'
})

const colors = computed(() => {
  const dark = isDark.value
  return {
    wall: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
    heat: dark ? 'rgba(103,213,255,0.22)' : 'rgba(29,99,201,0.18)',
    best: dark ? '#eecf3f' : '#8a7b0a',
    bestFade: dark ? 'rgba(238,207,63,0.3)' : 'rgba(138,123,10,0.28)',
    start: dark ? '#5fe45f' : '#55bb30',
    end: dark ? '#e45f5f' : '#d72222',
  }
})

// ----- 适应度曲线（canvas） -----
const chartCanvas = ref<HTMLCanvasElement>()
const chartAccent = computed(() => (isDark.value ? '#67d5ff' : '#1d63c9'))
let chartSize = { w: 0, h: 0 }

const styleVars = computed(() => ({
  '--size': String(size.value),
  '--itemWidth': '15px',
  '--wall': colors.value.wall,
  '--heat': colors.value.heat,
  '--best': colors.value.best,
  '--bestFade': colors.value.bestFade,
  '--start': colors.value.start,
  '--end': colors.value.end,
  '--chartAccent': chartAccent.value,
}))

const fitChart = () => {
  const c = chartCanvas.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  const w = c.clientWidth, h = c.clientHeight
  c.width = Math.max(1, Math.round(w * dpr))
  c.height = Math.max(1, Math.round(h * dpr))
  chartSize = { w, h }
}

const drawChart = () => {
  const c = chartCanvas.value
  if (!c) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const { w, h } = chartSize
  const pad = 8

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const bh = bestHistory.value
  if (!bh.length) return

  // 到达终点后适应度跃升到 1e6 量级，用 log 压缩纵轴才能同时看清此前的小幅增长
  const t = (f: number) => Math.log10(1 + Math.max(0, f))
  const n = bh.length
  const ts = bh.map(t)
  let mn = Math.min(...ts), mx = Math.max(...ts)
  if (mx - mn < 1e-6) mx = mn + 1

  const X = (i: number) => pad + (w - 2 * pad) * (i / Math.max(1, n - 1))
  const Y = (v: number) => pad + (h - 2 * pad) * (1 - (v - mn) / (mx - mn))

  // 平均适应度（淡色）
  ctx.strokeStyle = isDark.value ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const x = X(i), y = Y(t(avgHistory.value[i] ?? 0))
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.stroke()

  // 最优适应度（强调色）
  ctx.strokeStyle = chartAccent.value
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const x = X(i), y = Y(ts[i])
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.stroke()

  // 说明文字
  ctx.fillStyle = isDark.value ? '#fff' : '#141414'
  ctx.globalAlpha = 0.65
  ctx.font = '10px sans-serif'
  const last = lastAvg.value
  ctx.fillText(`gen ${generation.value}  最优 ${best.value.fit.toFixed(0)}  平均 ${last.toFixed(0)}`, pad, h - 2)
  ctx.globalAlpha = 1
}

// ----- 动画：每帧推进 speed 代 -----
let raf = 0
const loop = () => {
  if (!running.value) return
  stepGenerations(speed.value)
  drawChart()
  raf = requestAnimationFrame(loop)
}

const togglePlay = () => {
  if (running.value) {
    running.value = false
    cancelAnimationFrame(raf)
  } else {
    running.value = true
    raf = requestAnimationFrame(loop)
  }
}

const stepOnce = () => {
  stepGenerations(speed.value)
  drawChart()
}

let ro: ResizeObserver | null = null
onMounted(() => {
  fitChart()
  ro = new ResizeObserver(() => {
    fitChart()
    drawChart()
  })
  if (chartCanvas.value) ro.observe(chartCanvas.value)
})

onUnmounted(() => {
  running.value = false
  cancelAnimationFrame(raf)
  ro?.disconnect()
})

watch(isDark, () => nextTick(drawChart))
</script>

<template>
  <div class="game" :style="styleVars">
    <div class="stage">
      <div class="container" title="点击格子切换墙">
        <div v-for="(cls, i) in cells" :key="i" class="item" :class="[cls, { start: i === start, end: i === end }]"
          @click.stop="toggleWall(i)" />
      </div>

      <div class="chart-wrap">
        <div class="legend">
          <span><i class="dot best"></i> 最优路径</span>
          <span><i class="dot heat"></i> 种群云</span>
          <span><i class="line"></i> 最优适应度</span>
        </div>
        <canvas ref="chartCanvas" class="chart"></canvas>
      </div>
    </div>

    <div class="stats">
      <span>世代 <b>{{ generation }}</b></span>
      <span>最优 <b>{{ bestDisplay }}</b></span>
      <span>平均 <b>{{ lastAvg.toFixed(0) }}</b></span>
      <span class="hint">{{ solved ? '已求解，继续演化会在更短的路径上优化' : '探索中…' }}</span>
    </div>

    <div class="operation">
      <vp-button @click="togglePlay">{{ running ? '暂停' : '播放' }}</vp-button>
      <vp-button @click="stepOnce">单步</vp-button>
      <vp-button @click="reset">重置</vp-button>
      <vp-button @click="regenerateMaze">重新生成迷宫</vp-button>

      <label>
        种群
        <vp-button :style="{ marginInline: '0 6px' }" @click="popSize = Math.max(20, popSize - 10)">−</vp-button>
        <b>{{ popSize }}</b>
        <vp-button :style="{ marginInline: '6px' }" @click="popSize = Math.min(120, popSize + 10)">＋</vp-button>
      </label>

      <label>
        变异率 <input class="range" type="range" min="0.01" max="0.2" step="0.005" v-model.number="mutationRate">
        <span class="val">{{ (mutationRate * 100).toFixed(1) }}%</span>
      </label>

      <label>
        速度 <input class="range" type="range" min="1" max="10" step="1" v-model.number="speed">
        <span class="val">{{ speed }} 代/帧</span>
      </label>
    </div>
  </div>
</template>

<style scoped>
.game {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-block: 8px;
}

.stage {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
  width: 100%;
}

.container {
  display: grid;
  grid-template-columns: repeat(var(--size), 1fr);
  width: calc(var(--size) * var(--itemWidth));
  height: calc(var(--size) * var(--itemWidth));
  border-inline-end: 1px solid var(--wall);
  border-block-end: 1px solid var(--wall);
}

.item {
  width: var(--itemWidth);
  height: var(--itemWidth);
  border-inline-start: 1px solid var(--wall);
  border-block-start: 1px solid var(--wall);
  cursor: pointer;

  &:hover {
    box-shadow: inset 0 0 0 2px var(--vp-c-brand-1);
  }
}

.item.wall {
  background-color: var(--wall);
}

.item.heat {
  background-color: var(--heat);
}

.item.best {
  background-color: var(--best);
}

.item.best-fade {
  background-color: var(--bestFade);
}

.item.start {
  background-color: var(--start);
}

.item.end {
  background-color: var(--end);
}

.chart-wrap {
  flex: 1 1 300px;
  min-width: 260px;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--vp-c-text-2);
  margin-block-end: 6px;

  .dot,
  .line {
    display: inline-block;
    vertical-align: middle;
    margin-inline-end: 4px;
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 2px;

    &.best {
      background-color: var(--best);
    }

    &.heat {
      background-color: var(--heat);
    }
  }

  .line {
    width: 14px;
    height: 0;
    border-block-start: 2px solid var(--chartAccent);
  }
}

.chart {
  width: 100%;
  height: 200px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
}

.stats {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 16px;
  margin-block: 12px 4px;
  font-size: 14px;

  .hint {
    color: var(--vp-c-text-3);
    font-size: 12px;
  }
}

.operation {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-block: 6px 0;

  label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--vp-c-text-2);
  }

  .val {
    min-width: 44px;
    color: var(--vp-c-text-1);
  }
}

.range {
  width: 90px;
  accent-color: var(--vp-c-brand-1);
}
</style>