<script setup>
import RubiksCube from '@vp/RubiksCube/index.vue'
</script>

# 魔方

<RubiksCube defaultValue="L U" />

## 魔方实现细节

> 由 GLM-5 实现。

### 架构概览

组件位于 `.vitepress/components/RubiksCube/` 目录，由以下文件组成：

| 文件 | 职责 |
|------|------|
| `types.ts` | 类型定义（面名、颜色、移动、状态等） |
| `Cube.ts` | Three.js 场景核心类，管理 3D 渲染与动画 |
| `index.tsx` | React 组件，提供 UI 交互控件 |
| `utils.ts` | 工具函数（移动解析、状态管理、打乱生成） |
| `RubiksCube.vue` | Vue 包装器，集成 VitePress 暗色模式 |

### 核心类型定义

```ts
// 六个面的标准符号
type FaceName = 'U' | 'D' | 'L' | 'R' | 'F' | 'B';
// 上(Up) 下(Down) 左(Left) 右(Right) 前(Front) 后(Back)

// 旋转方向：1=顺时针，-1=逆时针
type RotationDir = 1 | -1;

// 六种颜色
type Color = 'W' | 'Y' | 'G' | 'B' | 'O' | 'R';
// 白 黄 绿 蓝 橙 红

// 单次移动
interface Move {
  face: FaceName;
  dir: RotationDir;
}
```

颜色映射：
- U → W（白色）、D → Y（黄色）
- L → O（橙色）、R → R（红色）
- F → G（绿色）、B → B（蓝色）

### 3D 场景实现

#### 方块创建

魔方由 26 个小方块（cubie）组成，中心块被跳过：

```ts
for (let x = -1; x <= 1; x++) {
  for (let y = -1; y <= 1; y++) {
    for (let z = -1; z <= 1; z++) {
      if (x === 0 && y === 0 && z === 0) continue; // 跳过中心
      const cubie = this.createCubie(x, y, z);
    }
  }
}
```

每个 cubie 是一个 `BoxGeometry`，有 6 个面。外露面根据位置着色，内部面为深色（`0x111111`）。

#### 面旋转动画

旋转使用 Pivot Group 技术实现：

1. **识别层内 cubie**：根据面名筛选位置符合条件的 cubie
2. **附加到 Pivot**：将层内 cubie 从场景附加到 pivot 组
3. **动画旋转**：pivot 绕轴旋转 90°，使用 `easeOutCubic` 缓动
4. **位置规范化**：动画结束后取整位置和旋转，将 cubie 移回场景

```ts
// 关键代码
const layerCubies = this.getCubiesOnLayer(face);
layerCubies.forEach(cubie => this.pivot.attach(cubie.mesh));

// 动画循环
this.pivot.rotateOnAxis(axis, angle * easeProgress);
```

#### 动画队列

防止动画冲突，连续操作会被排队：

```ts
if (this.isAnimating) {
  this.animationQueue.push({ face, dir });
  return;
}
```

### 移动符号解析

支持标准魔方符号：

| 符号 | 含义 |
|------|------|
| `R` | 右面顺时针旋转 90° |
| `R'` | 右面逆时针旋转 90° |
| `R2` | 右面旋转 180° |

解析函数使用正则表达式：

```ts
const regex = /([URFDLB])(['2])?/gi;
// 捕获面名和可选后缀
```

### 打乱算法

生成 20 步随机打乱，避免相邻两步操作同一面：

```ts
for (let i = 0; i < 20; i++) {
  let face;
  do {
    face = randomFace();
  } while (face === lastFace);
  // ...
}
```

