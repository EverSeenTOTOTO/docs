import * as THREE from 'three';
import { Color, COLOR_HEX, CubeState, CubieData, FACE_COLORS, FaceName, HighlightConfig } from './types';
import { applyMoveToState, parseMoves } from './utils';

const CUBIE_SIZE = 1;
const GAP = 0.05;
const FACE_NORMALS: Record<FaceName, THREE.Vector3> = {
  U: new THREE.Vector3(0, 1, 0),
  D: new THREE.Vector3(0, -1, 0),
  R: new THREE.Vector3(1, 0, 0),
  L: new THREE.Vector3(-1, 0, 0),
  F: new THREE.Vector3(0, 0, 1),
  B: new THREE.Vector3(0, 0, -1),
  // Middle layers
  M: new THREE.Vector3(-1, 0, 0), // Follows L direction
  E: new THREE.Vector3(0, -1, 0), // Follows D direction
  S: new THREE.Vector3(0, 0, 1),  // Follows F direction
};

// Solved state: U=White, R=Red, F=Green, D=Yellow, L=Orange, B=Blue
const SOLVED_STATE: CubeState = 'WWWWWWWWWRRRRRRRRRGGGGGGGGBBBBBBBBBYYYYYYYYOOOOOOOOOO';

export class RubiksCubeScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  cubies: CubieData[] = [];
  pivot: THREE.Group;
  isAnimating = false;
  animationQueue: Array<{ face: FaceName; dir: 1 | -1; callback?: () => void }> = [];
  private currentState: CubeState = SOLVED_STATE;
  private highlightEdges: Array<{ mesh: THREE.Mesh; edge: THREE.LineSegments }> = [];
  private initialCameraPosition = new THREE.Vector3(5, 5, 5);
  private initialCameraTarget = new THREE.Vector3(0, 0, 0);

  constructor(container: HTMLElement) {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(5, 5, 5);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(10, 20, 10);
    this.scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight2.position.set(-10, -10, -10);
    this.scene.add(directionalLight2);

    // Pivot for rotation
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    // Create cube
    this.createCube();

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });
    resizeObserver.observe(container);
  }

  private createCubie(x: number, y: number, z: number): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(CUBIE_SIZE - GAP, CUBIE_SIZE - GAP, CUBIE_SIZE - GAP);

    // Create materials for each face
    const materials: THREE.MeshStandardMaterial[] = [];
    const faceOrder: FaceName[] = ['R', 'L', 'U', 'D', 'F', 'B']; // BoxGeometry face order: +x, -x, +y, -y, +z, -z

    for (let i = 0; i < 6; i++) {
      const faceName = faceOrder[i];
      let color: Color;

      // Determine color based on position
      if (faceName === 'R' && x === 1) color = FACE_COLORS.R;
      else if (faceName === 'L' && x === -1) color = FACE_COLORS.L;
      else if (faceName === 'U' && y === 1) color = FACE_COLORS.U;
      else if (faceName === 'D' && y === -1) color = FACE_COLORS.D;
      else if (faceName === 'F' && z === 1) color = FACE_COLORS.F;
      else if (faceName === 'B' && z === -1) color = FACE_COLORS.B;
      else color = 'W'; // Inner faces are black-ish

      const material = new THREE.MeshStandardMaterial({
        color: color === 'W' && !(faceName === 'R' && x === 1) && !(faceName === 'L' && x === -1) && !(faceName === 'U' && y === 1) && !(faceName === 'D' && y === -1) && !(faceName === 'F' && z === 1) && !(faceName === 'B' && z === -1) ? 0x111111 : COLOR_HEX[color],
        roughness: 0.15,
        metalness: 0.0,
      });
      materials.push(material);
    }

    const mesh = new THREE.Mesh(geometry, materials);
    mesh.position.set(x * CUBIE_SIZE, y * CUBIE_SIZE, z * CUBIE_SIZE);

    // Store original colors for state updates
    mesh.userData = {
      originalPosition: new THREE.Vector3(x, y, z),
      faceColors: materials.map((_m, i) => {
        const fn = faceOrder[i];
        if (fn === 'R' && x === 1) return FACE_COLORS.R;
        if (fn === 'L' && x === -1) return FACE_COLORS.L;
        if (fn === 'U' && y === 1) return FACE_COLORS.U;
        if (fn === 'D' && y === -1) return FACE_COLORS.D;
        if (fn === 'F' && z === 1) return FACE_COLORS.F;
        if (fn === 'B' && z === -1) return FACE_COLORS.B;
        return null;
      })
    };

    return mesh;
  }

  private createCube(): void {
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          // Skip center piece
          if (x === 0 && y === 0 && z === 0) continue;

          const cubie = this.createCubie(x, y, z);
          this.scene.add(cubie);
          this.cubies.push({
            mesh: cubie,
            position: new THREE.Vector3(x, y, z)
          });
        }
      }
    }
  }

  // Get cubies on a specific layer
  getCubiesOnLayer(face: FaceName): CubieData[] {
    return this.cubies.filter(cubie => {
      const pos = cubie.mesh.position;
      const roundedPos = new THREE.Vector3(
        Math.round(pos.x),
        Math.round(pos.y),
        Math.round(pos.z)
      );

      switch (face) {
        case 'U': return roundedPos.y === 1;
        case 'D': return roundedPos.y === -1;
        case 'R': return roundedPos.x === 1;
        case 'L': return roundedPos.x === -1;
        case 'F': return roundedPos.z === 1;
        case 'B': return roundedPos.z === -1;
        // Middle layers
        case 'M': return roundedPos.x === 0; // Middle column (follows L)
        case 'E': return roundedPos.y === 0; // Equator (follows D)
        case 'S': return roundedPos.z === 0; // Standing (follows F)
      }
    });
  }

  // Animate a face rotation
  async rotateFace(face: FaceName, dir: 1 | -1, duration: number = 300): Promise<void> {
    if (this.isAnimating) {
      this.animationQueue.push({ face, dir });
      return;
    }

    this.isAnimating = true;

    const layerCubies = this.getCubiesOnLayer(face);
    const axis = FACE_NORMALS[face].clone();
    const angle = (Math.PI / 2) * dir;

    // Move cubies to pivot
    layerCubies.forEach(cubie => {
      this.pivot.attach(cubie.mesh);
    });

    // Animate
    const startTime = performance.now();

    return new Promise(resolve => {
      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3); // easeOutCubic

        this.pivot.rotation.set(0, 0, 0);
        this.pivot.rotateOnAxis(axis, angle * easeProgress);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // Finalize rotation
          layerCubies.forEach(cubie => {
            // Update position
            cubie.mesh.position.x = Math.round(cubie.mesh.position.x);
            cubie.mesh.position.y = Math.round(cubie.mesh.position.y);
            cubie.mesh.position.z = Math.round(cubie.mesh.position.z);

            // Round rotation
            const euler = cubie.mesh.rotation;
            euler.x = Math.round(euler.x / (Math.PI / 2)) * (Math.PI / 2);
            euler.y = Math.round(euler.y / (Math.PI / 2)) * (Math.PI / 2);
            euler.z = Math.round(euler.z / (Math.PI / 2)) * (Math.PI / 2);

            // Move back to scene
            this.scene.attach(cubie.mesh);
          });

          this.pivot.rotation.set(0, 0, 0);
          this.isAnimating = false;

          // Update state
          this.currentState = applyMoveToState(this.currentState, { face, dir });

          // Process queue
          const next = this.animationQueue.shift();
          if (next) {
            this.rotateFace(next.face, next.dir).then(resolve);
          } else {
            resolve();
          }
        }

        this.renderer.render(this.scene, this.camera);
      };

      animate();
    });
  }

  // Reset to solved state
  reset(): void {
    // Remove all cubies
    this.cubies.forEach(cubie => {
      this.scene.remove(cubie.mesh);
      cubie.mesh.geometry.dispose();
      (cubie.mesh.material as THREE.Material[]).forEach(m => m.dispose());
    });
    this.cubies = [];

    // Recreate
    this.createCube();
    this.animationQueue = [];
    this.isAnimating = false;
    this.currentState = SOLVED_STATE;
  }

  // Get current state as string
  getState(): string {
    return this.currentState;
  }

  // Execute multiple moves from string (instant, no animation)
  executeMovesInstant(movesStr: string): void {
    const moves = parseMoves(movesStr);

    for (const move of moves) {
      const { face, dir } = move;
      const layerCubies = this.getCubiesOnLayer(face);
      const axis = FACE_NORMALS[face].clone();
      const angle = (Math.PI / 2) * dir;

      // Move cubies to pivot
      layerCubies.forEach(cubie => {
        this.pivot.attach(cubie.mesh);
      });

      // Apply rotation instantly
      this.pivot.rotateOnAxis(axis, angle);

      // Finalize rotation
      layerCubies.forEach(cubie => {
        cubie.mesh.position.x = Math.round(cubie.mesh.position.x);
        cubie.mesh.position.y = Math.round(cubie.mesh.position.y);
        cubie.mesh.position.z = Math.round(cubie.mesh.position.z);

        const euler = cubie.mesh.rotation;
        euler.x = Math.round(euler.x / (Math.PI / 2)) * (Math.PI / 2);
        euler.y = Math.round(euler.y / (Math.PI / 2)) * (Math.PI / 2);
        euler.z = Math.round(euler.z / (Math.PI / 2)) * (Math.PI / 2);

        this.scene.attach(cubie.mesh);
      });

      this.pivot.rotation.set(0, 0, 0);
      this.currentState = applyMoveToState(this.currentState, { face, dir });
    }
  }

  // Execute multiple moves from string (with animation)
  async executeMoves(movesStr: string): Promise<void> {
    const { parseMoves } = await import('./utils');
    const moves = parseMoves(movesStr);
    for (const move of moves) {
      await this.rotateFace(move.face, move.dir, 150);
    }
  }

  // Render one frame
  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  // Reset camera to initial position
  resetCamera(): void {
    this.camera.position.copy(this.initialCameraPosition);
    this.camera.lookAt(this.initialCameraTarget);
  }

  // Set highlights on specific stickers
  setHighlights(highlights: HighlightConfig[]): void {
    // Remove existing highlight edges from cubies
    this.highlightEdges.forEach(({ mesh, edge }) => {
      mesh.remove(edge);
      edge.geometry.dispose();
      (edge.material as THREE.Material).dispose();
    });
    this.highlightEdges = [];

    if (!highlights || highlights.length === 0) return;

    // Build a map of face -> positions to highlight
    const highlightMap = new Map<FaceName, Set<number>>();
    highlights.forEach(h => {
      if (!highlightMap.has(h.face)) {
        highlightMap.set(h.face, new Set());
      }
      h.positions.forEach(pos => highlightMap.get(h.face)!.add(pos));
    });

    // Face to axis and layer mapping
    const faceConfig: Record<string, { axis: 'x' | 'y' | 'z', layer: number, faceIndex: number }> = {
      'R': { axis: 'x', layer: 1, faceIndex: 0 },
      'L': { axis: 'x', layer: -1, faceIndex: 1 },
      'U': { axis: 'y', layer: 1, faceIndex: 2 },
      'D': { axis: 'y', layer: -1, faceIndex: 3 },
      'F': { axis: 'z', layer: 1, faceIndex: 4 },
      'B': { axis: 'z', layer: -1, faceIndex: 5 },
    };

    // For each cubie, check if any of its faces should be highlighted
    this.cubies.forEach(cubie => {
      const pos = cubie.mesh.position;
      const roundedPos = new THREE.Vector3(
        Math.round(pos.x),
        Math.round(pos.y),
        Math.round(pos.z)
      );

      // Check each face of this cubie
      Object.entries(faceConfig).forEach(([faceName, config]) => {
        const isOnFace = roundedPos[config.axis] === config.layer;
        if (!isOnFace) return;

        const positions = highlightMap.get(faceName as FaceName);
        if (!positions) return;

        // Calculate which position on the face this cubie is
        let row: number, col: number;
        if (config.axis === 'x') {
          // R or L face: y is row (inverted for L), z is col
          row = config.layer === 1 ? (1 - roundedPos.y) : (roundedPos.y + 1);
          col = config.layer === 1 ? (roundedPos.z + 1) : (1 - roundedPos.z);
        } else if (config.axis === 'y') {
          // U or D face: z is row, x is col
          row = config.layer === 1 ? (1 - roundedPos.z) : (roundedPos.z + 1);
          col = roundedPos.x + 1;
        } else {
          // F or B face: y is row (inverted), x is col
          row = 1 - roundedPos.y;
          col = config.layer === 1 ? (roundedPos.x + 1) : (1 - roundedPos.x);
        }

        const stickerIndex = row * 3 + col;
        if (!positions.has(stickerIndex)) return;

        // Add highlight edge to this face
        this.addHighlightToCubieFace(cubie.mesh, config.faceIndex);
      });
    });
  }

  private addHighlightToCubieFace(mesh: THREE.Mesh, faceIndex: number): void {
    const geometry = mesh.geometry as THREE.BoxGeometry;
    
    // Get the face normal and position offset
    const faceNormals = [
      new THREE.Vector3(1, 0, 0),   // R
      new THREE.Vector3(-1, 0, 0),  // L
      new THREE.Vector3(0, 1, 0),   // U
      new THREE.Vector3(0, -1, 0),  // D
      new THREE.Vector3(0, 0, 1),   // F
      new THREE.Vector3(0, 0, -1),  // B
    ];

    const normal = faceNormals[faceIndex];
    const size = (CUBIE_SIZE - GAP) / 2 + 0.001;
    
    // Create a small square edge geometry on the face
    const edgeGeometry = new THREE.BufferGeometry();
    const offset = normal.clone().multiplyScalar(size);
    
    // Create a square on the face
    const halfSize = (CUBIE_SIZE - GAP) / 2 * 0.85;
    let v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3, v4: THREE.Vector3;
    
    if (Math.abs(normal.x) > 0.5) {
      // X-facing (R or L)
      v1 = new THREE.Vector3(0, -halfSize, -halfSize);
      v2 = new THREE.Vector3(0, halfSize, -halfSize);
      v3 = new THREE.Vector3(0, halfSize, halfSize);
      v4 = new THREE.Vector3(0, -halfSize, halfSize);
    } else if (Math.abs(normal.y) > 0.5) {
      // Y-facing (U or D)
      v1 = new THREE.Vector3(-halfSize, 0, -halfSize);
      v2 = new THREE.Vector3(halfSize, 0, -halfSize);
      v3 = new THREE.Vector3(halfSize, 0, halfSize);
      v4 = new THREE.Vector3(-halfSize, 0, halfSize);
    } else {
      // Z-facing (F or B)
      v1 = new THREE.Vector3(-halfSize, -halfSize, 0);
      v2 = new THREE.Vector3(halfSize, -halfSize, 0);
      v3 = new THREE.Vector3(halfSize, halfSize, 0);
      v4 = new THREE.Vector3(-halfSize, halfSize, 0);
    }

    const vertices = new Float32Array([
      v1.x + offset.x, v1.y + offset.y, v1.z + offset.z,
      v2.x + offset.x, v2.y + offset.y, v2.z + offset.z,
      v2.x + offset.x, v2.y + offset.y, v2.z + offset.z,
      v3.x + offset.x, v3.y + offset.y, v3.z + offset.z,
      v3.x + offset.x, v3.y + offset.y, v3.z + offset.z,
      v4.x + offset.x, v4.y + offset.y, v4.z + offset.z,
      v4.x + offset.x, v4.y + offset.y, v4.z + offset.z,
      v1.x + offset.x, v1.y + offset.y, v1.z + offset.z,
    ]);

    edgeGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    
    const material = new THREE.LineBasicMaterial({
      color: 0x00ffff,
      linewidth: 2,
    });

    const lineSegments = new THREE.LineSegments(edgeGeometry, material);
    
    // Add as child of mesh so it rotates with the cubie
    mesh.add(lineSegments);
    this.highlightEdges.push({ mesh, edge: lineSegments });
  }

  // Dispose
  dispose(): void {
    this.cubies.forEach(cubie => {
      cubie.mesh.geometry.dispose();
      (cubie.mesh.material as THREE.Material[]).forEach(m => m.dispose());
    });
    this.highlightEdges.forEach(({ mesh, edge }) => {
      mesh.remove(edge);
      edge.geometry.dispose();
      (edge.material as THREE.Material).dispose();
    });
    this.highlightEdges = [];
    this.renderer.dispose();
  }
}
