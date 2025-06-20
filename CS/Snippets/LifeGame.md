<script setup>
import LifeGame from '@vp/page-only/LifeGame.vue'
</script>

# Conway's Game of Life

生命游戏。试用下 Vitepress 在 Markdown 中引入 Vue 文件的功能。

<LifeGame />

::: code-group
```vue [script]
<script setup lang="ts">
import { ref, reactive, computed, onUnmounted } from 'vue';
import { useData } from 'vitepress'
import { useMediaQuery } from '@vueuse/core'

const isSmallScreen = useMediaQuery('(max-width: 1024px)');
const { isDark } = useData()

const colors = computed(() => isDark.value
  ? {
    bg: 'rgba(255,255,255,0.45)',
    fg: 'rgba(0,0,0,0.45)',
    btnBg: '#2a8148',
  }
  : {
    bg: 'rgba(0,0,0,0.45)',
    fg: 'rgba(255,255,255,0.45)',
    btnBg: '#c6f1d5',
  });

const SIZE = isSmallScreen.value ? 24 : 64; // grid cells
const bits = reactive(Array.from({ length: SIZE * SIZE }, () => false));
const generation = ref(0);
const alive = computed(() => bits.filter(Boolean).length);

let interval: NodeJS.Timeout | null = null;

const toggleBit = (index: number) => bits.splice(index, 1, !bits[index]);
const tick = () => {
  if (alive.value === 0) return;

  const newBitMap = bits.slice();
  const neighbors: boolean[] = [];
  const computeNeighbors = (index: number) => {
    const rem = (val: number) => (val + bits.length) % bits.length;
    // top left
    neighbors[0] = bits[rem(index - SIZE - 1)];
    // top
    neighbors[1] = bits[rem(index - SIZE)];
    // top right
    neighbors[2] = bits[rem(index - SIZE + 1)];
    // left
    neighbors[3] = bits[rem(index - 1)];
    // right
    neighbors[4] = bits[rem(index + 1)];
    // bottom left
    neighbors[5] = bits[rem(index + SIZE - 1)];
    // bottom
    neighbors[6] = bits[rem(index + SIZE)];
    // bottom right
    neighbors[7] = bits[rem(index + SIZE + 1)];
  }

  for (let i = 0; i < bits.length; i++) {
    computeNeighbors(i);
    const alive = neighbors.filter(Boolean).length;
    newBitMap[i] = newBitMap[i] ? alive === 2 || alive === 3 : alive === 3;
  }

  bits.splice(0, bits.length, ...newBitMap);
  generation.value++;
}
const pause = () => clearInterval(interval);
const auto = () => {
  pause();
  interval = setInterval(tick, 300)
}
const reset = () => {
  pause();
  generation.value = 0;
  for (let i = 0; i < bits.length; i++) {
    bits[i] = false;
  }
}

onUnmounted(pause)

const pressed = ref(false);
const updated = new Map<number, boolean>();
const handlePointerDown = (index: number) => {
  pressed.value = true;
  toggleBit(index);
  updated.set(index, true);
}
const handlePointerMove = (index: number) => {
  if (!pressed.value || updated.get(index)) return;
  toggleBit(index);
  updated.set(index, true)
}
const handlePointerUp = () => {
  pressed.value = false;
  updated.clear();
}
</script>
```

```vue [template]
<template>
  <div class="game" :style="{ '--size': SIZE, '--btnBg': colors.btnBg, '--bg': colors.bg, '--fg': colors.fg }">
    <div class="operation">
      <span>Generation: {{ generation }}</span>
      <span>Alive: {{ alive }}</span>
      <button :style="{ marginInlineStart: 'auto' }" @click="tick">Tick</button>
      <button @click="auto">Auto</button>
      <button @click="pause">Pause</button>
      <button @click="reset">Reset</button>
    </div>
    <div class="container">
      <div v-for="(bit, index) in bits" class="item" :class="{ 'item--set': bit }" @pointerdown="handlePointerDown(index)"
        @pointerup="handlePointerUp" @pointermove="handlePointerMove(index)" />
    </div>
  </div>
</template>
```

```vue [style]
<style scoped>
.game {
  display: flex;
  flex-direction: column;
  align-items: flex-start;

  --itemWidth: 10px;
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

.item--set {
  background-color: var(--bg);
}

.operation {
  display: flex;
  flex-wrap: wrap;
  min-width: calc(var(--size) * var(--itemWidth));
  margin-block: 24px 12px;

  &>span {
    flex: 0 0 25%;
  }
}

@media (max-width: 1024px) {
  .game {
    align-items: center;
  }

  .operation {

    &>span {
      flex: 0 0 50%;
    }

    &>span:last-of-type {
      text-align: right;
    }
  }
}
</style>
:::
