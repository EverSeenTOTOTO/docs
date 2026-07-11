<script setup lang="ts">
import { ref } from 'vue'
import { usePointer } from '@vueuse/core'
import Modal from './Modal.vue'

export type ImageViewMode = 'auto' | 'fit' | 'width' | 'height'
type ResolvedMode = Exclude<ImageViewMode, 'auto'>

const { src, mode = 'auto' } = defineProps<{ src: string; mode?: ImageViewMode }>()

const open = ref(false)
const transformOrigin = ref('0 0')
const resolvedMode = ref<ResolvedMode>('fit')

const pointer = usePointer()
const trigger = ref<HTMLImageElement | null>(null)

const closePreview = () => {
  transformOrigin.value = `${pointer.x.value}px ${pointer.y.value}px`
  open.value = false
}

// Pick the best display mode from the image's natural size vs the viewport.
// Only used when `mode === 'auto'`; explicit modes short-circuit.
const resolveMode = (natW: number, natH: number): ResolvedMode => {
  if (mode !== 'auto') return mode
  const vpW = window.innerWidth
  const vpH = window.innerHeight
  // How large the image would be if it were fit (contained) in the viewport.
  const fitScale = Math.min(1, vpW / natW, vpH / natH)
  const fitW = natW * fitScale
  const fitH = natH * fitScale
  // Only scroll when "fit" would shrink the image so far in one axis that it
  // stops filling the viewport there — a genuine long/wide strip. Below ~35%
  // the image is too small to read, so fill the other axis and scroll it.
  const FILL = 0.35
  if (natH > vpH && fitW < vpW * FILL) return 'width'
  if (natW > vpW && fitH < vpH * FILL) return 'height'
  return 'fit'
}

const openPreview = () => {
  transformOrigin.value = `${pointer.x.value}px ${pointer.y.value}px`
  if (!trigger.value) return
  resolvedMode.value = resolveMode(trigger.value.naturalWidth, trigger.value.naturalHeight)
  open.value = true
}
</script>

<template>
  <Modal :transformOrigin="transformOrigin" :open="open" @click="closePreview">
    <div
      v-if="resolvedMode === 'width' || resolvedMode === 'height'"
      class="scrollbox"
      :class="`scrollbox--${resolvedMode}`"
    >
      <img class="img" :src="src" :alt="src" />
    </div>
    <img v-else class="img img--fit" :src="src" :alt="src" />
  </Modal>
  <img ref="trigger" v-bind="$attrs" :src="src" :alt="src" @click="openPreview" />
</template>

<style>
.main img {
  border-radius: 2px;
  cursor: pointer;
}
</style>

<style scoped>
.img {
  display: block;
}

/* fit: whole image visible, never larger than the viewport. */
.img--fit {
  max-width: 100%;
  max-height: 100%;
}

/* Directional modes: a full-viewport scroll layer sits over the modal's
   centered flex container so the overflowing axis can scroll. The scroll
   axis always starts at flex-start so the start edge stays reachable. */
.scrollbox {
  width: 100%;
  height: 100%;
}

/* width basis: fill width, scroll vertically (long/tall images). */
.scrollbox--width {
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.scrollbox--width .img {
  width: 100%;
  height: auto;
  flex-shrink: 0;
}

/* height basis: fill height, scroll horizontally (wide/panorama images). */
.scrollbox--height {
  overflow-x: auto;
  overflow-y: hidden;
  display: flex;
  align-items: center;
}

.scrollbox--height .img {
  width: auto;
  height: 100%;
  flex-shrink: 0;
}
</style>
