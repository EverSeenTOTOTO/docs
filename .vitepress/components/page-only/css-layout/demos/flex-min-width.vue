<script setup lang="ts">
import { ref, computed } from 'vue'
import { useData } from 'vitepress'

const { isDark } = useData()
const minZero = ref(false)
const breakWord = ref(false)

const urlStyle = computed(() => ({
  minWidth: minZero.value ? '0' : 'auto',
  overflowWrap: breakWord.value ? 'break-word' : 'normal',
}))

const c = computed(() =>
  isDark.value
    ? { a: '#1e3a8a', url: '#7c2d12', b: '#14532d', stage: 'rgba(255,255,255,0.04)' }
    : { a: '#bfdbfe', url: '#fed7aa', b: '#bbf7d0', stage: 'rgba(0,0,0,0.03)' },
)
</script>

<template>
  <div class="demo">
    <div class="controls">
      <label class="toggle">
        <input type="checkbox" v-model="minZero" />
        <span><code>min-width: 0</code></span>
      </label>
      <label class="toggle">
        <input type="checkbox" v-model="breakWord" />
        <span><code>overflow-wrap: break-word</code></span>
      </label>
    </div>

    <div class="stage" :style="{ background: c.stage }">
      <div class="flex">
        <div class="item" :style="{ background: c.a }">A</div>
        <div class="item url" :style="[urlStyle, { background: c.url }]">https://example.com/very/long/path/to/somewhere</div>
        <div class="item" :style="{ background: c.b }">B</div>
      </div>
    </div>

    <p class="note">
      <template v-if="!minZero && !breakWord">默认：<code>min-width: auto</code>（下限 = min-content），长 URL 压不动，撑爆容器。</template>
      <template v-else-if="minZero && !breakWord">只开 <code>min-width: 0</code>：下限解除，URL 子项可以被压缩了，但 URL 本身不会从中间断——它还是溢出子项自身。</template>
      <template v-else-if="!minZero && breakWord">只开 <code>overflow-wrap</code>：URL 能从中间断了，但 <code>min-width: auto</code> 还在——容器整体仍被撑爆。</template>
      <template v-else>两者都开：下限解除 + URL 内部断行，三者塞回容器。</template>
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
.flex { display: flex; width: 280px; gap: 6px; overflow-x: auto; border: 2px dashed var(--vp-c-brand); border-radius: 4px; padding: 6px; }
.item { flex: 0 1 auto; padding: 8px 10px; border-radius: 3px; font-size: 13px; line-height: 20px; color: #fff; }
.note { margin: 12px 0 0; font-size: 12.5px; line-height: 1.6; color: var(--vp-c-text-2); }
</style>
