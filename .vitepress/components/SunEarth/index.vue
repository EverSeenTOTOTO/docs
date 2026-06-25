<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useData } from 'vitepress';
import { SunEarthScene } from './scene';

const { isDark } = useData();

const TROPIC = 23.5; // 回归线纬度（= 黄赤交角）

const containerRef = ref<HTMLElement | null>(null);
const paused = ref(false);
const spinEnabled = ref(true);
const subsolarLat = ref(0);

let scene: SunEarthScene | null = null;

onMounted(() => {
  if (!containerRef.value) return;
  scene = new SunEarthScene(containerRef.value);
  scene.onSubsolarLatChange = (deg) => (subsolarLat.value = deg);
  scene.setDark(isDark.value);
});

onBeforeUnmount(() => {
  scene?.dispose();
  scene = null;
});

watch(isDark, (v) => scene?.setDark(v));

function togglePause() {
  paused.value = !paused.value;
  if (scene) scene.paused = paused.value;
}
function toggleSpin() {
  spinEnabled.value = !spinEnabled.value;
  if (scene) scene.spinEnabled = spinEnabled.value;
}
function reset() {
  scene?.reset();
}

const latText = computed(() => {
  const v = subsolarLat.value;
  if (Math.abs(v) < 0.1) return '赤道（0°）';
  const abs = Math.abs(v).toFixed(1);
  return `${v > 0 ? '北纬' : '南纬'} ${abs}°`;
});

const seasonText = computed(() => {
  const v = subsolarLat.value;
  if (v >= TROPIC - 0.4) return '直射北回归线 · 北半球夏至';
  if (v <= -(TROPIC - 0.4)) return '直射南回归线 · 北半球冬至';
  if (Math.abs(v) < 0.4) return '直射赤道 · 春分 / 秋分';
  return v > 0 ? '直射北半球 · 北半球夏半年' : '直射南半球 · 北半球冬半年';
});
</script>

<template>
  <div class="se-wrap">
    <div ref="containerRef" class="se-canvas" />
    <div class="se-panel">
      <div class="se-row">
        <div class="se-controls">
          <button class="se-btn primary" @click="togglePause">{{ paused ? '▶ 播放' : '⏸ 暂停' }}</button>
          <button class="se-btn" :class="{ off: !spinEnabled }" @click="toggleSpin">
            自转：{{ spinEnabled ? '开' : '关' }}
          </button>
          <button class="se-btn" @click="reset">⟲ 重置</button>
        </div>
        <div class="se-readout">
          <div class="se-lat">太阳直射点：<b>{{ latText }}</b></div>
          <div class="se-season">{{ seasonText }}</div>
        </div>
      </div>
      <div class="se-hint">拖拽地球 = 公转 · 拖拽太阳 = 平移 · 拖拽空白处 = 旋转视角 · 滚轮缩放</div>
      <div class="se-legend">
        <span><i style="background:#ff7a33" />赤道</span>
        <span><i style="background:#ffd24a" />南北回归线</span>
        <span><i style="background:#ffffff" />自转轴 / 极点</span>
        <span><i style="background:#ffec3d" />太阳直射点</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.se-wrap {
  margin: 16px 0;
  border: 1px solid var(--vp-c-divider, rgba(60, 60, 67, 0.29));
  border-radius: 10px;
  overflow: hidden;
  background: var(--vp-c-bg, #fff);
}
.se-canvas {
  width: 100%;
  height: clamp(360px, 56vh, 600px);
  cursor: grab;
}
.se-panel {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--vp-c-divider, rgba(60, 60, 67, 0.29));
  background: var(--vp-c-bg-soft, #f6f6f6);
}
.se-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}
.se-controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.se-btn {
  padding: 5px 12px;
  font-size: 13px;
  line-height: 1.6;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider, #ccc);
  background: var(--vp-c-bg, #fff);
  color: var(--vp-c-text-1, #1f1f1f);
  cursor: pointer;
  transition: opacity 0.15s, background 0.15s;
}
.se-btn:hover { opacity: 0.82; }
.se-btn.primary { background: #3e8bff; border-color: #3e8bff; color: #fff; }
.se-btn.off { opacity: 0.5; }
.se-readout {
  font-size: 13px;
  color: var(--vp-c-text-1, #1f1f1f);
  text-align: right;
}
.se-lat b { color: #d98b00; }
.se-season { color: var(--vp-c-text-2, #666); font-size: 12px; }
.se-hint {
  font-size: 12px;
  color: var(--vp-c-text-2, #888);
}
.se-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  font-size: 12px;
  color: var(--vp-c-text-2, #666);
}
.se-legend span { display: inline-flex; align-items: center; gap: 5px; }
.se-legend i {
  width: 12px;
  height: 3px;
  border-radius: 2px;
  display: inline-block;
}
</style>
