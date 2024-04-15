<script setup lang="ts">
import { ref, withDefaults, defineProps } from 'vue';
import ImageView from './ImageView.vue';

const target = ref(null);

const onWheel = (e) => {
  if (target.value) {
    target.value.scrollBy({
      left: e.deltaY,
      behavior: 'smooth',
    });
  }
}

const itemSize = ref('320px');

export type ImageGalleryProps = {
  items: { src: string }[]
}

const { items } = withDefaults(defineProps<ImageGalleryProps>(), {
  items: () => []
})

</script>
<template>
  <div ref="container" class="vp-doc" @wheel="onWheel">
    <slot name="title"></slot>
    <ul ref="target" class="cards" :style="{ '--item-size': itemSize }">
      <li v-for="{ desc, src } in items">
        <div class="item">
          <ImageView class="item__img" :src="src" />
          <div class="item__desc">{{ desc }}</div>
        </div>
      </li>
    </ul>
  </div>
</template>
<style scoped>
.vp-doc {
  padding: 32px;
}

.cards {
  max-width: 90vw;
  position: relative;
  margin: 0 auto;
  padding: 0;
  overflow: auto;
  white-space: nowrap;
  padding-block: calc(var(--item-size) / 3);

  >li {
    display: inline-block;
    width: var(--item-size);
    height: var(--item-size);
    margin: 0;

    /* Track this element as it intersects the scrollport */
    view-timeline-name: --li-in-and-out-of-view;
    view-timeline-axis: inline;

    /* Link an animation to the established view-timeline and have it run during the contain phase */
    animation: linear adjust-z-index both;
    animation-timeline: --li-in-and-out-of-view;

    /* Make the 3D stuff work… */
    perspective: 40em;

    position: relative;
    z-index: 1;
    will-change: z-index;

    user-select: none;

    &:first-of-type {
      margin-left: calc(50% - (var(--item-size) / 2));
    }

    &:last-of-type {
      margin-right: calc(50% - (var(--item-size) / 2));
    }
  }
}

.item {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;

  width: 100%;
  height: 100%;
  /* Link an animation to the established view-timeline (of the parent li) and have it run during the contain phase */
  animation: linear rotate-cover both;
  animation-timeline: --li-in-and-out-of-view;

  /* Prevent FOUC */
  transform: translateX(-100%) rotateY(-45deg);

  will-change: transform;

}

::v-deep(.item__img) {
  max-height: var(--item-size);
}

.item__desc {
  padding-inline: 12px;
  width: 100%;
  font-size: 10px;
  text-align: center;
  text-wrap: wrap;
}

/* Animation bumps up the z-index, to make sure it’s on top */
@keyframes adjust-z-index {
  0% {
    z-index: 1;
  }

  50% {
    z-index: 100;
    /* When at the center, be on top */
  }

  100% {
    z-index: 1;
  }
}

/* Animation that rotates the cover */
@keyframes rotate-cover {
  0% {
    transform: translateX(-100%) rotateY(-45deg);
  }

  35% {
    transform: translateX(0) rotateY(-45deg);
  }

  50% {
    transform: rotateY(0deg) translateZ(1em) scale(1.5);
  }

  65% {
    transform: translateX(0) rotateY(45deg);
  }

  100% {
    transform: translateX(100%) rotateY(45deg);
  }
}
</style>

