<script setup lang="ts">
import { useWindowScroll } from '@vueuse/core'

const { y } = useWindowScroll({
  behavior:'smooth'
})
const scrollTop = () => {
  y.value = 0
};
</script>
<template>
  <div v-if="y > 600" class="scrollTop" @click="scrollTop">Scroll to top↑</div>
</template>
<style scoped>
.scrollTop {
  padding-left: 16px;
  line-height: 32px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
</style>
