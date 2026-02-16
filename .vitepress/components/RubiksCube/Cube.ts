import * as THREE from 'three';
import { Color, COLOR_HEX, CubeState, CubieData, FACE_COLORS, FaceName } from './types';
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
    const layerIndex = face === 'U' ? 1 : face === 'D' ? -1 :
      face === 'R' ? 1 : face === 'L' ? -1 :
        face === 'F' ? 1 : -1;

    return this.cubies.filter(cubie => {
      const pos = cubie.mesh.position;
      const roundedPos = new THREE.Vector3(
        Math.round(pos.x),
        Math.round(pos.y),
        Math.round(pos.z)
      );

      switch (face) {
        case 'U': return roundedPos.y === layerIndex;
        case 'D': return roundedPos.y === layerIndex;
        case 'R': return roundedPos.x === layerIndex;
        case 'L': return roundedPos.x === layerIndex;
        case 'F': return roundedPos.z === layerIndex;
        case 'B': return roundedPos.z === layerIndex;
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

  // Dispose
  dispose(): void {
    this.cubies.forEach(cubie => {
      cubie.mesh.geometry.dispose();
      (cubie.mesh.material as THREE.Material[]).forEach(m => m.dispose());
    });
    this.renderer.dispose();
  }
}
