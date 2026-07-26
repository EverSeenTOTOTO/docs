<script setup lang="ts">
import Stats from 'stats.js'
import { onMounted, onBeforeUnmount, ref } from 'vue'

const props = defineProps<{ panel?: 0 | 1 | 2 }>()
const container = ref<HTMLElement>()
let stats: Stats | null = null
let raf = 0

onMounted(() => {
  stats = new Stats()
  stats.showPanel(props.panel ?? 0) // 0: FPS, 1: MS, 2: MB
  // 默认是 fixed 浮在视口左上角，改成 relative 跟随本组件容器
  stats.dom.style.position = 'relative'
  stats.dom.style.display = 'block'
  container.value?.appendChild(stats.dom)
  const loop = () => {
    stats!.begin()
    stats!.end()
    raf = requestAnimationFrame(loop)
  }
  loop()
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  stats?.dom?.remove()
})
</script>

<template>
  <div ref="container" class="fps-stats" />
</template>

<style scoped>
.fps-stats {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 10;
}
</style>
