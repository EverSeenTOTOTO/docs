<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useData } from 'vitepress'

const { isDark } = useData()
const width = ref(380)
const breakWord = ref(false)

const boxEl = ref<HTMLElement>()
const lineCount = ref(0)

const boxStyle = computed(() => ({
  width: width.value + 'px',
  overflowWrap: breakWord.value ? 'break-word' : 'normal',
}))

const c = computed(() =>
  isDark.value
    ? { chip: '#3730a3', ib: '#7c2d12', long: '#831843', box: 'rgba(255,255,255,0.04)' }
    : { chip: '#c7d2fe', ib: '#fed7aa', long: '#fbcfe8', box: 'rgba(0,0,0,0.03)' },
)

const recompute = () => {
  const el = boxEl.value
  if (!el) return
  const cs = getComputedStyle(el)
  const lh = parseFloat(cs.lineHeight) || 24
  const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
  lineCount.value = Math.max(1, Math.round((el.scrollHeight - pad) / lh))
}

let ro: ResizeObserver | undefined
onMounted(() => {
  recompute()
  if (typeof ResizeObserver !== 'undefined' && boxEl.value) {
    ro = new ResizeObserver(recompute)
    ro.observe(boxEl.value)
  }
})
onBeforeUnmount(() => ro?.disconnect())
watch([width, breakWord], () => nextTick(recompute))
</script>

<template>
  <div class="demo">
    <div class="controls">
      <label class="ctrl">
        <span class="lbl">容器宽度 <code>{{ width }}px</code></span>
        <input type="range" min="180" max="560" v-model.number="width" />
      </label>
      <label class="toggle">
        <input type="checkbox" v-model="breakWord" />
        <span><code>overflow-wrap: break-word</code></span>
      </label>
      <span class="stat">当前约 {{ lineCount }} 行</span>
    </div>

    <div ref="boxEl" class="line-box" :style="[boxStyle, { background: c.box }]">
      内联流里混排着
      <span class="chip" :style="{ background: c.chip }">span 片段</span>
      、一段普通文字、一个
      <button class="btn">按钮</button>
      、一个
      <i class="ib" :style="{ background: c.ib }">inline-block</i>
      、emoji 🚀，以及长串
      <b class="long" :style="{ background: c.long }">supercalifragilisticexpialidocious</b>
      。
    </div>

    <p class="hint">
      拖动宽度观察原子单元如何在容器边缘整体换行；长串没有软断点，默认会溢出，打开 <code>break-word</code> 才能在字符间断开。
    </p>
  </div>
</template>

<style scoped>
.demo {
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  margin: 16px 0;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
.ctrl { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--vp-c-text-2); }
.lbl { display: inline-flex; align-items: center; gap: 6px; }
.ctrl input[type='range'] { width: 200px; cursor: pointer; }
.toggle { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; color: var(--vp-c-text-2); font-size: 13px; }
.toggle input { width: 16px; height: 16px; cursor: pointer; }
.stat { font-size: 13px; color: var(--vp-c-text-3); }
code { font-size: 0.9em; background: var(--vp-c-bg-alt); padding: 1px 5px; border-radius: 3px; }

.line-box {
  border: 2px dashed var(--vp-c-brand);
  border-radius: 4px;
  padding: 10px 12px;
  font-size: 14px;
  line-height: 24px;
  max-width: 100%;
  color: var(--vp-c-text-1);
}
.chip { padding: 0 4px; border-radius: 3px; }
.ib { font-style: normal; padding: 4px 8px; border-radius: 3px; display: inline-block; }
.long { font-weight: 600; padding: 0 4px; border-radius: 3px; }
.btn {
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  padding: 1px 8px;
  font-size: 13px;
  background: var(--vp-c-bg-alt);
  color: var(--vp-c-text-1);
  cursor: pointer;
}
.hint {
  margin: 12px 0 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
</style>
