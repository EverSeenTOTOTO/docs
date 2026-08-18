import { useMediaQuery } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

// 移动方向：0=上 1=下 2=左 3=右
export const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]]

export interface MazeSim {
  steps: number      // 实际移动的步数
  dist: number       // 终点与目标的曼哈顿距离
  reached: boolean   // 是否到达终点
  path: number[]     // 途经的格子（含起点），用于展示
}

export interface GaConfig {
  size: number
  popSize: number
  mutationRate: number
  crossoverRate: number
  chromLen: number
}

// 生成随机迷宫：外圈围墙，内部按密度抛墙，BFS 保证起点可达终点
export function generateMaze(size: number, dense = 0.28, rand = Math.random): Uint8Array | null {
  const n = size * size
  const start = size + 1
  const end = (size - 2) * size + (size - 2)

  for (let attempt = 0; attempt < 50; attempt++) {
    const walls = new Uint8Array(n)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (y === 0 || x === 0 || y === size - 1 || x === size - 1) { walls[y * size + x] = 1; continue }
        if ((y === 1 && x === 1) || (y === size - 2 && x === size - 2)) continue
        if (rand() < dense) walls[y * size + x] = 1
      }
    }

    // BFS 连通性检查
    const seen = new Uint8Array(n)
    const queue = [start]
    seen[start] = 1
    let found = false
    while (queue.length) {
      const p = queue.pop()!
      if (p === end) { found = true; break }
      const py = (p / size) | 0, px = p % size
      for (const [dy, dx] of DIRECTIONS) {
        const ny = py + dy, nx = px + dx
        if (ny < 0 || nx < 0 || ny >= size || nx >= size) continue
        const np = ny * size + nx
        if (seen[np] || walls[np]) continue
        seen[np] = 1
        queue.push(np)
      }
    }

    if (found) return walls
  }

  return null
}

// 让个体在迷宫中走一遍：无效移动（撞墙/越界）被忽略，不前进
export function simulate(ch: number[], size: number, start: number, end: number, walls: Uint8Array): MazeSim {
  let pos = start
  let steps = 0
  const path = [pos]

  for (let i = 0; i < ch.length; i++) {
    const py = (pos / size) | 0, px = pos % size
    const [dy, dx] = DIRECTIONS[ch[i]]
    const ny = py + dy, nx = px + dx
    if (ny < 0 || nx < 0 || ny >= size || nx >= size) continue
    const np = ny * size + nx
    if (walls[np]) continue
    pos = np
    steps++
    path.push(pos)
    if (pos === end) return { steps, dist: 0, reached: true, path }
  }

  const dy = Math.abs(((end / size) | 0) - ((pos / size) | 0))
  const dx = Math.abs((end % size) - (pos % size))
  return { steps, dist: dy + dx, reached: false, path }
}

// 适应度：越接近终点越高（主导），移动步数作辅助奖励；到达终点则有巨大加成并偏好更短路径
export const fitnessOf = (s: MazeSim, maxDist: number) =>
  s.reached ? 1e6 - s.steps : s.steps * 0.1 + 1000 * (1 - s.dist / maxDist)

export function randomChromosome(len: number, rand = Math.random): number[] {
  const ch: number[] = []
  for (let i = 0; i < len; i++) ch.push((rand() * 4) | 0)
  return ch
}

function tournament(fits: number[], k: number, rand: () => number): number {
  let best = 0, bestFit = -Infinity
  for (let i = 0; i < k; i++) {
    const j = (rand() * fits.length) | 0
    if (fits[j] > bestFit) { bestFit = fits[j]; best = j }
  }
  return best
}

// 用锦标赛选择 + 单点交叉 + 逐基因变异产生下一代（含精英保留与随机注入保多样性）
export function evolve(pop: number[][], fits: number[], cfg: GaConfig, rand = Math.random): number[][] {
  const next: number[][] = []
  const { chromLen: L, crossoverRate: pc, mutationRate: pm } = cfg

  // 精英保留：让当前最优基因原样进入下一代
  let bi = 0
  for (let i = 0; i < fits.length; i++) if (fits[i] > fits[bi]) bi = i
  next.push([...pop[bi]])

  while (next.length < pop.length) {
    // 小概率随机注入新个体，维持种群多样性
    if (rand() < 0.02) { next.push(randomChromosome(L, rand)); continue }

    const child = [...pop[tournament(fits, 3, rand)]]
    const mate = pop[tournament(fits, 3, rand)]

    if (rand() < pc) { // 单点交叉
      const pt = (rand() * L) | 0
      for (let i = pt; i < L; i++) child[i] = mate[i]
    }
    for (let i = 0; i < L; i++) { // 逐基因变异
      if (rand() < pm) child[i] = (rand() * 4) | 0
    }
    next.push(child)
  }

  return next
}

const MAX_HISTORY = 500

export const useGeneticMaze = () => {
  const isSmallScreen = useMediaQuery('(max-width: 375px)')
  const size = ref(isSmallScreen.value ? 11 : 21)
  const total = size.value * size.value
  const start = size.value + 1
  const end = (size.value - 2) * size.value + (size.value - 2)
  const maxDist = 2 * (size.value - 1)

  const walls = ref<Uint8Array>(generateMaze(size.value) ?? new Uint8Array(total))
  const cells = ref<string[]>(Array.from({ length: total }, () => ''))

  // 控制参数
  const popSize = ref(60)
  const mutationRate = ref(0.06)
  const speed = ref(2) // 每帧推进的代数
  const generation = ref(0)
  const running = ref(false)

  const best = ref({ fit: -Infinity, reached: false, steps: 0, gen: 0, path: [] as number[] })
  const bestHistory = ref<number[]>([])
  const avgHistory = ref<number[]>([])

  const config = computed<GaConfig>(() => ({
    size: size.value,
    popSize: popSize.value,
    mutationRate: mutationRate.value,
    crossoverRate: 0.7,
    chromLen: Math.max(48, Math.min(240, size.value * 8)),
  }))

  const solved = computed(() => best.value.reached)

  let population: number[][] = []

  const initPopulation = () => {
    const L = config.value.chromLen
    population = Array.from({ length: popSize.value }, () => randomChromosome(L))
  }

  // 评估整个种群一次，返回适应度、模拟结果与种群访问热力
  const evaluate = () => {
    const cfg = config.value
    const fits: number[] = new Array(population.length)
    const sims: MazeSim[] = new Array(population.length)
    const heat = new Uint8Array(total)
    for (let i = 0; i < population.length; i++) {
      const s = simulate(population[i], cfg.size, start, end, walls.value)
      sims[i] = s
      fits[i] = fitnessOf(s, maxDist)
      for (const p of s.path) heat[p] = 1
    }
    return { fits, sims, heat }
  }

  // 评估种群并据此演化出一个新的种群，同时更新历代统计
  const stepGenerations = (n: number) => {
    for (let k = 0; k < n; k++) {
      const { fits, sims, heat } = evaluate()

      let bi = 0
      for (let i = 0; i < fits.length; i++) if (fits[i] > fits[bi]) bi = i
      if (fits[bi] > best.value.fit) {
        best.value = {
          fit: fits[bi],
          reached: sims[bi].reached,
          steps: sims[bi].steps,
          gen: generation.value,
          path: sims[bi].path,
        }
      }

      const avg = fits.reduce((a, b) => a + b, 0) / fits.length
      bestHistory.value.push(best.value.fit)
      avgHistory.value.push(avg)
      if (bestHistory.value.length > MAX_HISTORY) bestHistory.value.splice(0, bestHistory.value.length - MAX_HISTORY)

      population = evolve(population, fits, config.value)
      generation.value++

      if (k === n - 1) refreshCells(heat) // 只按最后一代的种群画热力
    }
  }

  // 由迷宫 + 重叠层生成 DOM 样式类
  const refreshCells = (heat: Uint8Array) => {
    const classes = new Array<string>(total).fill('')
    const w = walls.value
    const bestPath = best.value.path
    const bestSet = new Int16Array(total)
    for (let i = bestPath.length - 1; i >= 0; i--) bestSet[bestPath[i]] = bestPath.length - 1 - i

    for (let i = 0; i < total; i++) {
      if (w[i]) { classes[i] = 'wall'; continue }
      if (bestSet[i] > 0) { classes[i] = bestSet[i] < 10 ? 'best' : 'best-fade'; continue }
      if (heat[i]) classes[i] = 'heat'
    }
    cells.value = classes
  }

  const regenerateMaze = () => {
    walls.value = generateMaze(size.value) ?? new Uint8Array(total)
    reset()
  }

  const reset = () => {
    running.value = false
    generation.value = 0
    best.value = { fit: -Infinity, reached: false, steps: 0, gen: 0, path: [] as number[] }
    bestHistory.value = []
    avgHistory.value = []
    initPopulation()
    refreshCells(new Uint8Array(total))
  }

  // 点击格子切换墙（自绘迷宫），起点终点不可改
  const toggleWall = (i: number) => {
    if (i === start || i === end) return
    walls.value[i] = walls.value[i] ? 0 : 1
    reset()
  }

  // 首次挂载即渲染迷宫墙，避免主体空白等重绘
  initPopulation()
  refreshCells(new Uint8Array(total))

  watch(popSize, () => reset())
  watch(mutationRate, () => reset())

  return {
    size, total, start, end,
    walls, cells,
    popSize, mutationRate, speed,
    generation, running,
    best, bestHistory, avgHistory,
    solved, config,
    stepGenerations, regenerateMaze, reset, toggleWall,
  }
}