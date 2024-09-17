<script setup lang="ts">
import { useData } from 'vitepress';
import { computed } from 'vue';

const { isDark } = useData()
const bg = computed(() => isDark.value ? '#2a8148' : '#c6f1d5');
</script>

<template>
  <button type="button" class="vp-button" :style="{ '--bg': bg }">
    <slot />
  </button>
</template>
<style scoped>
.vp-button {
  padding-inline: 6px;
  border-radius: 3px;
  font-weight: bold;

  &:active {
    opacity: 0.6;
  }

  &:hover {
    background-color: var(--bg);
  }
}
</style>
