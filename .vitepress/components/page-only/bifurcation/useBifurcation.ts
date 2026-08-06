import { computed, ref } from 'vue'

// 逻辑斯蒂映射 x_{n+1} = r x_n (1 - x_n)
// R 控制参数范围 [R_MIN, R_MAX]
export const R_MIN = 2.6
export const R_MAX = 4.0

export const logistic = (r: number, x: number) => r * x * (1 - x)

// 从 x0 出发迭代 n 步，返回每一步的 x 序列
function iterate(r: number, x0: number, n: number): number[] {
  const xs: number[] = []
  let x = x0
  for (let i = 0; i < n; i++) {
    x = logistic(r, x)
    xs.push(x)
  }
  return xs
}

// 迭代到吸引子上，返回一族趋于稳定循环的 x 值（用于分叉图取点）
export function attractor(r: number, count = 250): number[] {
  let x = 0.4
  for (let i = 0; i < 300; i++) x = logistic(r, x) // 丢弃暂态
  const pts: number[] = []
  for (let i = 0; i < count; i++) {
    x = logistic(r, x)
    pts.push(x)
  }
  return pts
}

// 估计渐近循环的周期；若在给定周期内找不到（混沌/数值饱和）则返回 -1
export function periodOf(r: number, maxPeriod = 64): number {
  const pts = attractor(r, 600)
  const tail = 40
  for (let L = 1; L <= maxPeriod; L++) {
    let ok = true
    for (let i = 0; i < tail; i++) {
      if (Math.abs(pts[pts.length - 1 - i] - pts[pts.length - 1 - i - L]) > 1e-3) {
        ok = false
        break
      }
    }
    if (ok) return L
  }
  return -1
}

// 蛛网图所需的完整轨道（从靠近抛物线上方的起点出发）
export function orbit(r: number, x0 = 0.4, n = 140): number[] {
  return iterate(r, x0, n)
}

export function useBifurcation() {
  const r = ref(3.3)

  // 当前 R 的吸引子与周期
  const attrs = computed(() => attractor(r.value))
  const period = computed(() => periodOf(r.value))

  return { r, attrs, period }
}
