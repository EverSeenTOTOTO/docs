<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useData } from 'vitepress'
import {
  prepareWithSegments,
  layoutNextLineRange,
  materializeLineRange,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'

const { isDark } = useData()

const c = computed(() =>
  isDark.value
    ? { img: '#7c2d12', imgText: '#fff' }
    : { img: '#fed7aa', imgText: '#222' },
)

const FONT = '14px sans-serif'
const W = 360, H = 300, PAD = 12, LH = 22, FS = 14
const D = 84
const R = D / 2

// === CSS 侧 ===
const side = ref<'left' | 'right'>('left')
const cssTextRef = ref<HTMLElement>()
const cssImgTop = ref(0)
let cssDragging = false

const onCssDown = (e: PointerEvent) => {
  cssDragging = true
  ;(e.target as Element).setPointerCapture?.(e.pointerId)
}
const onCssMove = (e: PointerEvent) => {
  if (!cssDragging || !cssTextRef.value) return
  const rect = cssTextRef.value.getBoundingClientRect()
  const relX = e.clientX - rect.left
  side.value = relX < rect.width / 2 ? 'left' : 'right'
  cssImgTop.value = Math.max(0, Math.min(rect.height - D - 8, e.clientY - rect.top - R))
}
const onCssUp = () => { cssDragging = false }

// === pretext 侧（DOM 渲染）===
const pxStageRef = ref<HTMLElement>()
const img = ref({ x: 138, y: 100 })
const prepared = ref<PreparedTextWithSegments | null>(null)
let dragging = false

const TEXT = '圆形障碍物浮在中间，可以拖动它，文字会实时沿圆弧绕着重排——每一行的可用宽度都是渲染前就能算出来的已知量。当圆挡在正中间时，文字分成左右两股从两侧绕过，这正是 float 难以做到的。pretext 把每行的可用宽度变成了可预测的输入，障碍物再怎么摆、是什么形状，都只是一串减法。'

// 圆在该行占用的 x 范围 → 文字可排的若干区间
const zonesForLine = (yTop: number, yBot: number) => {
  const cx = img.value.x + R
  const cy = img.value.y + R
  // 整行 [yTop, yBot] 内最靠近圆心的位置 → 最大占用，保证文字不被遮
  const yNear = cy < yTop ? yTop : cy > yBot ? yBot : cy
  const dy = Math.abs(yNear - cy)
  if (dy >= R) return [{ start: PAD, width: W - 2 * PAD }]
  const dx = Math.sqrt(R * R - dy * dy)
  const left = cx - dx
  const right = cx + dx
  const zones: { start: number; width: number }[] = []
  if (left - PAD >= 14) zones.push({ start: PAD, width: left - PAD })
  if (W - PAD - right >= 14) zones.push({ start: right, width: W - PAD - right })
  return zones.length ? zones : [{ start: PAD, width: W - 2 * PAD }]
}

// 逐行算出每段文字 + 坐标
const layout = computed(() => {
  const p = prepared.value
  if (!p) return [] as { text: string; left: number; top: number }[]
  const out: { text: string; left: number; top: number }[] = []
  let cursor = { segmentIndex: 0, graphemeIndex: 0 }
  let y = PAD
  while (y < H - FS) {
    for (const z of zonesForLine(y, y + LH)) {
      const range = layoutNextLineRange(p, cursor, z.width)
      if (!range) { y = H; break }
      const line = materializeLineRange(p, range)
      if (line.text) out.push({ text: line.text, left: z.start, top: y })
      cursor = range.end
    }
    y += LH
  }
  return out
})

const onDown = (e: PointerEvent) => {
  dragging = true
  ;(e.target as Element).setPointerCapture?.(e.pointerId)
}
const onMove = (e: PointerEvent) => {
  if (!dragging || !pxStageRef.value) return
  const rect = pxStageRef.value.getBoundingClientRect()
  img.value = {
    x: Math.max(PAD, Math.min(W - PAD - D, e.clientX - rect.left - R)),
    y: Math.max(PAD, Math.min(H - PAD - D, e.clientY - rect.top - R)),
  }
}
const onUp = () => { dragging = false }

onMounted(() => { prepared.value = prepareWithSegments(TEXT, FONT) })
onBeforeUnmount(() => { dragging = false; cssDragging = false })
</script>

<template>
  <div class="demo">
    <div class="grid">
      <section>
        <div class="tag">CSS · float + shape-outside（圆，但只能贴边）</div>
        <div ref="cssTextRef" class="css-text">
          <div
            class="float-img"
            :style="{ float: side, marginTop: cssImgTop + 'px', background: c.img, color: c.imgText }"
            @pointerdown="onCssDown"
            @pointermove="onCssMove"
            @pointerup="onCssUp"
          >图片（可拖）</div>
          {{ TEXT }}
        </div>
        <p class="note">拖动图片：水平方向会被 float 吸到最近的左或右边缘，只有垂直能跟着走——绕圆虽然做到了（shape-outside），但圆停不到正中间。</p>
      </section>

      <section>
        <div class="tag">pretext · DOM 渲染 + 逐行可用宽度（圆，随便拖）</div>
        <div ref="pxStageRef" class="px-stage">
          <span v-for="(ln, i) in layout" :key="i" class="ln" :style="{ left: ln.left + 'px', top: ln.top + 'px' }">{{ ln.text }}</span>
          <div
            class="obstacle"
            :style="{ left: img.x + 'px', top: img.y + 'px', background: c.img, color: c.imgText }"
            @pointerdown="onDown"
            @pointermove="onMove"
            @pointerup="onUp"
          >图片（可拖）</div>
        </div>
        <p class="note">pretext 算出每行内容和坐标，渲染成绝对定位的 <code>&lt;span&gt;</code>——圆每行的占用按弧线算，拖到正中间文字分成左右两股绕过。</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.demo { padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); margin: 16px 0; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 760px) { .grid { grid-template-columns: 1fr; } }
section { min-width: 0; }
.tag { font-size: 12.5px; font-weight: 600; color: var(--vp-c-text-2); margin-bottom: 8px; }
.css-text { font-size: 14px; line-height: 22px; font-family: sans-serif; color: var(--vp-c-text-1); border: 2px dashed var(--vp-c-brand); border-radius: 4px; padding: 10px; height: 300px; overflow: hidden; }
.float-img { width: 84px; height: 84px; border-radius: 50%; shape-outside: circle(50%); display: flex; align-items: center; justify-content: center; font-size: 11px; margin: 0 8px 4px 0; cursor: grab; touch-action: none; user-select: none; }
.px-stage { position: relative; width: 360px; height: 300px; border: 2px dashed var(--vp-c-brand); border-radius: 4px; overflow: hidden; }
.ln { position: absolute; font-size: 14px; line-height: 22px; font-family: sans-serif; white-space: nowrap; color: var(--vp-c-text-1); }
.obstacle { position: absolute; width: 84px; height: 84px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; cursor: grab; touch-action: none; user-select: none; }
.note { margin: 10px 0 0; font-size: 12.5px; line-height: 1.6; color: var(--vp-c-text-2); }
.note code { font-size: 0.9em; background: var(--vp-c-bg-alt); padding: 1px 5px; border-radius: 3px; }
</style>
