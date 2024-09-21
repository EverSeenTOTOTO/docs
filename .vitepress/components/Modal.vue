<script setup lang="ts">
import { ref } from 'vue'

const { open, transformOrigin } = defineProps(['open', 'transformOrigin'])
const emit = defineEmits(['click', 'afterOpenChange'])

const modal = ref(null)

const onClick = () => {
  emit('click')
}
const onOpenChange = (open: boolean) => {
  emit("afterOpenChange", open)
}
</script>
<template>
  <ClientOnly>
    <Teleport to="#app">
      <div class="modal" ref="modal">
        <Transition name="fade">
          <div v-if="open" class="mask" />
        </Transition>
        <Transition name="zoom" @after-enter="onOpenChange(true)" @after-leave="onOpenChange(false)">
          <div v-if="open" class="wrap" @click="onClick" :style="{ transformOrigin }">
            <slot />
          </div>
        </Transition>
      </div>
    </Teleport>
  </ClientOnly>
</template>
<style scoped>
.modal {
  position: relative;
  width: auto;
  z-index: 1000;

  .mask {
    position: fixed;
    inset: 0;
    background-color: rgba(55, 55, 55, 0.6);
    height: 100%;
    filter: alpha(opacity=50);
  }

  .wrap {
    position: fixed;
    inset: 0;
    z-index: 1001;

    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.fade-enter-active {
  animation-fill-mode: both;
  animation: fadeIn 0.3s cubic-bezier(0.08, 0.82, 0.17, 1);
}

.fade-leave-active {
  animation-fill-mode: both;
  animation: fadeOut 0.3s cubic-bezier(0.55, 0, 0.55, 0.2);
}

.zoom-enter-active {
  animation-fill-mode: both;
  animation: zoomIn 0.3s cubic-bezier(0.08, 0.82, 0.17, 1);
}

.zoom-leave-active {
  animation-fill-mode: both;
  animation: zoomOut 0.3s cubic-bezier(0.6, 0.04, 0.98, 0.34);
}

@keyframes fadeIn {
  0% {
    opacity: 0;
  }

  100% {
    opacity: 1;
  }
}

@keyframes fadeOut {
  0% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}


@keyframes zoomIn {
  0% {
    opacity: 0;
    transform: scale(0, 0);
  }

  100% {
    opacity: 1;
    transform: scale(1, 1);
  }
}

@keyframes zoomOut {
  0% {
    transform: scale(1, 1);
  }

  100% {
    opacity: 0;
    transform: scale(0, 0);
  }
}
</style>
