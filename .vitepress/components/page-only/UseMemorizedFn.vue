<script setup lang="tsx">
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { h, ref, watch } from 'vue';
import ReactWrap from '../ReactWrap.vue';
import VueWrap from '../VueWrap';
import { useMemo } from 'react';

const useSmartCallback = <T, P>(fn: (...params: P[]) => T) => {
  const fnRef = useRef<typeof fn>(fn);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn])

  return useCallback((...params: P[]) => fnRef.current(...params), []);
}

const TestBtn: React.FC<{ onClick(): void, children: React.ReactNode }> = React.memo(({ onClick, children }) => {
  console.log(`rerender: ${children}`);
  const [background, setBackground] = useState('#ade5ef');

  useEffect(() => {
    setBackground('#30add3');
    setTimeout(() => {
      setBackground('#ade5ef');
    }, 300);
  }, [onClick]);

  return <button
    type="button"
    onClick={onClick}
    style={{
      borderRadius: 4,
      paddingInline: 6,
      background,
      color: '#000'
    }}
  >
    {children}
  </button>
});

const app = () => {
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

  return <div
    style={{
      display: 'flex',
      gap: 8
    }}
  >
    <TestBtn onClick={setCountNaive}> Inc </TestBtn>
    <TestBtn onClick={setCountNoDep}> IncNoDep </TestBtn>
    <TestBtn onClick={setCountWithDep}> IncWithDep </TestBtn>
    <TestBtn onClick={setCountSmart}> IncSmart </TestBtn>
    <div>
      {count}
    </div>
  </div >
};

</script>
<template>
  <ReactWrap :app="app" />
</template>
