<script setup lang="ts">
import { useData } from 'vitepress';
import { ref } from 'vue';
import { computed } from 'vue';

const btn = ref();

defineExpose({
  get el() {
    return btn.value;
  }
})

const { isDark } = useData()
const bg = computed(() => isDark.value ? '#2a8148' : '#c6f1d5');
</script>

<template>
  <button ref="btn" type="button" class="vp-button" :class="{ 'vp-button--disabled': $attrs.disabled }"
    :style="{ '--bg': bg }" v-bind="$attrs">
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

.vp-button--disabled {
  color: var(--vp-c-text-3);
  cursor: not-allowed;

  &:active {
    opacity: 1;
  }

  &:hover {
    background-color: transparent;
  }
}
</style>
