<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { useData } from 'vitepress'
import { useMediaQuery } from '@vueuse/core';
import { useStep } from '../../hooks/useStep';
import VpButton from '../Button.vue';

const isSmallScreen = useMediaQuery('(max-width: 375px)');
const { isDark } = useData()

const colors = computed(() => isDark.value
  ? {
    bg: 'rgba(255,255,255,0.45)',
    fg: 'rgba(0,0,0,0.45)',
  }
  : {
    bg: 'rgba(0,0,0,0.45)',
    fg: 'rgba(255,255,255,0.45)',
  });

const SIZE = isSmallScreen.value ? 24 : 64; // grid cells
const bits = reactive(Array.from({ length: SIZE * SIZE }, () => false));
const generation = ref(0);
const alive = computed(() => bits.filter(Boolean).length);


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

const { pause, play } = useStep(tick);

const reset = () => {
  pause();
  generation.value = 0;
  for (let i = 0; i < bits.length; i++) {
    bits[i] = false;
  }
}

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

<template>
  <div class="game" :style="{ '--size': SIZE, '--bg': colors.bg, '--fg': colors.fg }">
    <div class="operation">
      <span>Generation: {{ generation }}</span>
      <span>Alive: {{ alive }}</span>
      <vp-button :style="{ marginInlineStart: 'auto' }" @click="tick">Tick</vp-button>
      <vp-button @click="play">Auto</vp-button>
      <vp-button @click="pause">Pause</vp-button>
      <vp-button @click="reset">Reset</vp-button>
    </div>
    <div class="container">
      <div v-for="(bit, index) in bits" class="item" :class="{ 'item--set': bit }"
        @pointerdown="handlePointerDown(index)" @pointerup="handlePointerUp" @pointermove="handlePointerMove(index)" />
    </div>
  </div>
</template>
<style scoped>
.game {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.container {
  display: grid;
  grid-template-columns: repeat(var(--size), 1fr);
  grid-template-rows: repeat(var(--size), 1fr);
  width: calc(var(--size) * 10px);
  height: calc(var(--size) * 10px);
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
  min-width: calc(var(--size) * 10px);
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
