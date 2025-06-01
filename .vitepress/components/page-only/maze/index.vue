<script setup lang="ts">
import { useData } from 'vitepress';
import { computed, ref, watch } from 'vue';
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
    pathBg: '#aaaa2e',
    carBg: '#73b0ee'
  }
  : {
    bg: 'rgba(0,0,0,0.45)',
    fg: 'rgba(255,255,255,0.45)',
    startBg: '#d72222',
    endBg: '#55bb30',
    pathBg: '#e4e45f',
    carBg: '#73b0ee'
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

  modes,
} = useMaze();

type Modes = keyof typeof modes;

const mode = ref<Modes>('dfs');
const traverse = computed(() => modes[mode.value]);

const MODE_OPTIONS = Object.keys(modes).map(key => ({
  label: key,
  value: key
}));

const isIdle = computed(() => traverse.value.state.value !== 'idle');

const createItemClass = (i: number) => ({
  'item--wall': isWall(i),
  'item--car': isCar(i),
  'item--path': isPath(i),
  'item--start': isStart(i),
  'item--end': isEnd(i),
})

</script>

<template>
  <div class="game"
    :style="{ '--size': SIZE, '--bg': colors.bg, '--fg': colors.fg, '--start-bg': colors.startBg, '--end-bg': colors.endBg, '--path-bg': colors.pathBg, '--car-bg': colors.carBg }">
    <div class="operation">
      <label for="typeSelect">迷宫形状：</label>
      <vp-select id="typeSelect" :disabled="isIdle" :value="mazeType" @change="e => mazeType = e.target.value"
        :options="MAZE_OPTIONS"></vp-select>

      <!-- random config -->
      <vp-input id="denseInput" v-if="mazeType === 'random'" placeholder="密度" type="number" :disabled="isIdle"
        :value="dense" min="0" max="1" step="0.01"
        @change="e => dense = Math.max(Math.min(0.99, parseFloat(e.target.value)), 0)" />
      <vp-button v-if="mazeType === 'random'" :disabled="isIdle" @click="generateRandomMaze">重新生成</vp-button>

      <!-- custom config -->
      <label v-if="mazeType === 'custom'" for="placeSelect">放置：</label>
      <vp-select id="placeSelect" v-if="mazeType === 'custom'" :disabled="isIdle" :value="placeType"
        @change="e => placeType = e.target.value" :options="PLACE_OPTIONS"></vp-select>

      <vp-select :style="{ marginInlineStart: 'auto' }" :disabled="isIdle" :value="mode"
        @change="e => mode = e.target.value" :options="MODE_OPTIONS" />
      <vp-button :disabled="!traverse.canPlay" @click="traverse.play">开始</vp-button>
      <vp-button :disabled="!traverse.canPause" @click="traverse.pause">暂停</vp-button>
      <vp-button @click="traverse.reset">重置</vp-button>
    </div>
    <div class="container">
      <div v-for="(int, index) in ints" class="item" :class="createItemClass(int)"
        @pointerdown="handlePointerDown(index)" @pointerup="handlePointerUp" @pointermove="handlePointerMove(index)"
        @click="console.log(index, int)" />
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

.item--path {
  background-color: var(--path-bg);
}

.item--car {
  background-color: var(--car-bg);
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
