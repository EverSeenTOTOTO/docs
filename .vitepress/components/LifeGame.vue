<script setup lang="ts">
import { ref, computed } from 'vue';
import { useData } from 'vitepress'

const { isDark } = useData()
const bgColor = computed(() => !isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)');
const fgColor = computed(() => isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)');

const version = ref(0);
const forceUpdate = () => version.value++;

const SIZE = 64;

const range = Array.from({ length: SIZE * SIZE });
const view = new DataView(new ArrayBuffer(range.length / 8));

const convertIndexToOffset = (index: number) => {

  const rowIndex = index >> 6; // mod SIZE
  const colIndex = index & 0x3f;

  // console.log(rowIndex, colIndex);

  const byteOffset = rowIndex * (SIZE >> 3) + (colIndex >> 3);
  const bitOffset = colIndex & 0x7;

  return { bitOffset, byteOffset }
}

const isBitSet = (index: number) => {
  const { byteOffset, bitOffset } = convertIndexToOffset(index);
  const value = view.getUint8(byteOffset);
  return ((value >> bitOffset) & 1) === 1;
}

const toggleBit = (index: number) => {
  const { byteOffset, bitOffset } = convertIndexToOffset(index);
  const value = view.getUint8(byteOffset);

  view.setUint8(byteOffset, value ^ (1 << bitOffset));
  forceUpdate();
}

const pressing = ref(false);
const updated = new Map<number, boolean>();
const handlePointerDown = (index: number) => {
  pressing.value = true;
  toggleBit(index);
  updated.set(index, true)
}
const handlePointerEnter = (index: number) => {
  if (!pressing.value || updated.get(index)) return;
  toggleBit(index);
  updated.set(index, true)
}
const handlePointerUp = (_index: number) => {
  pressing.value = false;
  updated.clear();
}

</script>
<template>
  <div :key="version" class="container" :style="{ '--size': SIZE, '--bg': bgColor, '--fg': fgColor }">
    <div v-for="(_, index) in range" :key="index" class="item" :class="{ 'item--set': isBitSet(index) }"
      @pointerdown="handlePointerDown(index)" @pointerenter="handlePointerEnter(index)"
      @pointerup="handlePointerUp(index)" />
  </div>
</template>
<style scoped>
.container {
  display: grid;
  grid-template-columns: repeat(var(--size), 1fr);
  grid-template-rows: repeat(var(--size), 1fr);
  width: calc(var(--size) * 10px);
  height: calc(var(--size) * 10px);
  margin-block-start: 24px;
  border-inline-end: 1px solid var(--bg);
  border-block-end: 1px solid var(--bg);
}

.item {
  border-inline-start: 1px solid var(--bg);
  border-block-start: 1px solid var(--bg);

  &:hover {
    background-color: var(--bg);
  }
}

.item--set {
  background-color: var(--bg);
}
</style>
