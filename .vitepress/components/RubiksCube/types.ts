import * as THREE from 'three';

export type FaceName = 'U' | 'D' | 'L' | 'R' | 'F' | 'B' | 'M' | 'E' | 'S';
export type RotationDir = 1 | -1; // 1 = clockwise, -1 = counter-clockwise

export interface Move {
  face: FaceName;
  dir: RotationDir;
}

export type Color = 'W' | 'Y' | 'G' | 'B' | 'O' | 'R'; // White, Yellow, Green, Blue, Orange, Red

// 54-element string representing cube state (U1-U9, R1-R9, F1-F9, D1-D9, L1-L9, B1-B9)
export type CubeState = string;

export interface CubieData {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
}

export const FACE_COLORS: Record<FaceName, Color> = {
  U: 'W', D: 'Y', L: 'O', R: 'R', F: 'G', B: 'B',
  M: 'O', E: 'Y', S: 'G' // Middle layers follow L, D, F directions
};

export const COLOR_HEX: Record<Color, number> = {
  W: 0xffffff, Y: 0xffff00, G: 0x00ff00,
  B: 0x0000ff, O: 0xff8800, R: 0xff0000
};

// Face order in state string
export const FACE_ORDER: FaceName[] = ['U', 'R', 'F', 'D', 'L', 'B'];

// Highlight configuration
export interface HighlightConfig {
  face: FaceName;
  positions: number[]; // 0-8 index on the face
}
