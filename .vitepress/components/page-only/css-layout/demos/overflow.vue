<script setup lang="ts">
import { ref, computed } from 'vue'
import { useData } from 'vitepress'

const { isDark } = useData()
const borderBox = ref(true)

const c = computed(() =>
  isDark.value
    ? { box: 'rgba(255,255,255,0.04)' }
    : { box: 'rgba(0,0,0,0.03)' },
)
</script>

<template>
  <div class="demo">
    <div class="controls">
      <label class="toggle">
        <input type="checkbox" v-model="borderBox" />
        <span><code>box-sizing: border-box</code></span>
      </label>
    </div>

    <figure>
      <figcaption>② 元素声明：width:100% 配 padding，box-sizing 决定是否溢出</figcaption>
      <div class="stage" :style="{ background: c.box }">
        <div class="outer">
          <div class="inner" :style="{ boxSizing: borderBox ? 'border-box' : 'content-box' }">width: 100% + padding + border</div>
        </div>
      </div>
      <p class="note">
        <template v-if="!borderBox">content-box 下，100% 只算内容区，加上 padding、border 后实际超过了父宽。</template>
        <template v-else">border-box 把 padding、border 都算进 100% 里，正好填满父宽。</template>
      </p>
    </figure>
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
  gap: 16px;
  margin-bottom: 16px;
}
.toggle { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; color: var(--vp-c-text-2); font-size: 13px; }
.toggle input { width: 16px; height: 16px; cursor: pointer; }
code { font-size: 0.9em; background: var(--vp-c-bg-alt); padding: 1px 5px; border-radius: 3px; }

figure { margin: 0 0 16px; }
figure:last-child { margin-bottom: 0; }
figcaption { font-weight: 600; font-size: 13px; color: var(--vp-c-text-2); margin-bottom: 8px; }
.stage { border-radius: 4px; padding: 14px; }
.box {
  width: 200px;
  overflow-x: auto;
  border: 2px dashed var(--vp-c-brand);
  border-radius: 4px;
  padding: 8px 10px;
  font-size: 14px;
  line-height: 22px;
  color: var(--vp-c-text-1);
}
.outer {
  width: 200px;
  border: 2px dashed var(--vp-c-brand);
  border-radius: 4px;
}
.inner {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid var(--vp-c-brand);
  background: var(--vp-c-bg-alt);
  font-size: 13px;
  color: var(--vp-c-text-1);
}
.note { margin: 8px 0 0; font-size: 12.5px; line-height: 1.5; color: var(--vp-c-text-2); }
</style>
