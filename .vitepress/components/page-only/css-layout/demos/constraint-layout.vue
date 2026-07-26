<script setup lang="ts">
import { useData } from 'vitepress'
import { computed, onMounted, ref } from 'vue'
// @ts-expect-error cassowary 无类型声明
import Cassowary from 'cassowary'
import {
  prepareWithSegments,
  layoutNextLineRange,
  materializeLineRange,
  measureNaturalWidth,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'

const { isDark } = useData()
void isDark

const { SimplexSolver, Variable, Equation, Inequality, Strength, GEQ, LEQ, minus, plus } = Cassowary as any

const FONT = '14px sans-serif'
const LH = 22
const PAD = 16, GAP = 12, TITLE_H = 28, BTN_H = 32, BTN_W = 70, GAP_BTN = 8
const CARD_H = 220
const PREFER_PAD = 20, MIN_PAD = 4
const BODY_Y = PAD + TITLE_H + GAP
const BTN_Y = CARD_H - PAD - BTN_H
const BODY_AREA_H = BTN_Y - GAP - BODY_Y

const containerW = ref(340)
const centerTitle = ref(false)
const spreadBtn = ref(false)

const TITLE = '卡片标题'
const BODY = '这是一段需要在有限宽度内展示的描述文字。卡片较宽时可以完整展示，容器缩窄时换行增多，纵向空间不足时会截断尾部——这一切由 pretext 量文本尺寸后配合 cassowary 决定。'

const titleW = ref(60)
const ellipsisW = ref(14)
const bodyPrepared = ref<PreparedTextWithSegments | null>(null)
onMounted(() => {
  titleW.value = measureNaturalWidth(prepareWithSegments(TITLE, FONT) as any)
  ellipsisW.value = measureNaturalWidth(prepareWithSegments('…', FONT) as any)
  bodyPrepared.value = prepareWithSegments(BODY, FONT)
})

const result = computed(() => {
  const cw = containerW.value
  const contentW = cw - 2 * PAD

  let totalLines = 1
  if (bodyPrepared.value) {
    let cursor = { segmentIndex: 0, graphemeIndex: 0 }
    let n = 0
    while (true) {
      const range = layoutNextLineRange(bodyPrepared.value, cursor, contentW)
      if (!range) break
      n++
      cursor = range.end
    }
    totalLines = n
  }
  // totalLines 是 pretext 量出来的"阶梯函数"：宽度连续变化时它一段段跳，
  // 线性求解器表达不了这种分段关系，所以只能在外面量好、当常量喂进去。
  const totalTextH = totalLines * LH

  // 把"显示多高文字(shownTextH)"交给 cassowary，用 strength 表达优先级：
  // 不溢出(required) > 不截断(medium)。空间够时 medium 守住全文；放不下时 medium 让步、
  // sh 被 required 的上限压住，文字开始截断——这个决策从求解里涌现，不是手写 if/else。
  // （留白不再单列一个 weak 变量：它是连续偏好，会和整数行数的取整打架，见末尾 padBottom。）
  const solver = new SimplexSolver()
  const v = (name: string) => new Variable({ name, value: 0 })
  const sh = v('sh')
  const b1 = { x: v('1x'), w: v('1w') }
  const b2 = { x: v('2x'), w: v('2w') }

  solver.addConstraint(new Inequality(sh, LEQ, BODY_AREA_H - MIN_PAD, Strength.required)) // 不溢出（至少留 MIN_PAD）
  solver.addConstraint(new Equation(sh, totalTextH, Strength.medium))                      // 尽量不截断
  solver.addConstraint(new Inequality(sh, GEQ, LH, Strength.required))                      // 至少 1 行
  solver.addConstraint(new Inequality(sh, LEQ, totalTextH, Strength.required))             // 不能超过全文

  // 按钮：宽度固定，位置由约束关系定
  solver.addConstraint(new Equation(b1.w, BTN_W, Strength.weak))
  solver.addConstraint(new Equation(b2.w, BTN_W, Strength.weak))
  solver.addConstraint(new Inequality(b1.x, GEQ, PAD, Strength.required))
  solver.addConstraint(new Equation(b2.x, minus(cw - PAD, b2.w)))
  if (spreadBtn.value) {
    solver.addConstraint(new Equation(b1.x, PAD))
  } else {
    solver.addConstraint(new Equation(b1.x, minus(b2.x, plus(b1.w, GAP_BTN))))
  }
  solver.resolve()

  const val = (va: any) => Math.round(va.value)
  const shownTextH = val(sh)
  // 整数行数是最后一步 snap：求解器只给实数高度，渲染必须落到整行
  const displayLines = Math.max(1, Math.floor(sh.value / LH))
  const truncated = displayLines < totalLines
  // padBottom 不取求解器的连续值——那会和取整打架（sh 连续算到 4.5 行时留白=4，渲染却只画 4 行=该留 16）。
  // 直接用"实际画出的整行"反推余量，填满正文区，不跳变、不留死区。
  const padBottom = BODY_AREA_H - displayLines * LH

  const lines: string[] = []
  if (bodyPrepared.value) {
    let cursor = { segmentIndex: 0, graphemeIndex: 0 }
    for (let i = 0; i < displayLines; i++) {
      const isLastShown = i === displayLines - 1
      // 截断时最后一行预留出省略号宽度，否则 '…' 会被 overflow:hidden 裁掉
      const w = truncated && isLastShown ? contentW - ellipsisW.value : contentW
      const range = layoutNextLineRange(bodyPrepared.value, cursor, w)
      if (!range) break
      lines.push(materializeLineRange(bodyPrepared.value, range).text)
      cursor = range.end
    }
    if (truncated && lines.length > 0) lines[lines.length - 1] += '…'
  }

  const titleX = centerTitle.value ? Math.round((cw - titleW.value) / 2) : PAD
  return {
    title: { x: titleX, y: PAD, w: Math.round(titleW.value), h: TITLE_H },
    body: { x: PAD, y: BODY_Y, w: contentW, h: BODY_AREA_H },
    padBottom, shownTextH, lines,
    totalLines, displayLines, truncated,
    btn1: { x: val(b1.x), y: BTN_Y, w: val(b1.w), h: BTN_H },
    btn2: { x: val(b2.x), y: BTN_Y, w: val(b2.w), h: BTN_H },
    cardH: CARD_H,
  }
})

const constraints = computed(() => {
  void result.value
  const r = result.value
  const cw = containerW.value
  const totalTextH = r.totalLines * LH
  const stage = !r.truncated && r.padBottom >= PREFER_PAD
    ? '① 不截断 · 留白充足'
    : !r.truncated
      ? '② 不截断 · 留白被压缩（每多一行吃掉 22px）'
      : '③ 截断 · medium 让步于 required，只显示部分行'
  return [
    { title: '📥 已知量（pretext 量 + 固定）', kind: 'given', eqs: [
      { text: `cw = ${cw}                       ← slider` },
      { text: `title.w = ${r.title.w}            ← pretext 量宽` },
      { text: `BODY_AREA_H = ${BODY_AREA_H}      ← 固定（cardH 扣去标题/按钮）` },
      { text: `totalLines = ${r.totalLines}      ← pretext 排版（阶梯函数）` },
      { text: `totalTextH = ${r.totalLines}×${LH} = ${totalTextH}` },
    ]},
    { title: '📋 约束（喂给 cassowary）', kind: 'constraint', eqs: [
      { text: `shownTextH ≤ ${BODY_AREA_H}−${MIN_PAD}=${BODY_AREA_H - MIN_PAD}  (required · 不溢出，至少留 ${MIN_PAD})` },
      { text: `shownTextH = ${totalTextH}                 (medium · 不截断)` },
      { text: `${LH} ≤ shownTextH ≤ ${totalTextH}         (required)` },
      { text: `btn2.x = ${cw}−${PAD}−btn2.w；btn1.w ≈ btn2.w ≈ ${BTN_W}` },
      { text: spreadBtn.value ? `btn1.x = ${PAD}` : `btn1.x = btn2.x−btn1.w−${GAP_BTN}`, on: true },
      { text: centerTitle.value ? `title.x = (${cw}−${r.title.w})/2 = ${Math.round((cw - r.title.w)/2)}` : `title.x = ${PAD}`, on: centerTitle.value },
    ]},
    { title: '📤 求解结果（cassowary 输出）', kind: 'solved', eqs: [
      { text: `shownTextH = ${r.shownTextH}   ← 解`, on: true },
      { text: `displayLines = ⌊shownTextH/${LH}⌋ = ${r.displayLines}/${r.totalLines}${r.truncated ? '（截断）' : '（完整）'}`, on: true },
      { text: `padBottom = ${BODY_AREA_H}−${r.displayLines}×${LH} = ${r.padBottom}  ← 取整后的真实余量`, on: true },
      { text: `btn1 x=${r.btn1.x} w=${r.btn1.w} · btn2 x=${r.btn2.x} w=${r.btn2.w}`, on: true },
      { text: stage, on: true },
    ]},
  ]
})
</script>

<template>
  <div class="demo">
    <div class="controls">
      <label class="ctrl">
        <span>容器宽 <code>{{ containerW }}px</code></span>
        <input type="range" min="240" max="460" v-model.number="containerW" />
      </label>
      <label class="tg"><input type="checkbox" v-model="centerTitle" /><span>标题居中</span></label>
      <label class="tg"><input type="checkbox" v-model="spreadBtn" /><span>按钮两端对齐</span></label>
    </div>

    <div class="main">
      <div class="stage">
        <div class="card" :style="{ width: containerW + 'px', height: result.cardH + 'px' }">
          <div class="el title" :style="{ left: result.title.x + 'px', top: result.title.y + 'px', width: result.title.w + 'px', height: result.title.h + 'px' }">{{ TITLE }}</div>
          <div class="el body-area" :style="{ left: result.body.x + 'px', top: result.body.y + 'px', width: result.body.w + 'px', height: result.body.h + 'px' }">
            <div class="body-text" :style="{ marginBottom: result.padBottom + 'px' }">
              <div v-for="(line, i) in result.lines" :key="i" class="body-line">{{ line }}</div>
            </div>
          </div>
          <button class="el btn" :style="{ left: result.btn1.x + 'px', top: result.btn1.y + 'px', width: result.btn1.w + 'px', height: result.btn1.h + 'px' }">确定</button>
          <button class="el btn" :style="{ left: result.btn2.x + 'px', top: result.btn2.y + 'px', width: result.btn2.w + 'px', height: result.btn2.h + 'px' }">取消</button>
        </div>
      </div>

      <div class="equations">
        <div class="eq-title">约束求解流程：已知量 → 约束 → 求解结果</div>
        <div v-for="(g, gi) in constraints" :key="gi" class="eq-group" :class="'k-' + g.kind">
          <div class="eq-group-title">{{ g.title }}</div>
          <div v-for="(e, ei) in g.eqs" :key="ei" class="eq" :class="{ on: e.on }">{{ e.text }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.demo { padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); margin: 16px 0; }
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-bottom: 16px; }
.ctrl { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--vp-c-text-2); }
.ctrl input[type='range'] { width: 200px; cursor: pointer; }
.tg { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; color: var(--vp-c-text-2); font-size: 13px; }
.tg input { width: 16px; height: 16px; cursor: pointer; }
code { font-size: 0.9em; background: var(--vp-c-bg-alt); padding: 1px 5px; border-radius: 3px; }
.main { display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: start; }
@media (max-width: 760px) { .main { grid-template-columns: 1fr; } }
.stage { padding: 16px; border-radius: 4px; background: var(--vp-c-bg-alt); }
.card { position: relative; border: 2px dashed var(--vp-c-brand); border-radius: 4px; overflow: hidden; }
.el { position: absolute; box-sizing: border-box; }
.title { font-size: 16px; font-weight: 600; line-height: 28px; font-family: sans-serif; color: var(--vp-c-text-1); white-space: nowrap; }
.body-area { overflow: hidden; }
.body-text { font-size: 14px; line-height: 22px; font-family: sans-serif; color: var(--vp-c-text-2); }
.body-line { white-space: nowrap; overflow: hidden; }
.btn { border: 1px solid var(--vp-c-brand); border-radius: 4px; background: transparent; color: var(--vp-c-brand); font-size: 13px; cursor: pointer; }
.equations { padding: 10px 12px; background: var(--vp-c-bg-alt); border-radius: 4px; font-family: monospace; font-size: 12px; line-height: 1.8; color: var(--vp-c-text-2); max-height: 280px; overflow-y: auto; }
.eq-title { font-family: sans-serif; font-weight: 600; margin-bottom: 8px; color: var(--vp-c-text-1); }
.eq-group { margin-bottom: 10px; }
.eq-group-title { font-family: sans-serif; font-size: 11px; font-weight: 600; color: var(--vp-c-text-3); margin-bottom: 2px; }
.k-given .eq { color: var(--vp-c-text-3); }
.k-solved .eq { color: var(--vp-c-brand); }
.eq.on { color: var(--vp-c-brand); font-weight: 600; }
</style>
