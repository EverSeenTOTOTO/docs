<script setup lang="tsx">
import ReactDom from 'react-dom/client';
import { VitePressData } from 'vitepress';
import { dataSymbol } from 'vitepress/dist/client/app/data.js';
import { inject, onMounted, ref } from 'vue';
import { ReactWrapContext } from './context';

const vpData = inject<VitePressData>(dataSymbol);
const props = defineProps(["app"]);
const container = ref<HTMLElement | null>(null);

onMounted(() => {
  const root = ReactDom.createRoot(
    container.value!,
  );
  const App = props.app;

  if (typeof App !== 'function') {
    throw new Error('render function is required');
  }

  root.render(
    <ReactWrapContext.Provider value={{ vpData }}>
      <App />
    </ReactWrapContext.Provider>
  );
});

</script>
<template>
  <div ref="container" />
</template>
