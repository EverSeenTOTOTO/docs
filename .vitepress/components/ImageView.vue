<script setup lang="ts">
import { ref, reactive } from 'vue'
import { usePointer } from '@vueuse/core'
import Modal from './Modal.vue'

const { src } = defineProps(['src']);

const open = ref(false);
const scaleRate = reactive({ w: 1, h: 1 });
const transformOrigin = ref('0 0');
const closePreview = () => {
  transformOrigin.value = `${pointer.x.value}px ${pointer.y.value}px`
  open.value = false;
};

const trigger = ref(null);
const pointer = usePointer();
const show = () => {
  transformOrigin.value = `${pointer.x.value}px ${pointer.y.value}px`

  if (!trigger.value) return;

  scaleRate.h = trigger.value!.naturalHeight / window.innerHeight * 100;
  scaleRate.w = trigger.value!.naturalWidth / window.innerWidth * 100;
  open.value = true;
}

</script>
<template>
  <Modal :transformOrigin="transformOrigin" :open="open" @maskClick="closePreview" @wrapClick="closePreview">
    <img class="img" :src="src" :alt="src"
      :style="{ '--scaleWidth': `${scaleRate.h}%`, '--scaleHeight': `${scaleRate.w}%` }" />
  </Modal>
  <img ref="trigger" v-bind="$attrs" :src="src" :alt="src" @click="show" />
</template>
<style>
.main img {
  border-radius: 2px;
  cursor: pointer;
}
</style>
<style scoped>
.img {
  max-width: var(--scaleWidth);
  height: 90%;
}

@media screen and (max-width: 768px) {
  .img {
    max-height: var(--scaleHeight);
    width: 90%;
  }
}
</style>

