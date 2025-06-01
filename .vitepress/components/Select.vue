<script setup lang="ts">
import { ref } from 'vue';

const select = ref();

defineExpose({
  get el() {
    return select.value;
  }
})

export type VpSelectProps = {
  options: { label: string; value: string }[];
  value?: string;
}

const { value, options = [] } = defineProps<VpSelectProps>();
</script>

<template>
  <select ref="select" class="vp-select" :value="value" @change="$emit('change', $event)" v-bind="$attrs">
    <option v-for="{ label, value } in options" :key="value" :value="value">
      {{ label }}
    </option>
  </select>
</template>
<style scoped>
.vp-select {
  padding-inline: 8px;
  border-radius: 3px;
  min-width: 120px;
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 14px;
  height: 24px;
  line-height: 20px;
  border: 1px solid #d9d9d9;

  &:hover {
    border: 1px solid var(--vp-c-text-1);
  }

  option {
    font-size: 14px;
  }
}
</style>
