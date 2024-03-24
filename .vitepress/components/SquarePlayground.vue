<script setup lang="ts">
import { CodeJar } from 'codejar';
import { onMounted, onUpdated, ref, nextTick } from 'vue';
import { useSquare, INITIAL_CODE } from '../hooks/useSquare';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useScrollLock } from '@vueuse/core';
import '@xterm/xterm/css/xterm.css';

const docScrollLocked = useScrollLock(document.documentElement);

const toggleLock = () => {
  docScrollLocked.value = !docScrollLocked.value;
};

const editorElement = ref<HTMLDivElement>(null);
const editor = ref<CodeJar>(null);
const terminalElement = ref<HTMLDivElement>(null);
const terminal = ref<Terminal>(null);
// const lineNumbers = ref<number[]>([]);

const highlight = (editor: HTMLElement) => {
  const code = editor.textContent || "";

  // const len = code.split("\n").length;
  // lineNumbers.value = Array.from({ length: len > 10 ? len : 10 }).map((_, index) => index + 1)
};

onMounted(() => {
  editor.value = CodeJar(editorElement.value, highlight);
  editor.value.updateCode(INITIAL_CODE);

  terminal.value = new Terminal({
    rows: 6,
    convertEol: true,
    disableStdin: true,
    cursorInactiveStyle: 'none',
    theme: {
      selectionForeground: '#fff'
    }
  });

  const fitAddon = new FitAddon()
  terminal.value.loadAddon(fitAddon);
  terminal.value.open(terminalElement.value);

  fitAddon.fit();
});

const square = useSquare(editor, terminal);

const instructionUL = ref<HTMLUListElement | null>(null);
const callframeUL = ref<HTMLUListElement | null>(null);

onUpdated(() => {
  nextTick(() => {
    const instructionLIs = Array.from(instructionUL.value?.children);
    const nextInstruction = instructionLIs.find((_, index) => index === square.pc.value);

    nextInstruction?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  });
})

</script>
<template>
  <div class="container">
    <div class="editor" ref="editorElement" />
    <div class="playground">
      <ul class="instructions" ref="instructionUL">
        <li v-for="(inst, index) in square.instructions.value" :key="index" class="instruction" :class="{
          'instruction--active': index === square.pc.value
        }">{{ `${index}: ${inst}` }}</li>
      </ul>
      <ul class="callframes">
        <li v-for="(callframe, index) in square.callframes.value" :key="index">
          <pre>{{ callframe }}</pre>
        </li>
      </ul>
    </div>

    <div class="operation">
      <span>Console: </span>
      <button @click="toggleLock" :style="{ marginInlineStart: 'auto' }">
        {{ docScrollLocked ? 'ScrollUnlock' : 'ScrollLock' }}
      </button>
      <button @click="square.compile">Compile</button>
      <button @click="square.step">Step</button>
      <button @click="square.run">Run</button>
    </div>

    <div ref="terminalElement" class="console" />
  </div>
</template>
<style scoped>
.container {
  background-color: var(--vp-code-block-bg);

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
    padding: 8px;
    height: 240px;
    border: 1px solid #ddd;

    & .instructions {
      overflow: auto;
      flex: 2;
      display: flex;
      flex-direction: column;
      padding-inline: 4px;

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
      padding-inline: 4px;

      & pre {
        margin: 0;
      }
    }
  }

  & .operation {
    display: flex;
    flex-wrap: wrap;
    padding: 8px;
    margin-block: 24px 12px;

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
        background-color: #c6f1d5;
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
