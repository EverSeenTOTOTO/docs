---
layout: page
---

<script setup>
import ImageGallery from '@vp/ImageGallery.vue';
import hometown from './hometown.webp';
import fire from './fire.webp'
import hometown3 from './hometown-3.webp'
import hometown6 from './hometown-6.webp'
import hometown7 from './hometown-7.webp'
import hometown8 from './hometown-8.webp'

const items = [
  {
    src: hometown,
    desc: '一个颓败的角落'
  },
  {
    src: fire,
    desc: '烧火：一个很有记忆感的词汇',
  },
  {
    src: hometown3,
    desc: '兜兜转转，有时惊觉还是故乡的小镇好。人生偶需“猛回头”，只是注意不要闪了脖子。'
  },
  {
    src: hometown6,
    desc: '冬天的太阳有一种磅礴荒凉的美。'
  },
  {
    src: hometown7,
    desc: '永远的天空，拍摄于2017年'
  },
  {
    src: hometown8,
    desc: '永远的天空，拍摄于2017年'
  },
]
</script>

<ImageGallery :items="items">
  <template #title>
    <h1>故乡</h1>
  </template>
</ImageGallery>

