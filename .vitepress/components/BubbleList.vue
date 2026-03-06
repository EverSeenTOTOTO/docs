<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import { ref, onMounted, watch, type PropType } from 'vue'
import { useData } from 'vitepress'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

const props = defineProps({
  messages: {
    type: Array as PropType<Message[]>,
    required: true
  },
  tags: {
    type: Array as PropType<string[]>,
    default: () => []
  }
})

const { isDark } = useData()

// 预设颜色配置
const tagColors = [
  { light: 'rgba(245, 158, 11, 0.1)', dark: 'rgba(245, 158, 11, 0.2)', text: { light: '#f59e0b', dark: '#fbbf24' } },
  { light: 'rgba(59, 130, 246, 0.1)', dark: 'rgba(59, 130, 246, 0.2)', text: { light: '#3b82f6', dark: '#60a5fa' } },
  { light: 'rgba(16, 185, 129, 0.1)', dark: 'rgba(16, 185, 129, 0.2)', text: { light: '#10b981', dark: '#34d399' } },
  { light: 'rgba(139, 92, 246, 0.1)', dark: 'rgba(139, 92, 246, 0.2)', text: { light: '#8b5cf6', dark: '#a78bfa' } },
  { light: 'rgba(236, 72, 153, 0.1)', dark: 'rgba(236, 72, 153, 0.2)', text: { light: '#ec4899', dark: '#f472b6' } },
  { light: 'rgba(20, 184, 166, 0.1)', dark: 'rgba(20, 184, 166, 0.2)', text: { light: '#14b8a6', dark: '#2dd4bf' } },
]

// 根据 tag 字符串生成稳定的颜色索引
function getTagColor(tag: string) {
  // djb2 hash - 更好的分布
  let hash = 5381
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) + hash) + tag.charCodeAt(i)
  }
  return tagColors[Math.abs(hash) % tagColors.length]
}

// Markdown renderer
let md: MarkdownIt | null = null
const rendered = ref<Map<number, string>>(new Map())

onMounted(() => {
  md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: true
  })
  renderAll()
})

watch(() => props.messages, renderAll, { deep: true })

function renderAll() {
  if (!md) return
  const newRendered = new Map<number, string>()
  props.messages.forEach((msg, i) => {
    newRendered.set(i, md!.render(msg.content))
  })
  rendered.value = newRendered
}

const roleConfig: Record<string, { align: 'left' | 'right', icon: string }> = {
  user: { align: 'right', icon: 'person' },
  assistant: { align: 'left', icon: 'robot' },
  system: { align: 'left', icon: 'gear' }
}

function getIcon(role: string) {
  return roleConfig[role]?.icon ?? 'person'
}
</script>

<template>
  <div class="bubble-list">
    <div v-if="tags.length" class="bubble-tags">
      <span
        v-for="tag in tags"
        :key="tag"
        class="bubble-tag"
        :style="{
          backgroundColor: isDark ? getTagColor(tag).dark : getTagColor(tag).light,
          color: isDark ? getTagColor(tag).text.dark : getTagColor(tag).text.light
        }"
      >{{ tag }}</span>
    </div>
    <div
      v-for="(msg, i) in messages"
      :key="i"
      class="bubble-item"
      :class="roleConfig[msg.role]?.align ?? 'left'"
    >
      <!-- Avatar -->
      <div class="bubble-avatar" :class="msg.role">
        <svg v-if="getIcon(msg.role) === 'robot'" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a1 1 0 0 1 1 1v1.07A7.002 7.002 0 0 1 19 11v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-6a7.002 7.002 0 0 1 6-6.93V3a1 1 0 0 1 1-1zm0 4a5 5 0 0 0-5 5v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-6a5 5 0 0 0-5-5zM8 10a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm8 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-4 4a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1z"/>
        </svg>
        <svg v-else-if="getIcon(msg.role) === 'gear'" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 1a1 1 0 0 1 .894.553l2.227 4.454 4.478.651a1 1 0 0 1 .554 1.706l-3.238 3.156.764 4.457a1 1 0 0 1-1.451 1.054L12 15.882l-4.228 2.22a1 1 0 0 1-1.45-1.055l.763-4.456-3.237-3.156a1 1 0 0 1 .554-1.706l4.478-.65 2.227-4.455A1 1 0 0 1 12 1zm0 3.236L10.31 7.647a1 1 0 0 1-.753.547l-3.157.459 2.285 2.23a1 1 0 0 1 .288.885l-.54 3.152 3.056-1.606a1 1 0 0 1 .931 0l3.055 1.606-.539-3.152a1 1 0 0 1 .288-.886l2.285-2.229-3.157-.459a1 1 0 0 1-.753-.547L12 4.236z"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM6 8a6 6 0 1 1 12 0A6 6 0 0 1 6 8zm2 10a3 3 0 0 0-3 3 1 1 0 1 1-2 0 5 5 0 0 1 5-5h8a5 5 0 0 1 5 5 1 1 0 1 1-2 0 3 3 0 0 0-3-3H8z"/>
        </svg>
      </div>
      <!-- Content -->
      <div class="bubble-content" :class="msg.role">
        <div class="bubble-text" v-html="rendered.get(i) ?? msg.content" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.bubble-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0;
}

.bubble-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--vp-c-divider);
  margin-bottom: 8px;
}

.bubble-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 8px;
  font-size: 12px;
  transition: background-color 0.3s, color 0.3s;
}

.bubble-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  max-width: 100%;
}

.bubble-item.right {
  flex-direction: row-reverse;
}

.bubble-avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-2);
}

.bubble-avatar.user {
  background-color: var(--vp-c-brand-soft, rgba(59, 130, 246, 0.1));
  color: var(--vp-c-brand-1, #3b82f6);
}

.bubble-avatar.assistant {
  background-color: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.bubble-avatar.system {
  background-color: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
}

.bubble-avatar svg {
  width: 18px;
  height: 18px;
}

.bubble-content {
  max-width: 75%;
  padding: 10px 14px;
  border-radius: 12px;
  background-color: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
}

.bubble-content.user {
  background-color: var(--vp-c-brand-soft, rgba(59, 130, 246, 0.1));
  border-color: var(--vp-c-brand-1, rgba(59, 130, 246, 0.2));
}

.bubble-content.assistant {
  background-color: var(--vp-c-bg-alt);
}

.bubble-content.system {
  background-color: rgba(245, 158, 11, 0.05);
  border-color: rgba(245, 158, 11, 0.2);
}

.bubble-text {
  color: var(--vp-c-text-1);
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}

.bubble-text :deep(p) {
  margin: 0 0 8px;
}

.bubble-text :deep(p:last-child) {
  margin-bottom: 0;
}

.bubble-text :deep(code) {
  background-color: var(--vp-c-mute, rgba(128, 128, 128, 0.1));
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--vp-font-family-mono);
  font-size: 0.9em;
}

.bubble-text :deep(pre) {
  background-color: var(--vp-c-bg-alt);
  padding: 12px 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}

.bubble-text :deep(pre code) {
  background: none;
  padding: 0;
}

.bubble-text :deep(ul),
.bubble-text :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}

.bubble-text :deep(li) {
  margin: 4px 0;
}

.bubble-text :deep(blockquote) {
  margin: 8px 0;
  padding-left: 12px;
  border-left: 3px solid var(--vp-c-divider);
  color: var(--vp-c-text-2);
}

.bubble-text :deep(a) {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.bubble-text :deep(a:hover) {
  text-decoration: underline;
}

.bubble-text :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
}

.bubble-text :deep(th),
.bubble-text :deep(td) {
  border: 1px solid var(--vp-c-divider);
  padding: 8px 12px;
  text-align: left;
}

.bubble-text :deep(th) {
  background-color: var(--vp-c-bg-soft);
  font-weight: 600;
}
</style>
