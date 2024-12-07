<script setup lang="tsx">
import React, { useMemo, useState } from 'react';
import { h } from 'vue';
import Button from '../Button.vue';
import ReactWrap from '../ReactWrap.vue';
import createSnapshot from '../Snapshot.tsx';
import VueWrap from '../VueWrap.tsx';

const Snapshot = createSnapshot("demo");

const app = () => {
  const [count, setCount] = useState(0);

  const btn = useMemo(() => ({
    setup() {
      return () => h(
        Button,
        {
          onClick() {
            setCount(count + 1);
          }
        },
        () => `Clicked ${count} times`
      )
    }
  }), [count])

  return <>
    <Snapshot.From
      render={inject => {
        return <VueWrap app={btn} {...inject} />
      }}
    />
    <Snapshot.To />
    <Snapshot.To dependencies={[count]} />
  </>
}

</script>
<template>
  <ReactWrap :app="app" />
</template>
