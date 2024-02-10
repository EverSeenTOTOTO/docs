<script lang="ts">
import { toRef, watch } from 'vue'

export default {
  props: ['open'],
  emits: ['close'],
  setup(props, { emit }) {
    const open = toRef(props, "open")
    const handleClose = () => emit("close");

    watch(open, (newVal) => {
      if (newVal) {
        document.body.style.overflowY = "hidden";
      } else {
        document.body.style.overflowY = "auto";
      }
    });

    return {
      open,
      handleClose,
    };
  }
}
</script>
<template>
  <ClientOnly>
    <Teleport to="#app">
      <div class="modal">
        <Transition name="fade">
          <div v-if="open" class="mask" @click="handleClose" />
        </Transition>
        <Transition name="zoom">
          <div v-if="open" class="wrap">
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

  .mask {
    position: fixed;
    top: 0;
    right: 0;
    left: 0;
    bottom: 0;
    background-color: rgba(55, 55, 55, 0.6);
    height: 100%;
    filter: alpha(opacity=50);
    z-index: 42;
  }

  .wrap {
    position: fixed;
    top: 0;
    right: 0;
    left: 0;
    bottom: 0;
    z-index: 42;

    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.fade-enter-active {
  animation-fill-mode: both;
  animation: fadeIn 0.3s cubic-bezier(0.55, 0, 0.55, 0.2);
}

.fade-leave-active {
  animation-fill-mode: both;
  animation: fadeOut 0.3s cubic-bezier(0.55, 0, 0.55, 0.2);
}

@keyframes fade-in {
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

.zoom-enter-active {
  animation: zoomIn 0.3s cubic-bezier(0.08, 0.82, 0.17, 1);
  animation-fill-mode: both;
}

.zoom-leave-active {
  animation: zoomOut 0.3s cubic-bezier(0.6, 0.04, 0.98, 0.34);
  animation-fill-mode: both;
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

