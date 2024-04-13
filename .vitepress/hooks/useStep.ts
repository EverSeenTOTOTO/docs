import { ref, onUnmounted } from 'vue'

export const useStep = (step: () => void) => {
  const interval = ref<NodeJS.Timeout | null>(null)

  const pause = () => clearInterval(interval.value!)
  const play = () => {
    pause();
    interval.value = setInterval(step, 300)
  }

  onUnmounted(pause);

  return { interval, pause, play }
}
