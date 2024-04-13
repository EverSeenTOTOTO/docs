---
layout: page
---

<script setup>
import ImageGallery from '@vp/ImageGallery.vue';

const items = [
  {
    src: './hometown.webp',
    desc: '一个颓败的角落'
  },
  {
    src: './fire.webp',
    desc: '烧火：一个很有记忆感的词汇',
  },
  {
    src: "./hometown-3.webp",
    desc: '兜兜转转，有时惊觉还是故乡的小镇好。人生偶需“猛回头”，只是注意不要闪了脖子。'
  },
  {
    src: "./hometown-6.webp",
    desc: '冬天的太阳有一种磅礴荒凉的美。'
  },
  {
    src: "./hometown-7.webp",
    desc: '永远的天空，拍摄于2017年'
  },
  {
    src: "./hometown-8.webp",
    desc: '永远的天空，拍摄于2017年'
  },
]
</script>

<ImageGallery :items="items">
  <template #title>
    <h1>故乡</h1>
  </template>
</ImageGallery>

