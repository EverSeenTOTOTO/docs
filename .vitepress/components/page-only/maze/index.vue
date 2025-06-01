<script setup lang="ts">
import { useData } from 'vitepress';
import { computed } from 'vue';
import { useStep } from '../../../hooks/useStep';
import VpButton from '../../Button.vue';
import VpInput from '../../Input.vue';
import VpSelect from '../../Select.vue';
import { useMaze } from './useMaze';

const { isDark } = useData()

const colors = computed(() => isDark.value
  ? {
    bg: 'rgba(255,255,255,0.45)',
    fg: 'rgba(0,0,0,0.45)',
    startBg: '#e45f5f',
    endBg: '#5fe45f',
  }
  : {
    bg: 'rgba(0,0,0,0.45)',
    fg: 'rgba(255,255,255,0.45)',
    startBg: '#d72222',
    endBg: '#55bb30',
  });

const {
  ints,
  SIZE,

  isWall,
  isCar,
  isPath,
  isStart,
  isEnd,

  mazeType,
  MAZE_OPTIONS,

  dense,
  generateRandomMaze,

  placeType,
  PLACE_OPTIONS,
  handlePointerUp,
  handlePointerDown,
  handlePointerMove,
} = useMaze();

const createItemClass = (i: number) => ({
  'item--wall': isWall(i),
  'item--car': isCar(i),
  'item--path': isPath(i),
  'item--start': isStart(i),
  'item--end': isEnd(i),
})

const { play, pause } = useStep(console.log);
const start = () => { };
const reset = () => { };

</script>

<template>
  <div class="game"
    :style="{ '--size': SIZE, '--bg': colors.bg, '--fg': colors.fg, '--start-bg': colors.startBg, '--end-bg': colors.endBg }">
    <div class="operation">
      <label for="typeSelect">迷宫形状：</label>
      <vp-select id="typeSelect" :value="mazeType" @change="e => mazeType = e.target.value"
        :options="MAZE_OPTIONS"></vp-select>

      <!-- random config -->
      <vp-input id="denseInput" v-if="mazeType === 'random'" placeholder="密度" type="number" :value="dense" min="0"
        max="1" step="0.01" @change="e => dense = Math.max(Math.min(0.99, parseFloat(e.target.value)), 0)" />
      <vp-button v-if="mazeType === 'random'" @click="generateRandomMaze">重新生成</vp-button>

      <!-- custom config -->
      <label v-if="mazeType === 'custom'" for="placeSelect">放置：</label>
      <vp-select id="placeSelect" v-if="mazeType === 'custom'" :value="placeType"
        @change="e => placeType = e.target.value" :options="PLACE_OPTIONS"></vp-select>

      <vp-button :style="{ marginInlineStart: 'auto' }" @click="start">开始</vp-button>
      <vp-button @click="reset">重置</vp-button>
    </div>
    <div class="container">
      <div v-for="(int, index) in ints" class="item" :class="createItemClass(int)"
        @pointerdown="handlePointerDown(index)" @pointerup="handlePointerUp" @pointermove="handlePointerMove(index)" />
    </div>
  </div>
</template>
<style scoped>
.game {
  display: flex;
  flex-direction: column;
  align-items: flex-start;

  --itemWidth: 18px;
}

.container {
  display: grid;
  grid-template-columns: repeat(var(--size), 1fr);
  grid-template-rows: repeat(var(--size), 1fr);
  width: calc(var(--size) * var(--itemWidth));
  height: calc(var(--size) * var(--itemWidth));
  border-inline-end: 1px solid var(--bg);
  border-block-end: 1px solid var(--bg);
}

.item {
  border-inline-start: 1px solid var(--bg);
  border-block-start: 1px solid var(--bg);

  &:hover {
    background-color: var(--bg);
  }

  &:active {
    opacity: 0.6;
  }
}

.item--wall {
  background-color: var(--bg);
}

.item--start {
  background-color: var(--start-bg);
}

.item--end {
  background-color: var(--end-bg);
}

.operation {
  display: flex;
  flex-wrap: wrap;
  min-width: calc(var(--size) * var(--itemWidth));
  margin-block: 24px 12px;

  #typeSelect {
    margin-inline-end: 8px;
  }

  #denseInput {
    max-width: 80px;
  }
}

@media (max-width: 1024px) {
  .game {
    align-items: center;
  }
}
</style>
