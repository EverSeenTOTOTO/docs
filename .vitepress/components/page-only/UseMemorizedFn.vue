<script setup lang="tsx">
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { h } from 'vue';
import VpButton from '../Button.vue';
import ReactWrap from '../ReactWrap.vue';
import VueWrap from '../VueWrap';

const useSmartCallback = <T, P>(fn: (...params: P[]) => T) => {
  const fnRef = useRef<typeof fn>(fn);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn])

  return useCallback((...params: P[]) => fnRef.current(...params), []);
}

const TestBtn: React.FC<{ onClick(): void, children: React.ReactNode }> = React.memo(({ onClick, children }) => {
  console.log(`rerender: ${children}`);

  return <VueWrap
    App={{
      setup() {
        return () => h(
          VpButton,
          { onClick },
          () => children
        )
      }
    }}
    style={{
      display: 'inline-block',
    }}
  />
})

const App = () => {
  const [count, setCount] = useState(0);

  const setCountNaive = () => setCount(count + 1);
  const setCountNoDep = useCallback(() => {
    setCount(count + 1)
  }, []);
  const setCountWithDep = useCallback(() => {
    setCount(count + 1);
  }, [count]);
  const setCountSmart = useSmartCallback(() => {
    setCount(count + 1)
  })

  return <>
    <TestBtn onClick={setCountNaive}> Inc </TestBtn>
    <TestBtn onClick={setCountNoDep}> IncNoDep </TestBtn>
    <TestBtn onClick={setCountWithDep}> IncWithDep </TestBtn>
    <TestBtn onClick={setCountSmart}> IncSmart </TestBtn>
    <div>
      {count}
    </div>
  </>
};

</script>
<template>
  <ReactWrap :App="App" />
</template>
