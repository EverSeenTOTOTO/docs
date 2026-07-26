<script setup lang="ts">
import { ref, computed } from 'vue'
import { useData } from 'vitepress'

const { isDark } = useData()
const useFlex = ref(false)

const parentStyle = computed(() => ({
  display: useFlex.value ? 'flex' : 'block',
  flexDirection: 'column',
}))
const bodyStyle = computed(() =>
  useFlex.value
    ? { flex: '1', height: 'auto' }
    : { flex: 'none', height: '100%' },
)

const c = computed(() =>
  isDark.value
    ? { head: '#374151', body: '#1e3a8a', parent: '#60a5fa' }
    : { head: '#e5e7eb', body: '#bfdbfe', parent: '#3b82f6' },
)
</script>

<template>
  <div class="demo">
    <div class="controls">
      <label class="toggle">
        <input type="checkbox" v-model="useFlex" />
        <span>改用 <code>flex: 1</code> 撑满剩余空间</span>
      </label>
    </div>

    <div class="parent" :style="[parentStyle, { outlineColor: c.parent }]">
      <div class="head" :style="{ background: c.head }">头部 · 固定高 40px</div>
      <div class="body" :style="[bodyStyle, { background: c.body }]">内容区 · 想撑满剩余空间</div>
    </div>

    <p class="note">
      <template v-if="!useFlex"><code>height: 100%</code> 锚的是父的<b>整个</b>高（200px），叠上头部 40px 后整体超出父、溢出了——它不懂"剩余空间"。</template>
      <template v-else"><code>flex: 1</code> 让内容区吃掉头部之外的剩余空间，正好填满，不多不少。</template>
    </p>
  </div>
</template>

<style scoped>
.demo { padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); margin: 16px 0; }
.controls { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; }
.toggle { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; color: var(--vp-c-text-2); font-size: 13px; }
.toggle input { width: 16px; height: 16px; cursor: pointer; }
code { font-size: 0.9em; background: var(--vp-c-bg-alt); padding: 1px 5px; border-radius: 3px; }
.parent { height: 200px; outline: 2px dashed #3b82f6; border-radius: 4px; overflow: visible; }
.head { height: 40px; display: flex; align-items: center; padding: 0 10px; border-radius: 3px 3px 0 0; font-size: 13px; color: var(--vp-c-text-1); }
.body { display: flex; align-items: center; justify-content: center; padding: 0 10px; font-size: 13px; color: #fff; }
.note { margin: 12px 0 0; font-size: 12.5px; line-height: 1.6; color: var(--vp-c-text-2); }
.note b { color: var(--vp-c-text-1); }
</style>
