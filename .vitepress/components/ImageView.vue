<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, reactive } from 'vue'
import { usePointer } from '@vueuse/core'
import Modal from './Modal.vue'

const image = ref(null)
const url = ref('');
const open = computed(() => url.value !== '');
const scaleRate = reactive({ w: 1, h: 1 });
const transformOrigin = ref('0 0');
const closePreview = () => {
  transformOrigin.value = `${pointer.x.value}px ${pointer.y.value}px`
  url.value = '';
};

const pointer = usePointer();
const bindClick = (img: HTMLImageElement) => {
  img.addEventListener('click', () => {
    transformOrigin.value = `${pointer.x.value}px ${pointer.y.value}px`

    url.value = img.src;
    scaleRate.h = img.height / window.innerHeight * 100;
    scaleRate.w = img.width / window.innerWidth * 100;
  });
}

const observer = ref<MutationObserver>(null);

onMounted(() => {
  const targetNode = document.querySelector('.main');

  if (!targetNode) return;

  targetNode.querySelectorAll('img').forEach(imgNode => {
    bindClick(imgNode);
  });

  observer.value = new MutationObserver((mutationsList) => {
    for (let mutation of mutationsList) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeName === 'IMG') {
            bindClick(node as HTMLImageElement);
          }
          if (node.nodeType === Node.ELEMENT_NODE && node.hasChildNodes()) {
            (node as HTMLElement).querySelectorAll('img').forEach(imgNode => {
              bindClick(imgNode)
            });
          }
        });
      }
    }
  });
  observer.value.observe(targetNode, { childList: true, subtree: true });
});
onUnmounted(() => {
  observer.value?.disconnect();
});

</script>
<template>
  <Modal :transformOrigin="transformOrigin" :open="open" @maskClick="closePreview" @wrapClick="closePreview">
    <img ref="image" :src="url" :alt="url"
      :style="{ '--scaleWidth': `${scaleRate.h}%`, '--scaleHeight': `${scaleRate.w}%` }" />
  </Modal>
</template>
<style>
.main img {
  border-radius: 2px;
  cursor: pointer;
}
</style>
<style scoped>
img {
  max-width: var(--scaleWidth);
  max-height: 100%;
}

@media screen and (max-width: 768px) {
  img {
    max-height: var(--scaleHeight);
    max-width: 100%;
  }
}
</style>
