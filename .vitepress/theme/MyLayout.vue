<script setup>
import DefaultTheme from 'vitepress/theme'
import ScrollTop from '../components/ScrollTop.vue'
import ImageView from '../components/ImageView.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <ImageView />
  <Layout>
    <template #aside-bottom>
      <ScrollTop />
    </template>
  </Layout>
</template>
