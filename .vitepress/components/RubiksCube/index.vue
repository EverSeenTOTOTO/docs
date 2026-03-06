<script setup lang="tsx">
import { useData } from 'vitepress';
import { computed } from 'vue';
import ReactWrap from '../ReactWrap.vue';
import RubiksCubeReact from './RubiksCube';
import type { HighlightConfig } from './types';

const { isDark } = useData()
const bg = computed(() => isDark.value ? '#2a8148' : '#c6f1d5');

const props = defineProps<{
  defaultValue?: string;
  modelValue?: string;
  highlights?: HighlightConfig[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', state: string): void;
}>();

const App = () => {
  return (
    <RubiksCubeReact
      defaultValue={props.defaultValue}
      value={props.modelValue}
      highlights={props.highlights}
      onChange={(state: string) => emit('update:modelValue', state)}
    />
  );
};
</script>

<template>
  <ReactWrap :app="App" :style="{ '--bg': bg }" />
</template>

<style>
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
