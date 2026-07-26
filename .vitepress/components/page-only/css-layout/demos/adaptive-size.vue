<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useData } from 'vitepress'
import { prepare, layout, measureNaturalWidth, type PreparedText } from '@chenglou/pretext'

const { isDark } = useData()
void isDark

const TEXT = '响应式布局：宽度收缩时，字号先自适应，压到下限后才被迫换行'
const FAMILY = 'sans-serif'
const MIN = 12, MAX = 24, PAD = 16 // PAD = 文本区内边距（box padding 8 × 2）
const width = ref(420)

const prepares = ref<Record<number, PreparedText>>({})
const threshold = ref(0) // 跳变临界：12px 单行所需的 box 宽

onMounted(() => {
  const map: Record<number, PreparedText> = {}
  for (let s = MIN; s <= MAX; s++) map[s] = prepare(TEXT, `${s}px ${FAMILY}`)
  prepares.value = map
  threshold.value = measureNaturalWidth(map[MIN]) + PAD
})

// 从大到小找当前宽度下“单行还装得下”的最大字号；都装不下就换行
const result = computed(() => {
  const ps = prepares.value
  if (Object.keys(ps).length === 0) return { size: MIN, wrap: true }
  const contentW = width.value - PAD
  for (let s = MAX; s >= MIN; s--) {
    if (layout(ps[s], contentW, Math.round(s * 1.4)).lineCount === 1) {
      return { size: s, wrap: false }
    }
  }
  return { size: MIN, wrap: true }
})

const lh = computed(() => Math.round(result.value.size * 1.4))
</script>

<template>
  <div class="demo">
    <div class="controls">
      <label class="ctrl">
        <span>容器宽度 <code>{{ width }}px</code></span>
        <input type="range" :min="Math.max(80, Math.round(threshold) - 80 || 80)" :max="540" v-model.number="width" />
      </label>
    </div>

    <div class="stage">
      <div class="box" :style="{ width: width + 'px' }">
        <div class="text" :style="{ fontSize: result.size + 'px', lineHeight: lh + 'px' }">{{ TEXT }}</div>
      </div>
    </div>

    <p class="note">
      当前字号 <b>{{ result.size }}px</b> · {{ result.wrap ? '已跳变：字号压到下限 12px 仍单行装不下，被迫换行' : '单行（字号随宽度自适应）' }}<br>
      跳变临界 ≈ <b>{{ Math.round(threshold) }}px</b>—— pretext 量出来的精确值，不是二分调试确定的。
    </p>
  </div>
</template>

<style scoped>
.demo { position: relative; padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); margin: 16px 0; }
.controls { margin-bottom: 16px; }
.ctrl { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--vp-c-text-2); }
.ctrl input[type='range'] { width: 260px; cursor: pointer; }
code { font-size: 0.9em; background: var(--vp-c-bg-alt); padding: 1px 5px; border-radius: 3px; }
.stage { padding: 16px; border-radius: 4px; background: var(--vp-c-bg-alt); }
.box { box-sizing: border-box; padding: 8px; outline: 2px dashed var(--vp-c-brand); outline-offset: -2px; border-radius: 4px; overflow: hidden; }
.text { font-family: sans-serif; color: var(--vp-c-text-1); }
.note { margin: 12px 0 0; font-size: 12.5px; line-height: 1.7; color: var(--vp-c-text-2); }
.note b { color: var(--vp-c-text-1); }
</style>
