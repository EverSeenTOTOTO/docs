<script setup lang="ts">
import { CodeJar } from 'codejar';
import { onMounted, ref } from 'vue';
import { useStep } from '../hooks/useStep';
import { useSquare } from '../hooks/useSquare';

const editorElement = ref<HTMLDivElement>(null);
const editor = ref<CodeJar>(null);
const lineNumbers = ref<number[]>([]);

const highlight = (editor: HTMLElement) => {
  const code = editor.textContent || "";
  const len = code.split("\n").length;

  lineNumbers.value = Array.from({ length: len > 10 ? len : 10 }).map((_, index) => index + 1)
};

onMounted(() => {
  editor.value = CodeJar(editorElement.value, highlight);
  editor.value.updateCode(`[let gen /[yield]
                [begin 
                    [let i 0]
                    [while [< i 4]
                        [callcc /[cc] [yield [vec i cc]]]
                        [+= i 1]]]]
[let iter_k nil]
[let next /[g]
            [begin 
                [if iter_k
                    [iter_k]
                    [begin
                        [let value [callcc /[cc] [g cc]]]
                        [if [== [typeof value] 'vec']
                          [begin 
                            [let i nil]
                            [= [i iter_k] value]
                            [println i]]
                          nil]]]]]

[next gen]
[next gen]
[next gen]
[next gen]
[next gen]
[next gen]
`);
});

const square = useSquare();
const compile = () => {
  const code = editor.value.toString();
  square.compile(code);
};
const step = () => { };
const { pause, play } = useStep(step);

</script>
<template>
  <div class="operation">
    <button @click="compile">Compile</button>
    <button @click="step">Step</button>
    <button @click="play">Run</button>
    <button @click="pause">Pause</button>
  </div>
  <div class="playground">
    <ul class="line-numbers">
      <li v-for="index in lineNumbers" :key="index">{{ index }}</li>
    </ul>
    <div class="editor" ref="editorElement" />
    <ul class="instructions">
      <li v-for="(inst, index) in square.instructions.value" :key="inst">{{ index }}</li>
    </ul>
  </div>
</template>
<style scoped>
.playground {
  display: flex;
  padding: 8px;
  background-color: var(--vp-code-block-bg);

  & ul {
    margin: 0;
    padding: 0;

    & li {
      margin: 0;
      padding: 0;
    }
  }

  & .line-numbers {
    list-style: none;
    text-align: right;
    padding-inline-end: 8px;

    >li {
      color: #999;
    }
  }


  & .editor {
    flex: 6;
    padding-inline: 6px;
    border-inline: 1px solid #ddd;
  }

  & .instructions {
    flex: 2;
  }
}

.operation {
  display: flex;
  flex-wrap: wrap;
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
</style>
