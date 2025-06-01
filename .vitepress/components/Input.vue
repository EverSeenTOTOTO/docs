<script setup lang="ts">
import { useData } from 'vitepress';
import { ref } from 'vue';
import { computed } from 'vue';

const input = ref();

defineExpose({
  get el() {
    return input.value;
  }
})

const { isDark } = useData()
const bg = computed(() => isDark.value ? '#2a8148' : '#c6f1d5');
</script>

<template>
  <input ref="input" class="vp-input" :style="{ '--bg': bg }" v-bind="$attrs" />
</template>
<style scoped>
.vp-input {
  padding-inline: 6px;
  border-radius: 3px;
  font-weight: bold;
  line-height: 22px;
  border: 1px solid #d9d9d9;

  &:hover {
    border: 1px solid var(--vp-c-text-1);
  }
}
</style>
