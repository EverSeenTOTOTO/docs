import { annotate } from 'rough-notation';
import { RoughAnnotation } from 'rough-notation/lib/model';
import { useData } from 'vitepress';
import { Component, computed, h, onMounted, onUnmounted, ref, watch } from "vue";

const Notation: Component = {
  props: [
    'el',
    'type',
    'animate',
    'animationDuration',
    'color',
    'strokeWidth',
    'padding',
    'multiline',
    'iterations',
    'brackets'
  ],
  setup(props, { slots }) {
    const { el = 'span', type, ...rest } = props;


    const { isDark } = useData()
    const tagEl = ref();

    const typeConfigs = computed(() => ({
      highlight: {
        type: 'highlight',
        multiline: true,
        color: isDark.value ? '#957615' : "#ffd54f"
      },
      underline: {
        type: 'underline',
        multiline: true,
        color: isDark.value ? '#e46363' : '#b71c1c',
        strokeWidth: 0.8
      },
      box: {
        type: 'box',
        color: isDark.value ? '#a42c2c' : '#b71c1c'
      },
      circle: {
        type: 'circle',
        color: isDark.value ? '#a42c2c' : '#b71c1c'
      },
      del: {
        type: 'strike-through',
        multiline: true,
        strokeWidth: 1
      },
      cross: {
        type: 'crossed-off',
        color: isDark.value ? '' : '#f57f17'
      },
      bracket: {
        type: 'bracket',
        multiline: true,
      }
    }))

    const anno = ref<RoughAnnotation>();

    const update = () => {
      anno.value?.remove()

      if (!tagEl.value) return;

      anno.value = annotate(tagEl.value, {
        ...rest,
        ...(typeConfigs.value?.[type] ?? typeConfigs.value.highlight),
      });
      anno.value?.show();
    }

    const unwatch = watch(isDark, update);

    onMounted(update);
    onUnmounted(unwatch);

    return () => h(
      el,
      {
        ref: tagEl
      },
      slots.default?.()
    );
  }
}

export default Notation;
