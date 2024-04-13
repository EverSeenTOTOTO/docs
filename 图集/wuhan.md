---
layout: page
---

<script setup>
import ImageGallery from '@vp/ImageGallery.vue';
import park from './park.webp'
import time from './time.webp'
import houGuanLake from './HouGuanLake.webp'
import houGuanLake2 from './HouGuanLake2.webp'
import houGuanLake3 from './HouGuanLake3.webp'
import bridge4 from './bridge-4.webp'
import bridge from './bridge.webp'
import bridge3 from './bridge-3.webp'
import bridge27 from './27.webp'
import cityNightWH from './city-night-wh.webp'

const items = [
  {
    src: park,
    desc: '后襄河公园'
  },
  {
    src: time,
    desc: '新时代'
  },
  {
    src: houGuanLake,
    desc: '后官湖'
  },
  {
    src: houGuanLake2,
    desc: '后官湖'
  },
  {
    src: houGuanLake3,
    desc: '后官湖'
  },
  {
    src: bridge4,
    desc: '无题'
  },
  {
    src: cityNightWH,
    desc: '晴川阁，从前同事那里盗得'
  },
  {
    src: bridge,
    desc: '汉江：江汉桥'
  },
  {
    src: bridge3,
    desc: '汉江：晴川桥'
  },
  {
    src: bridge27,
    desc: '二七长江大桥'
  },
]
</script>

<ImageGallery :items="items">
  <template #title>
    <h1>武汉</h1>
  </template>
</ImageGallery>
