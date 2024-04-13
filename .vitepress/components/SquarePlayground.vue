<script setup lang="ts">
import { onMounted, onUpdated, computed, watch, ref, nextTick } from 'vue';
import { useSquare, INITIAL_CODE } from '../hooks/useSquare';
import type { CodeJar } from 'codejar';
import * as xterm from '@xterm/xterm';
import { useScrollLock } from '@vueuse/core';
import '@xterm/xterm/css/xterm.css';
import { onScrollEnd } from '../hooks/useScrollEnd';

import { useData } from 'vitepress'

const { isDark } = useData()

const colors = computed(() => isDark.value
  ? {
    string: '#9ECBFF',
    number: '#79B8FF',
    keyword: '#F97583',
    reserved: '#B392F0',
    comment: '#6A737D',


    btnBg: '#2a8148',
  }
  : {
    string: '#032F62',
    number: '#005CC5',
    keyword: '#D73A49',
    reserved: '#6F42C1',
    comment: '#6A737D',
    btnBg: '#c6f1d5',
  });

const { Terminal } = xterm as any;

const docScrollLocked = useScrollLock(document?.documentElement);

const toggleLock = () => {
  docScrollLocked.value = !docScrollLocked.value;
};

const editorElement = ref<HTMLDivElement | null>(null);
const editor = ref<CodeJar | null>(null);
const terminalElement = ref<HTMLDivElement | null>(null);
const terminal = ref<typeof Terminal>(null);

const Keywords = [
  'let', 'if', 'cond', 'while', 'callcc', 'vec', 'obj',
  'set', 'get', 'println', 'print', 'at', 'splice', 'len',
  'slice', 'typeof', 'begin'
]
const KeywordPattern = new RegExp(`(?<=(\\s|\\[))(${Keywords.join('|')})\\s`, 'g')
const Reserved = [
  'true', 'false', 'nil',
]
const Property = [
  '__set__', '__get__'
]
const ReservedPattern = new RegExp(`(?<=(\\s|\\[))(${Reserved.join('|')})`, 'g')
const PropertyPattern = new RegExp(`(?<=\\.)(${Property.join('|')})`, 'g')
const StringPattern = /'([^'\\]|\\.)*'/g
const CommentPattern = /;([^;\\]|\\.)*?(;|\n)/g
const NumberPattern = /-?\d+\.?\d*(e|E-?\d+)?/g

const highlight = (editor: HTMLElement) => {
  let code = editor.textContent || "";
  code = code.replace(NumberPattern, `<span style="color: ${colors.value.number}">$&</span>`)
  code = code.replace(KeywordPattern, `<span style="color: ${colors.value.keyword}">$&</span>`)
  code = code.replace(ReservedPattern, `<span style="color: ${colors.value.reserved}">$&</span>`)
  code = code.replace(PropertyPattern, `<span style="color: ${colors.value.keyword}">$&</span>`)
  code = code.replace(StringPattern, `<span style="color: ${colors.value.string}">$&</span>`)
  code = code.replace(CommentPattern, `<span style="color: ${colors.value.comment}">$&</span>`)
  editor.innerHTML = code
};

watch(colors, () => {
  highlight(editorElement.value!);
});

onMounted(() => {
  import('codejar').then(({ CodeJar }) => {
    editor.value = CodeJar(editorElement.value!, highlight);
    editor.value.updateCode(INITIAL_CODE);
  });

  terminal.value = new Terminal({
    rows: 6,
    convertEol: true,
    disableStdin: true,
    cursorInactiveStyle: 'none',
    theme: {
      selectionForeground: '#fff'
    }
  });

  terminal.value.open(terminalElement.value);
});

const square = useSquare(editor, terminal);

const instructionUL = ref<HTMLUListElement | null>(null);
const callframUL = ref<HTMLUListElement | null>(null);

const alignLastCallframe = () => {
  const callframeLIs = Array.from(callframUL.value!.children);
  const lastCallframe = callframeLIs[callframeLIs.length - 1];
  lastCallframe?.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest'
  });
}

onUpdated(() => {
  nextTick(() => {
    const instructionLIs = Array.from(instructionUL.value!.children);
    const nextInstruction = instructionLIs.find((_, index) => index === square.pc.value)

    onScrollEnd(instructionUL.value!, alignLastCallframe);
    nextInstruction?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  });
})

const step = () => {
  alignLastCallframe();
  square.step();
}

</script>
<template>
  <div class="container" :style="{ '--btnBg': colors.btnBg }">
    <div class="editor" ref="editorElement" />

    <div class="operation">
      <span>Console: </span>
      <button @click="toggleLock" :style="{ marginInlineStart: 'auto' }">
        {{ docScrollLocked ? 'ScrollUnlock' : 'ScrollLock' }}
      </button>
      <button @click="square.compile">Compile</button>
      <button @click="step">Step</button>
      <button @click="square.run">Run</button>
    </div>

    <div class="playground">
      <ul class="instructions" ref="instructionUL">
        <li v-for="(inst, index) in square.instructions.value" :key="index" class="instruction" :class="{
    'instruction--active': index === square.pc.value
  }">{{ `${index}: ${inst}` }}</li>
      </ul>
      <ul class="callframes" ref="callframUL">
        <li v-for="(callframe, index) in square.callframes.value" :key="index">
          {{ callframe }}
        </li>
      </ul>
    </div>

    <div ref="terminalElement" class="console" />
  </div>
</template>
<style scoped>
.container {
  background-color: var(--vp-code-block-bg);
  border: 1px solid #ddd;

  & ul {
    margin: 0;
    padding: 0;

    & li {
      margin: 0;
      padding: 0;
    }
  }

  & .editor {
    position: relative;
    height: 240px;
    overflow: auto;
    padding: 8px;
    border-block-end: 1px solid #ddd;

    & .line-numbers {
      position: absolute;
      left: 0;
      top: 0;
      list-style: none;
      text-align: right;
      padding-block: 8px;

      >li {
        color: #999;
      }
    }
  }

  & .playground {
    display: flex;
    flex-wrap: nowrap;
    height: 240px;
    border-block-end: 1px solid #ddd;

    & .instructions {
      overflow: auto;
      flex: 2;
      display: flex;
      flex-direction: column;
      padding: 4px;

      .instruction {
        padding: 2px;
        text-wrap: nowrap;
      }

      .instruction--active {
        background-color: var(--vp-code-line-highlight-color);
      }
    }

    & .callframes {
      overflow-y: auto;
      flex: 3;
      border-inline-start: 1px solid #ddd;
      padding: 4px;

      >li {
        white-space: pre;
      }
    }
  }

  & .operation {
    display: flex;
    flex-wrap: wrap;
    padding: 8px;
    border-block-end: 1px solid #ddd;

    &>span {
      flex: 0 0 25%;
    }

    >button {
      padding-inline: 6px;
      border-radius: 3px;
      font-weight: bold;

      &:active {
        opacity: 0.6;
      }

      &:hover {
        background-color: var(--btnBg);
      }
    }
  }

  &.console {
    margin-top: 16px;
    background-color: var(--vp-code-block-bg);
  }
}
</style>
<style>
.xterm {
  padding: 8px;
}

.xterm-viewport {
  background-color: transparent !important;
  overflow-y: auto !important;
}

.xterm-rows {
  color: var(--vp-c-text-1) !important;
}
</style>
