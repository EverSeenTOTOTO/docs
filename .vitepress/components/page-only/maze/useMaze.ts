import { useMediaQuery } from '@vueuse/core';
import { reactive, ref, shallowRef, watch } from 'vue';
import { useStep } from '../../../hooks/useStep';
import { VpSelectProps } from '../../Select.vue';

const isEmpty = (i: number) => i === 0;
const isWall = (i: number) => i === 1;
const isCar = (i: number) => i === 2;
const isPath = (i: number) => i === 3;
const isStart = (i: number) => i === 4;
const isEnd = (i: number) => i === 5;
const canPass = (i: number) => isStart(i) || isEmpty(i) || isEnd(i);

const findAccessibleNeighbors = (index, { ints, SIZE, LENGTH }) => {
  return [
    // top
    index > SIZE && index - SIZE,
    // left
    index % SIZE > 0 && index - 1,
    // bottom
    index < (LENGTH - SIZE) && index + SIZE,
    // right
    (index + 1) % SIZE > 0 && index + 1,
  ]
    .filter(Boolean)
    .filter((neighbor) =>
      neighbor >= 0 &&
      neighbor < SIZE * SIZE &&
      canPass(ints[neighbor])
    );
}

const useCustomMaze = ({ mazeType, backup, ints, startPos, endPos }) => {
  const placeType = ref('1');

  const PLACE_OPTIONS: VpSelectProps['options'] = [
    {
      label: '墙',
      value: '1'
    },
    {
      label: '空',
      value: '0'
    },
    {
      label: '起点',
      value: '4'
    },
    {
      label: '终点',
      value: '5'
    }
  ]

  const pressed = ref(false);
  const updated = new Map<number, boolean>();
  const handlePointerDown = (index: number) => {
    if (mazeType.value !== 'custom') return;

    pressed.value = true;
    updated.set(index, true);

    const type = Number(placeType.value);

    if (isStart(type)) {
      if (isEnd(ints[index])) return;
      ints[startPos.value] = 0; // reset old
      startPos.value = index;
      ints[startPos.value] = 4; // set new
    } else if (isEnd(type)) {
      if (isStart(ints[index])) return;
      ints[endPos.value] = 0;
      endPos.value = index;
      ints[endPos.value] = 5;
    } else {
      if (isStart(ints[index]) || isEnd(ints[index])) return;
      ints[index] = type;
    }

    backup.value.splice(0, backup.value.length, ...ints);
  }

  const handlePointerMove = (index: number) => {
    const type = Number(placeType.value);

    if (mazeType.value !== 'custom' || isStart(type) || isEnd(type)) return;
    if (isStart(ints[index]) || isEnd(ints[index])) return;
    if (!pressed.value || updated.get(index)) return;

    ints[index] = type;
    backup.value.splice(0, backup.value.length, ...ints);
    updated.set(index, true)
  }

  const handlePointerUp = () => {
    if (mazeType.value !== 'custom') return;
    pressed.value = false;
    updated.clear();
  }

  return {
    placeType,
    PLACE_OPTIONS,

    handlePointerDown,
    handlePointerUp,
    handlePointerMove,
  };
}

const useMazeType = ({ ints, backup, SIZE, LENGTH, HALF_SIZE }) => {
  const startPos = ref(0);
  const endPos = ref(LENGTH - 1);

  const MAZE_OPTIONS: VpSelectProps['options'] = [
    {
      label: '边界',
      value: 'border'
    },
    {
      label: '回字',
      value: 'square'
    },
    {
      label: '随机',
      value: 'random'
    },
    {
      label: '自定义',
      value: 'custom'
    }
  ]
  const mazeType = ref('border');

  const generateBorderMaze = () => {
    startPos.value = 0;
    endPos.value = LENGTH - 1;
    ints[startPos.value] = 4;
    ints[endPos.value] = 5;
  }
  const generateSquareMaze = () => {
    for (let row = 1; row < SIZE - 1; row += 2) {
      if (row <= HALF_SIZE) {
        for (let col = row; col < SIZE - row; col++) {
          const index = row * SIZE + col;
          ints[index] = 1; // wall
        }
      } else {
        for (let col = SIZE - row - 1; col <= row; col++) {
          const index = row * SIZE + col;
          ints[index] = 1; // wall
        }
      }
    }

    for (let col = 1; col < SIZE - 1; col += 2) {
      if (col <= HALF_SIZE) {
        for (let row = col; row < SIZE - col; row++) {
          const index = row * SIZE + col;
          ints[index] = 1; // wall
        }
      } else {
        for (let row = SIZE - col - 1; row <= col; row++) {
          const index = row * SIZE + col;
          ints[index] = 1; // wall
        }
      }
    }

    for (let i = 2; i <= HALF_SIZE; i += 4) {
      ints[SIZE * (SIZE - i) - i] = 0;
      ints[SIZE * (i + 2) + i + 1] = 0;
    }

    startPos.value = 0;
    endPos.value = SIZE * (SIZE - HALF_SIZE) - HALF_SIZE - 1
    ints[startPos.value] = 4;
    ints[endPos.value] = 5;
  }
  const dense = ref(0.33);
  const generateRandomMaze = () => {
    generateBorderMaze();

    for (let i = 0; i < LENGTH; ++i) {
      ints[i] = Math.random() < dense.value ? 1 : 0;
    }

    startPos.value = 0;
    let end: number | undefined = undefined;
    while (!end || !canPass(ints[end])) {
      end = Math.floor(Math.random() * (LENGTH - 1));
    }
    endPos.value = end;
    ints[startPos.value] = 4;
    ints[endPos.value] = 5;
  }

  watch(mazeType, (newType) => {
    ints.fill(0)

    switch (newType) {
      case 'square':
        generateSquareMaze();
        break;
      case 'random':
        generateRandomMaze();
        break;
      case 'border':
      case 'custom':
        generateBorderMaze();
        break;
      default:
        break;
    }

    backup.value.splice(0, backup.value.length, ...ints);
  }, { immediate: true });

  const customConfig = useCustomMaze({ ints, backup, mazeType, startPos, endPos });

  return {
    mazeType,
    MAZE_OPTIONS,

    dense,
    generateRandomMaze,

    startPos,
    endPos,

    ...customConfig,
  }
}

const useMazeRun = ({ ints, backup, SIZE, LENGTH, startPos, endPos }) => {
  const step = ref((() => { }));
  const carPos = ref(-1);

  watch(carPos, () => {
    if (carPos.value === -1) return;
    ints[carPos.value] = 2; // mark car position
  })

  const stack: (() => void)[] = [];
  const dfs = useStep({
    stepInterval: 1000 / 30,
    onInit() {
      backup.value.splice(0, backup.value.length, ...ints);
      carPos.value = startPos.value;

      const go = (target: number, fullPath: number[]) => stack.push(() => {
        ints[carPos.value] = 3; // mark visited
        fullPath.push(target);
        carPos.value = target;

        if (target === endPos.value) {
          const replay = (i: number) => {
            ints[fullPath[i]] = 3; // mark path
            if (i < fullPath.length - 1) return stack.push(() => replay(i + 1));
            dfs.finish();
          }

          ints.splice(0, ints.length, ...backup.value);
          // already reached end, so we can just replay the direct path
          stack.splice(0, stack.length, () => replay(0));
          return;
        }

        const neighbors = findAccessibleNeighbors(carPos.value, { ints, SIZE, LENGTH });

        if (neighbors.length === 0 && stack.length === 0) {
          dfs.finish();
          return;
        }

        neighbors.forEach(neighbor => {
          stack.push(() => go(neighbor, [...fullPath]));
        })
      })

      go(startPos.value, []);
    },
    onStep() {
      stack.pop()?.();
    },
    onReset() {
      ints.splice(0, ints.length, ...backup.value); // reset maze
      stack.splice(0, stack.length);
      carPos.value = -1;
      step.value = () => { };
    }
  })


  return {
    modes: {
      dfs,
    },
  }
}

export const useMaze = () => {
  const isSmallScreen = useMediaQuery('(max-width: 375px)');

  const SIZE = isSmallScreen.value ? 11 : 31; // grid cells
  const HALF_SIZE = Math.floor(SIZE / 2);
  const LENGTH = SIZE * SIZE;
  const ints = reactive(Array.from({ length: LENGTH }, () => 0));
  const backup = shallowRef<number[]>([]);

  const { startPos, endPos, ...typeConfig } = useMazeType({ ints, backup, SIZE, LENGTH, HALF_SIZE });
  const runConfig = useMazeRun({ ints, backup, SIZE, LENGTH, startPos, endPos });


  return {
    ints,
    SIZE,

    isEmpty,
    isWall,
    isCar,
    isPath,
    isStart,
    isEnd,
    canPass,

    ...typeConfig,
    ...runConfig,
  }
}
