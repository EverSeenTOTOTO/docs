<script setup lang="ts">
import { ref, computed } from 'vue'
import { useData } from 'vitepress'

const { isDark } = useData()
const isolate = ref(true)

const parentStyle = computed(() => ({
  display: isolate.value ? 'flow-root' : 'block',
}))

const c = computed(() =>
  isDark.value
    ? { parent: '#60a5fa', float: '#1e3a8a', child: '#14532d', stage: 'rgba(255,255,255,0.04)' }
    : { parent: '#3b82f6', float: '#bfdbfe', child: '#bbf7d0', stage: 'rgba(0,0,0,0.04)' },
)
</script>

<template>
  <div class="demo">
    <label class="toggle">
      <input type="checkbox" v-model="isolate" />
      <span>父容器 <code>display: flow-root</code>（建立独立 BFC）</span>
    </label>

    <div class="grid">
      <figure>
        <figcaption>① 包含浮动</figcaption>
        <div class="stage" :style="{ background: c.stage }">
          <div class="parent" :style="[parentStyle, { outlineColor: c.parent }]">
            <div class="floated" :style="{ background: c.float }">float</div>
            <p>一行文字环绕浮动。</p>
          </div>
        </div>
        <p class="note">
          <template v-if="isolate">父元素包住了浮动，高度被撑起。</template>
          <template v-else>浮动不计入父高度，父"塌陷"，float 溢出到容器底边之外。</template>
        </p>
      </figure>

      <figure>
        <figcaption>② 阻止 margin 穿透</figcaption>
        <div class="stage" :style="{ background: c.stage }">
          <div class="parent" :style="[parentStyle, { outlineColor: c.parent }]">
            <div class="child" :style="{ background: c.child }">子元素 margin-top: 28px</div>
          </div>
        </div>
        <p class="note">
          <template v-if="isolate">子的 margin 被父包住，留在父内部。</template>
          <template v-else>子的 margin 穿过父边界，父子 margin 折叠，间距露到父外面。</template>
        </p>
      </figure>
    </div>
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
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  margin-bottom: 16px;
  color: var(--vp-c-text-2);
  font-size: 13px;
}
.toggle input { width: 16px; height: 16px; cursor: pointer; }
code {
  font-size: 0.9em;
  background: var(--vp-c-bg-alt);
  padding: 1px 5px;
  border-radius: 3px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
@media (max-width: 720px) {
  .grid { grid-template-columns: 1fr; }
}
figure { margin: 0; }
figcaption {
  font-weight: 600;
  font-size: 13px;
  color: var(--vp-c-text-2);
  margin-bottom: 8px;
}
.stage {
  border-radius: 4px;
  min-height: 110px;
}
.parent {
  outline: 2px dashed #3b82f6;
}
.floated {
  float: left;
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 12px;
  border-radius: 3px;
}
.parent p { margin: 4px 8px; font-size: 13px; line-height: 20px; color: var(--vp-c-text-2); }
.child {
  margin-top: 28px;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--vp-c-text-1);
  border-radius: 3px;
}
.note {
  margin: 8px 0 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}
</style>
