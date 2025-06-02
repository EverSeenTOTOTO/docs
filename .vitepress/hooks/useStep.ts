import { ref, onUnmounted, computed } from 'vue'

// a state machine with 4 states: idle, playing, paused, done
// idle -> playing
// playing -> paused, done, idle
// paused -> playing, idle
// done -> idle
export const useStep = ({
  onInit,
  onStep,
  onPause,
  onFinish,
  onReset,
  stepInterval = 300
}: {
  onInit?: () => void | Promise<void>,
  onStep: () => void | Promise<void>,
  onPause?: () => void | Promise<void>,
  onFinish?: () => void | Promise<void>,
  onReset?: () => void | Promise<void>,
  stepInterval?: number
}) => {
  const state = ref<'idle' | 'playing' | 'paused' | 'done'>('idle')
  const interval = ref<NodeJS.Timeout | null>(null)

  const canPause = computed(() => state.value === 'playing')
  const canPlay = computed(() => state.value === 'idle' || state.value === 'paused')
  const canFinish = computed(() => state.value === 'playing')

  const pause = async () => {
    if (!canPause.value) return;

    await onPause?.();
    clearInterval(interval.value!);
    state.value = 'paused';
    interval.value = null;
  }
  const play = async () => {
    if (!canPlay.value) return;
    if (state.value === 'idle') await onInit?.();

    state.value = 'playing';
    interval.value = setInterval(onStep, stepInterval)
  }
  const reset = async () => {
    await onReset?.();
    clearInterval(interval.value!);
    state.value = 'idle';
    interval.value = null;
  }
  const finish = async () => {
    if (!canFinish.value) return;
    await onFinish?.();
    clearInterval(interval.value!);
    state.value = 'done';
    interval.value = null;
  }
  onUnmounted(pause);

  return { state, pause, play, reset, finish, canPause, canPlay, canFinish }
}
