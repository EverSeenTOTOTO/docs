<script setup>
import DefaultTheme from 'vitepress/theme'
import ScrollTop from '../components/ScrollTop.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #aside-bottom>
      <ScrollTop />
    </template>
  </Layout>
</template>
