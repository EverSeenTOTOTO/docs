---
layout: page
---

<script setup>
import ImageGallery from '@vp/ImageGallery.vue';
import cat from './cat.webp'
import dusk from './dusk.webp'

const items = [
  {
    src: cat,
    desc: '一只猫'
  },
  {
    src: dusk,
    desc: '北龙湖。我总是临近傍晚才出去游荡，因此拍出来的照片也一副萧瑟苍凉的模样'
  }
]
</script>

<ImageGallery :items="items">
  <template #title>
    <h1>郑州</h1>
  </template>
</ImageGallery>
