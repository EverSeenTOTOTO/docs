<script setup lang="tsx">
import React from 'react';
import { h } from 'vue';
import VpButton from '../Button.vue';
import ReactWrap from '../ReactWrap.vue';
import VueWrap from '../VueWrap';
import { useMemo } from 'react';

const App: React.FC = () => {
  const [count, setCount] = React.useState(0);

  const vueApp = useMemo(() => ({
    setup() {
      return () => h(
        VpButton,
        { onClick: () => setCount(count + 1) },
        () => `点我：${count}`
      )
    }
  }), [count])

  return <VueWrap
    App={vueApp}
    style={{
      display: 'inline-block',
    }}
  />
}

</script>
<template>
  <ReactWrap :App="App" :style="{ 'display': 'inline-block', 'border': '1px solid #d5d5d5' }" />
</template>
