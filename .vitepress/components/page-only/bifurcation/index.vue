<script setup lang="ts">
import { useData } from 'vitepress'
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { R_MIN, R_MAX, logistic, useBifurcation } from './useBifurcation'

const { isDark } = useData()

const { r, attrs, period } = useBifurcation()

// 主题色：分叉点用前景色 + 密度透明度，高亮/引导线用醒目强调色
const isDarkMode = computed(() => isDark.value)
const fg = computed(() => (isDarkMode.value ? [255, 255, 255] : [20, 20, 20]))
const fgHex = computed(() => (isDarkMode.value ? '#ffffff' : '#141414'))
const accent = computed(() => (isDarkMode.value ? '#67d5ff' : '#1d63c9'))

// ----- 画布与尺寸 -----
const bifCanvas = ref<HTMLCanvasElement>()

let size = { w: 0, h: 0 }
let bifData: ImageData | null = null // 预计算的分叉图像素

const fitSize = () => {
  const c = bifCanvas.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  const w = c.clientWidth, h = c.clientHeight
  c.width = Math.max(1, Math.round(w * dpr))
  c.height = Math.max(1, Math.round(h * dpr))
  size = { w, h }
}

// 预计算并缓存整个分叉图（密度累积）
const buildBifurcation = () => {
  const c = bifCanvas.value
  if (!c) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const W = c.width, H = c.height
  const img = ctx.createImageData(W, H)
  const count = new Uint8Array(W * H)
  const data = img.data

  for (let px = 0; px < W; px++) {
    const rr = R_MIN + ((R_MAX - R_MIN) * px) / (W - 1)
    let x = 0.5
    for (let i = 0; i < 260; i++) x = logistic(rr, x) // 暂态
    for (let i = 0; i < 160; i++) {
      x = logistic(rr, x)
      const row = Math.max(0, Math.min(H - 1, Math.round((1 - x) * (H - 1))))
      const idx = row * W + px
      count[idx] = Math.min(count[idx] + 1, 255)
    }
  }

  const K = 8 // 密度 -> 透明度增益
  const [fr, fgg, fb] = fg.value
  for (let i = 0; i < W * H; i++) {
    const a = Math.min(255, count[i] * K)
    const o = i * 4
    data[o] = fr
    data[o + 1] = fgg
    data[o + 2] = fb
    data[o + 3] = a
  }
  bifData = img
}

// 当前 R 的分叉图叠加：竖直引导线 + 该 R 的吸引子亮点
const drawBifurcation = () => {
  const c = bifCanvas.value
  if (!c) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const { w, h } = size

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  if (bifData) {
    ctx.putImageData(bifData, 0, 0)
  }

  const px = (rr: number) => ((rr - R_MIN) / (R_MAX - R_MIN)) * w
  const py = (x: number) => (1 - x) * h
  const rr = r.value

  // 悬停引导线（比当前 r 更淡）
  if (hover.value != null) {
    ctx.strokeStyle = accent.value
    ctx.globalAlpha = 0.18
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px(hover.value), 0)
    ctx.lineTo(px(hover.value), h)
    ctx.stroke()
  }

  // 当前 r 引导线
  ctx.strokeStyle = accent.value
  ctx.globalAlpha = 0.45
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(px(rr), 0)
  ctx.lineTo(px(rr), h)
  ctx.stroke()

  // 当前吸引子
  ctx.fillStyle = accent.value
  ctx.globalAlpha = 1
  for (const x of attrs.value) {
    ctx.beginPath()
    ctx.arc(px(rr), py(x), 1.6, 0, Math.PI * 2)
    ctx.fill()
  }

  // 坐标标签
  ctx.fillStyle = fgHex.value
  ctx.globalAlpha = 0.7
  ctx.font = '11px sans-serif'
  ctx.fillText('R', w - 12, h - 4)
  ctx.fillText('x', 4, 12)
  ctx.globalAlpha = 1
}

// 画布内像素横坐标 -> R 值
const canvasXToR = (clientX: number) => {
  const c = bifCanvas.value
  if (!c) return null
  const rect = c.getBoundingClientRect()
  const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  return R_MIN + (R_MAX - R_MIN) * t
}

const hover = ref<number | null>(null)
const onCanvasMove = (e: PointerEvent) => {
  const rr = canvasXToR(e.clientX)
  if (rr == null) return
  hover.value = rr
  redraw()
}
const onCanvasLeave = () => {
  hover.value = null
  redraw()
}
const onCanvasClick = (e: PointerEvent) => {
  const rr = canvasXToR(e.clientX)
  if (rr == null) return
  r.value = rr
  redraw()
}

const redraw = () => {
  drawBifurcation()
}

watch(isDark, () => {
  nextTick(() => {
    fitSize()
    buildBifurcation()
    redraw()
  })
})

let ro: ResizeObserver | null = null
onMounted(() => {
  fitSize()
  buildBifurcation()
  redraw()
  ro = new ResizeObserver(() => {
    fitSize()
    buildBifurcation()
    redraw()
  })
  if (bifCanvas.value) ro.observe(bifCanvas.value)
})

onUnmounted(() => {
  ro?.disconnect()
})

const periodText = computed(() => {
  const p = period.value
  if (p <= 0) return '混沌'
  if (p === 1) return '不动点'
  return `周期 ${p}`
})
</script>

<template>
  <div class="bifurcation">
    <canvas ref="bifCanvas" class="bif-canvas" @click="onCanvasClick" @pointermove="onCanvasMove"
      @pointerleave="onCanvasLeave"></canvas>

    <div class="operation">
      <div class="readout">
        <span class="formula">x<sub>n+1</sub> = r·x<sub>n</sub>(1−x<sub>n</sub>)</span>
        <span>r = <b>{{ r.toFixed(3) }}</b></span>
        <span>{{ periodText }}</span>
      </div>
    </div>

    <p class="hint">完整分叉图（r 从 2.6 到 4.0）。<b>点击画布</b>：按横向位置设定 r，竖线标注当前 r，亮点为其吸引子。</p>
  </div>
</template>

<style scoped>
.bifurcation {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-block: 8px;
}

.bif-canvas {
  width: 100%;
  height: auto;
  aspect-ratio: 4 / 2.5;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  cursor: crosshair;
}

.operation {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  width: 100%;
  margin-block: 16px 4px;
}

.readout {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: baseline;
  width: 100%;
  margin-block-end: 8px;
  font-size: 14px;

  .formula {
    font-weight: bold;
  }
}

.hint {
  color: var(--vp-c-text-2);
  font-size: 13px;
  margin-block-start: 8px;
}
</style>
