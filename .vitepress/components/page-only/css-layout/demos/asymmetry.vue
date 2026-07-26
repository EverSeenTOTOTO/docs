<script setup lang="ts">
import { ref, computed } from 'vue'
import { useData } from 'vitepress'

const { isDark } = useData()
const fixParentHeight = ref(false)

const parentStyle = computed(() => ({
  height: fixParentHeight.value ? '160px' : 'auto',
}))

const c = computed(() =>
  isDark.value
    ? { parent: '#60a5fa', child: '#1e3a8a', stage: 'rgba(255,255,255,0.04)' }
    : { parent: '#3b82f6', child: '#bfdbfe', stage: 'rgba(0,0,0,0.03)' },
)
</script>

<template>
  <div class="demo">
    <div class="controls">
      <label class="toggle">
        <input type="checkbox" v-model="fixParentHeight" />
        <span>给父容器确定高度（<code>height: 160px</code>）</span>
      </label>
    </div>

    <div class="stage" :style="{ background: c.stage }">
      <div class="parent" :style="[parentStyle, { outlineColor: c.parent }]">
        <div class="child" :style="{ background: c.child }">
          width: 50%<br />height: 50%
        </div>
      </div>
    </div>

    <p class="note">
      同一个子元素同时声明了 <code>width: 50%</code> 和 <code>height: 50%</code>。
      <template v-if="!fixParentHeight">父高度是 <code>auto</code>（还没定下来），于是 <b>width: 50% 生效</b>（占父宽一半）、<b>height: 50% 落空</b>（退回内容高）。</template>
      <template v-else>父高度一固定，<b>height: 50% 立刻生效</b>——它锚的是父高，父高定了它才有意义，而 width 始终不受影响。</template>
    </p>
  </div>
</template>

<style scoped>
.demo { padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); margin: 16px 0; }
.controls { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; }
.toggle { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; color: var(--vp-c-text-2); font-size: 13px; }
.toggle input { width: 16px; height: 16px; cursor: pointer; }
code { font-size: 0.9em; background: var(--vp-c-bg-alt); padding: 1px 5px; border-radius: 3px; }
.stage { border-radius: 4px; padding: 14px; }
.parent { width: 320px; outline: 2px dashed #3b82f6; border-radius: 4px; }
.child { width: 50%; height: 50%; padding: 10px; box-sizing: border-box; border-radius: 3px; font-size: 13px; line-height: 20px; color: #fff; }
.note { margin: 12px 0 0; font-size: 12.5px; line-height: 1.6; color: var(--vp-c-text-2); }
.note b { color: var(--vp-c-text-1); }
</style>
