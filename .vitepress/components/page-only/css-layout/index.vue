<script setup lang="ts">
import { computed, defineAsyncComponent, type Component } from 'vue'

const props = defineProps<{ demo?: string }>()

const modules = import.meta.glob<{ default: Component }>('./demos/*.vue')

const registry: Record<string, Component> = {}
for (const path in modules) {
  const name = path.match(/\.\/demos\/(.+)\.vue$/)?.[1]
  if (name) registry[name] = defineAsyncComponent(modules[path]!)
}

const Demo = computed(() => (props.demo ? registry[props.demo] ?? null : null))
</script>

<template>
  <ClientOnly>
    <component :is="Demo" v-if="Demo" />
    <div v-else class="css-layout-empty">
      演示占位：<code>{{ props.demo || '未指定 demo' }}</code>
    </div>
  </ClientOnly>
</template>

<style scoped>
.css-layout-empty {
  padding: 12px 16px;
  border: 1px dashed var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-3);
  font-size: 13px;
}
.css-layout-empty code {
  background: var(--vp-c-bg-alt);
  padding: 1px 5px;
  border-radius: 3px;
}
</style>
