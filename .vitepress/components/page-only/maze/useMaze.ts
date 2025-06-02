import { useMediaQuery } from '@vueuse/core';
import { reactive, ref, shallowRef, watch } from 'vue';
import { useStep } from '../../../hooks/useStep';
import { VpSelectProps } from '../../Select.vue';

export const BLANK = 0;
export const WALL = 1;
export const CAR = 2;
export const PATH = 3;
export const START = 4;
export const END = 5;

const canPass = (i: number) => i === START || i === END || i === BLANK;

const getNeighbors = (index: number, { SIZE, LENGTH }) => {
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
    .filter((neighbor) => neighbor >= 0 && neighbor < LENGTH);
}

const findAccessibleNeighbors = (index: number, { ints, SIZE, LENGTH }) => {
  return getNeighbors(index, { SIZE, LENGTH }).filter((neighbor) => canPass(ints[neighbor]));
}

const useCustomMaze = ({ mazeType, backup, ints, startPos, endPos }) => {
  const disableCustom = ref(false);
  const placeType = ref(String(WALL));

  const PLACE_OPTIONS: VpSelectProps['options'] = [
    {
      label: '墙',
      value: String(WALL)
    },
    {
      label: '空',
      value: String(BLANK)
    },
    {
      label: '起点',
      value: String(START)
    },
    {
      label: '终点',
      value: String(END)
    }
  ]

  const pressed = ref(false);
  const updated = new Map<number, boolean>();
  const handlePointerDown = (index: number) => {
    if (mazeType.value !== 'custom' || disableCustom.value) return;

    pressed.value = true;
    updated.set(index, true);

    const type = Number(placeType.value);

    if (type === START) {
      if (ints[index] === END) return;

      ints[startPos.value] = BLANK; // reset old
      startPos.value = index;
      ints[startPos.value] = START; // set new
    } else if (type === END) {
      if (ints[index] === START) return;

      ints[endPos.value] = BLANK;
      endPos.value = index;
      ints[endPos.value] = END;
    } else {
      if (ints[index] === START || ints[index] === END) return;

      ints[index] = type;
    }

    backup.value.splice(0, backup.value.length, ...ints);
  }

  const handlePointerMove = (index: number) => {
    const type = Number(placeType.value);

    if (mazeType.value !== 'custom' || disableCustom.value || type === START || type === END) return;
    if (ints[index] === START || ints[index] === END) return;
    if (!pressed.value || updated.get(index)) return;

    ints[index] = type;
    backup.value.splice(0, backup.value.length, ...ints);
    updated.set(index, true)
  }

  const handlePointerUp = () => {
    if (mazeType.value !== 'custom' || disableCustom.value) return;
    pressed.value = false;
    updated.clear();
  }

  return {
    placeType,
    PLACE_OPTIONS,

    disableCustom,

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
    ints[startPos.value] = START;
    ints[endPos.value] = END;

    backup.value.splice(0, backup.value.length, ...ints);
  }
  const generateSquareMaze = () => {
    for (let row = 1; row < SIZE - 1; row += 2) {
      if (row <= HALF_SIZE) {
        for (let col = row; col < SIZE - row; col++) {
          const index = row * SIZE + col;
          ints[index] = WALL; // wall
        }
      } else {
        for (let col = SIZE - row - 1; col <= row; col++) {
          const index = row * SIZE + col;
          ints[index] = WALL; // wall
        }
      }
    }

    for (let col = 1; col < SIZE - 1; col += 2) {
      if (col <= HALF_SIZE) {
        for (let row = col; row < SIZE - col; row++) {
          const index = row * SIZE + col;
          ints[index] = WALL; // wall
        }
      } else {
        for (let row = SIZE - col - 1; row <= col; row++) {
          const index = row * SIZE + col;
          ints[index] = WALL; // wall
        }
      }
    }

    for (let i = 2; i <= HALF_SIZE; i += 4) {
      ints[SIZE * (SIZE - i) - i] = BLANK;
      ints[SIZE * (i + 2) + i + 1] = BLANK;
    }

    startPos.value = 0;
    endPos.value = SIZE * (SIZE - HALF_SIZE) - HALF_SIZE - 1
    ints[startPos.value] = START;
    ints[endPos.value] = END;

    backup.value.splice(0, backup.value.length, ...ints);
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
      end = Math.floor(Math.random() * LENGTH);
    }
    endPos.value = end;
    ints[startPos.value] = 4;
    ints[endPos.value] = 5;

    backup.value.splice(0, backup.value.length, ...ints);
  }

  watch(mazeType, (newType) => {
    ints.fill(BLANK)

    switch (newType) {
      case 'square':
        return generateSquareMaze();
      case 'random':
        return generateRandomMaze();
      case 'border':
      case 'custom':
        return generateBorderMaze();
      default:
        break;
    }
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
      carPos.value = startPos.value;

      const go = (target: number, fullPath: number[]) => stack.push(() => {
        if (ints[target] === PATH) return; // already visited

        ints[carPos.value] = PATH; // mark visited
        fullPath.push(target);
        carPos.value = target;

        if (target === endPos.value) {
          const replay = (i: number) => {
            ints[fullPath[i]] = PATH; // mark path
            if (i < fullPath.length - 1) return stack.push(() => replay(i + 1));
            dfs.finish();
          }

          // already reached end, so we can stop traverse, reset maze and replay the direct path
          ints.splice(BLANK, ints.length, ...backup.value); // reset maze
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

  const bfs = useStep({
    stepInterval: 1000 / 30,
    onInit() {
      carPos.value = startPos.value;

      const go = (target: number, fullPath: number[]) => stack.push(() => {
        if (ints[target] === PATH) return; // already visited

        ints[carPos.value] = PATH; // mark visited
        fullPath.push(target);
        carPos.value = target;

        if (target === endPos.value) {
          const replay = (i: number) => {
            ints[fullPath[i]] = PATH; // mark path
            if (i < fullPath.length - 1) return stack.push(() => replay(i + 1));
            bfs.finish();
          }

          ints.splice(0, ints.length, ...backup.value);
          stack.splice(0, stack.length, () => replay(0));
          return;
        }

        const neighbors = findAccessibleNeighbors(carPos.value, { ints, SIZE, LENGTH });

        if (neighbors.length === 0 && stack.length === 0) {
          bfs.finish();
          return;
        }

        neighbors.forEach(neighbor => {
          stack.push(() => go(neighbor, [...fullPath]));
        })
      })

      go(startPos.value, []);
    },
    onStep() {
      stack.shift()?.();
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
      bfs,
    },
  }
}

export const useMaze = () => {
  const isSmallScreen = useMediaQuery('(max-width: 375px)');

  const SIZE = isSmallScreen.value ? 11 : 31; // grid cells
  const HALF_SIZE = Math.floor(SIZE / 2);
  const LENGTH = SIZE * SIZE;
  const ints = reactive(Array.from({ length: LENGTH }, () => BLANK));
  const backup = shallowRef<number[]>([]);

  const { startPos, endPos, ...typeConfig } = useMazeType({ ints, backup, SIZE, LENGTH, HALF_SIZE });
  const runConfig = useMazeRun({ ints, backup, SIZE, LENGTH, startPos, endPos });

  return {
    ints,
    SIZE,

    canPass,

    ...typeConfig,
    ...runConfig,
  }
}
