import { useMediaQuery } from '@vueuse/core';
import { reactive, ref, watch } from 'vue';
import { VpSelectProps } from '../../Select.vue';

const isEmpty = (i: number) => i === 0;
const isWall = (i: number) => i === 1;
const isCar = (i: number) => i === 2;
const isPath = (i: number) => i === 3;
const isStart = (i: number) => i === 4;
const isEnd = (i: number) => i === 5;
const canPass = (i: number) => isEmpty(i) || isEnd(i);

const useCustomMaze = ({ mazeType, ints, startPos, endPos }) => {
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
      ints[startPos.value] = 0; // reset old
      startPos.value = index;
      ints[startPos.value] = 4; // set new
    } else if (isEnd(type)) {
      ints[endPos.value] = 0;
      endPos.value = index;
      ints[endPos.value] = 5;
    } else {
      if (isStart(ints[index]) || isEnd(ints[index])) return;
      ints[index] = type;
    }
  }

  const handlePointerMove = (index: number) => {
    const type = Number(placeType.value);
    if (mazeType.value !== 'custom' || isStart(type) || isEnd(type)) return;
    if (isStart(ints[index]) || isEnd(ints[index])) return;
    if (!pressed.value || updated.get(index)) return;
    ints[index] = type;
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

const useMazeType = ({ ints, SIZE, LENGTH, HALF_SIZE, canPass }) => {
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

  const customConfig = useCustomMaze({ ints, mazeType, startPos, endPos });

  return {
    mazeType,
    MAZE_OPTIONS,

    dense,
    generateRandomMaze,

    ...customConfig,
  }
}

export const useMaze = () => {
  const isSmallScreen = useMediaQuery('(max-width: 375px)');

  const SIZE = isSmallScreen.value ? 11 : 31; // grid cells
  const HALF_SIZE = Math.floor(SIZE / 2);
  const LENGTH = SIZE * SIZE;
  const ints = reactive(Array.from({ length: LENGTH }, () => 0));

  const typeConfig = useMazeType({ ints, SIZE, LENGTH, HALF_SIZE, canPass });

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

    ...typeConfig
  }
}
