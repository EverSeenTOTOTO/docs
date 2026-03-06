import * as THREE from 'three';
import { FaceName, Move, RotationDir, CubeState, FACE_ORDER } from './types';

// Parse move string like "R U R' U'" into Move[]
export function parseMoves(str: string): Move[] {
  const moves: Move[] = [];
  const regex = /([URFDLBMES])(['2])?/gi;
  let match;
  
  while ((match = regex.exec(str)) !== null) {
    const face = match[1].toUpperCase() as FaceName;
    const suffix = match[2];
    let dir: RotationDir = 1;
    let count = 1;
    
    if (suffix === "'") {
      dir = -1;
    } else if (suffix === '2') {
      count = 2;
    }
    
    for (let i = 0; i < count; i++) {
      moves.push({ face, dir });
    }
  }
  
  return moves;
}

// Get axis for face rotation
export function getFaceAxis(face: FaceName): THREE.Vector3 {
  switch (face) {
    case 'U': return new THREE.Vector3(0, 1, 0);
    case 'D': return new THREE.Vector3(0, -1, 0);
    case 'R': return new THREE.Vector3(1, 0, 0);
    case 'L': return new THREE.Vector3(-1, 0, 0);
    case 'F': return new THREE.Vector3(0, 0, 1);
    case 'B': return new THREE.Vector3(0, 0, -1);
    // Middle layers
    case 'M': return new THREE.Vector3(-1, 0, 0); // Follows L
    case 'E': return new THREE.Vector3(0, -1, 0); // Follows D
    case 'S': return new THREE.Vector3(0, 0, 1);  // Follows F
  }
}

// Get layer index for face (0, 1, 2 for 3x3 cube)
export function getFaceLayer(face: FaceName): number {
  switch (face) {
    case 'U': return 2;
    case 'D': return 0;
    case 'R': return 2;
    case 'L': return 0;
    case 'F': return 2;
    case 'B': return 0;
  }
}

// Check if a cubie position is on a specific face layer
export function isOnLayer(pos: THREE.Vector3, face: FaceName): boolean {
  const layer = getFaceLayer(face);
  switch (face) {
    case 'U': return Math.round(pos.y) === layer - 1;
    case 'D': return Math.round(pos.y) === layer - 1;
    case 'R': return Math.round(pos.x) === layer - 1;
    case 'L': return Math.round(pos.x) === layer - 1;
    case 'F': return Math.round(pos.z) === layer - 1;
    case 'B': return Math.round(pos.z) === layer - 1;
  }
}

// Rotate a position around an axis
export function rotatePosition(pos: THREE.Vector3, face: FaceName, dir: RotationDir): THREE.Vector3 {
  const axis = getFaceAxis(face);
  const angle = (Math.PI / 2) * dir;
  const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  return pos.clone().applyQuaternion(quaternion).round();
}

// Rotate face sticker indices
export function rotateFace(state: CubeState, face: FaceName, dir: RotationDir): CubeState {
  const faceIndex = FACE_ORDER.indexOf(face);
  const offset = faceIndex * 9;
  const faceColors = state.slice(offset, offset + 9).split('');
  
  let rotated: string[];
  if (dir === 1) {
    rotated = [
      faceColors[6], faceColors[3], faceColors[0],
      faceColors[7], faceColors[4], faceColors[1],
      faceColors[8], faceColors[5], faceColors[2]
    ];
  } else {
    rotated = [
      faceColors[2], faceColors[5], faceColors[8],
      faceColors[1], faceColors[4], faceColors[7],
      faceColors[0], faceColors[3], faceColors[6]
    ];
  }
  
  const newState = state.split('');
  newState.splice(offset, 9, ...rotated);
  return newState.join('');
}

// Apply edge permutations for a face rotation
export function applyMoveToState(state: CubeState, move: Move): CubeState {
  const { face, dir } = move;
  let newState = rotateFace(state, face, dir);
  
  // Edge and corner permutations
  const cycles = getPermutationCycles(face, dir);
  for (const cycle of cycles) {
    const temp = newState[cycle[0]];
    for (let i = 0; i < cycle.length - 1; i++) {
      newState = newState.substring(0, cycle[i + 1]) + newState[cycle[i]] + newState.substring(cycle[i + 1] + 1);
    }
    newState = newState.substring(0, cycle[cycle.length - 1]) + temp + newState.substring(cycle[cycle.length - 1] + 1);
  }
  
  return newState;
}

// Get sticker permutation cycles for a face move
function getPermutationCycles(face: FaceName, dir: RotationDir): number[][] {
  // State order: U(0-8), R(9-17), F(18-26), D(27-35), L(36-44), B(45-53)
  // Each face: 0 1 2
  //            3 4 5
  //            6 7 8
  
  // Define cycles for each face (clockwise)
  const faceCycles: Partial<Record<FaceName, number[][]>> = {
    U: [
      [2, 11, 20, 45], [1, 14, 23, 48], [0, 17, 26, 51], // R-F-B edges
      [2, 9, 18, 47], [0, 11, 20, 45] // corners
    ],
    D: [
      [6, 29, 38, 51], [7, 32, 41, 48], [8, 35, 44, 45], // F-L-B-R edges
    ],
    R: [
      [2, 20, 8, 47], [5, 23, 11, 50], [8, 26, 14, 53], // U-F-D-B
    ],
    L: [
      [0, 53, 6, 18], [3, 50, 3, 21], [6, 47, 0, 24], // U-B-D-F
    ],
    F: [
      [6, 11, 2, 38], [7, 14, 5, 37], [8, 17, 8, 36], // U-R-D-L
    ],
    B: [
      [2, 38, 8, 11], [1, 41, 7, 14], [0, 44, 6, 17], // U-L-D-R
    ],
    // Middle layer cycles (M follows L, E follows D, S follows F)
    // M: rotates x=0 layer, affects U/F/D/B middle column (indices 1,4,7)
    M: [
      [1, 19, 28, 52], [4, 22, 31, 49], [7, 25, 34, 46], // U-F-D-B middle column
    ],
    // E: rotates y=0 layer, affects F/L/B/R middle row
    E: [
      [21, 39, 48, 12], [22, 42, 49, 13], [23, 45, 50, 14], // F-L-B-R middle row
    ],
    // S: rotates z=0 layer, affects U/R/D/L middle row
    S: [
      [3, 10, 30, 37], [4, 13, 31, 40], [5, 16, 32, 43], // U-R-D-L middle row
    ],
  };
  
  const cycles = faceCycles[face];
  if (!cycles) return [];
  
  if (dir === 1) {
    return cycles;
  } else {
    return cycles.map(cycle => [...cycle].reverse());
  }
}

// Generate solved state
export function solvedState(): CubeState {
  return 'WWWWWWWWWRRRRRRRRRGGGGGGGGBBBBBBBBBYYYYYYYYOOOOOOOOOO';
}

// Generate random scramble
export function scramble(moves: number = 20): string {
  const faces: FaceName[] = ['U', 'D', 'L', 'R', 'F', 'B'];
  const suffixes = ['', "'", '2'];
  const result: string[] = [];
  let lastFace = '';
  
  for (let i = 0; i < moves; i++) {
    let face: FaceName;
    do {
      face = faces[Math.floor(Math.random() * faces.length)];
    } while (face === lastFace);
    
    lastFace = face;
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    result.push(face + suffix);
  }
  
  return result.join(' ');
}

// Detect move from drag direction
export function detectMoveFromDrag(
  startPos: THREE.Vector3,
  endPos: THREE.Vector3,
  normal: THREE.Vector3,
  camera: THREE.Camera
): Move | null {
  const dragDir = endPos.clone().sub(startPos).normalize();
  const worldNormal = normal.clone();
  
  // Project drag direction onto the face plane
  const tangent1 = new THREE.Vector3();
  const tangent2 = new THREE.Vector3();
  
  if (Math.abs(worldNormal.y) > 0.9) {
    tangent1.set(1, 0, 0);
    tangent2.set(0, 0, 1);
  } else if (Math.abs(worldNormal.x) > 0.9) {
    tangent1.set(0, 1, 0);
    tangent2.set(0, 0, 1);
  } else {
    tangent1.set(1, 0, 0);
    tangent2.set(0, 1, 0);
  }
  
  // Determine which direction the drag is closest to
  const dot1 = dragDir.dot(tangent1);
  const dot2 = dragDir.dot(tangent2);
  
  // Determine face and direction based on position and drag direction
  const x = Math.round(startPos.x);
  const y = Math.round(startPos.y);
  const z = Math.round(startPos.z);
  
  // This is simplified - full implementation would need more sophisticated detection
  if (Math.abs(dot1) > Math.abs(dot2)) {
    // Moving along tangent1 (affects vertical layers)
    if (Math.abs(worldNormal.y) > 0.9) {
      // On U or D face, horizontal drag
      const layer = z + 1;
      if (layer === 0) return { face: 'L', dir: dot1 > 0 ? -1 : 1 };
      if (layer === 2) return { face: 'R', dir: dot1 > 0 ? 1 : -1 };
    }
  } else {
    // Moving along tangent2
  }
  
  return null;
}
