---
layout: page
---

<script setup>
import ImageGallery from '@vp/ImageGallery.vue';

const items = [
  {
    src: './park.webp',
    desc: '后襄河公园'
  },
  {
    src: './time.webp',
    desc: '新时代'
  },
  {
    src: './HouGuanLake.webp',
    desc: '后官湖'
  },
  {
    src: './HouGuanLake2.webp',
    desc: '后官湖'
  },
  {
    src: './HouGuanLake3.webp',
    desc: '后官湖'
  },
  {
    src: './bridge-4.webp',
    desc: '无题'
  },
  {
    src: './city-night-wh.webp',
    desc: '晴川阁，从前同事那里盗得'
  },
  {
    src: './bridge.webp',
    desc: '汉江：江汉桥'
  },
  {
    src: './bridge-3.webp',
    desc: '汉江：晴川桥'
  },
  {
    src: './27.webp',
    desc: '二七长江大桥'
  },
]
</script>

<ImageGallery :items="items">
  <template #title>
    <h1>武汉</h1>
  </template>
</ImageGallery>
