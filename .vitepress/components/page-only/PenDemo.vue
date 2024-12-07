<script setup lang="tsx">
import React from 'react';
import { h, ref } from 'vue';
import VpButton from '../Button.vue';
import ReactWrap from '../ReactWrap.vue';
import VueWrap from '../VueWrap';
import { useMemo } from 'react';

const app: React.FC = () => {
  const btn = useMemo(() => ({

    setup() {
      const count = ref(0);

      return () => h(
        VpButton,
        { onClick: () => count.value += 1 },
        () => `点我：${count.value}`
      )
    }
  }), [])

  return <VueWrap
    app={btn}
    style={{
      display: 'inline-block',
    }}
  />
}

</script>
<template>
  <ReactWrap :app="app" :style="{ 'display': 'inline-block', 'border': '1px solid #d5d5d5' }" />
</template>
