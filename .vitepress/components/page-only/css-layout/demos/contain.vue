<script setup lang="ts">
import { ref, computed } from 'vue'
import { useData } from 'vitepress'

const { isDark } = useData()
const contained = ref(false)

const boxStyle = computed(() => ({
  contain: contained.value ? 'content' : 'none',
}))

const c = computed(() =>
  isDark.value
    ? { stage: 'rgba(255,255,255,0.04)', child: '#7c2d12' }
    : { stage: 'rgba(0,0,0,0.03)', child: '#fed7aa' },
)
</script>

<template>
  <div class="demo">
    <div class="controls">
      <label class="toggle">
        <input type="checkbox" v-model="contained" />
        <span><code>contain: content</code></span>
      </label>
    </div>

    <div class="stage" :style="{ background: c.stage }">
      <div class="box" :style="boxStyle">
        <span class="cap">容器</span>
        <div class="child" :style="{ background: c.child }">伸出盒子的子元素</div>
      </div>
    </div>

    <p class="note">
      <template v-if="!contained">子元素伸出容器边界，绘制溢出到了外面。</template>
      <template v-else">开了 <code>contain: content</code>，子树被封装：伸出去的绘制被裁掉（paint 隔离，<b>看得见</b>）；它内部的布局变化也不再触发外部 reflow（layout 隔离，性能层面）。</template>
    </p>
  </div>
</template>

<style scoped>
.demo { padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); margin: 16px 0; }
.controls { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; }
.toggle { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; color: var(--vp-c-text-2); font-size: 13px; }
.toggle input { width: 16px; height: 16px; cursor: pointer; }
code { font-size: 0.9em; background: var(--vp-c-bg-alt); padding: 1px 5px; border-radius: 3px; }
.stage { border-radius: 4px; padding: 28px; }
.box { position: relative; width: 280px; height: 90px; border: 2px dashed var(--vp-c-brand); border-radius: 4px; }
.cap { position: absolute; top: 6px; left: 8px; font-size: 12px; color: var(--vp-c-text-3); }
.child { position: absolute; right: -30px; bottom: -30px; width: 90px; height: 90px; display: flex; align-items: center; justify-content: center; text-align: center; padding: 6px; border-radius: 4px; font-size: 12px; line-height: 16px; color: var(--vp-c-text-1); }
.note { margin: 12px 0 0; font-size: 12.5px; line-height: 1.6; color: var(--vp-c-text-2); }
.note b { color: var(--vp-c-text-1); }
</style>
