<script setup lang="ts">
import { useWindowScroll } from '@vueuse/core'

const { y } = useWindowScroll({
  behavior: 'smooth'
})
const scrollTop = () => {
  y.value = 0
};
</script>
<template>
  <div class="scrollTop" @click="scrollTop" :style="{ '--range': '800px' }">Scroll to top↑</div>
</template>
<style scoped>
.scrollTop {
  padding-left: 16px;
  line-height: 32px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  animation: fadeIn 1s linear forwards;
  animation-timeline: scroll(root);
  animation-range: 0 var(--range);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}
</style>
