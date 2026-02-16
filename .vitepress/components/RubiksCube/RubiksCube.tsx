import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RubiksCubeScene } from './Cube';
import { FaceName, Move } from './types';
import { parseMoves, solvedState } from './utils';

const MOVE_BUTTONS: { face: FaceName; label: string }[] = [
  { face: 'U', label: 'U' },
  { face: 'D', label: 'D' },
  { face: 'L', label: 'L' },
  { face: 'R', label: 'R' },
  { face: 'F', label: 'F' },
  { face: 'B', label: 'B' },
];

export interface RubiksCubeRef {
  executeMoves: (moves: string) => Promise<void>;
  reset: () => void;
  scramble: () => Promise<void>;
}

interface RubiksCubeProps {
  defaultValue?: string;
  value?: string;
  onChange?: (state: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

const RubiksCube = forwardRef<RubiksCubeRef, RubiksCubeProps>(
  ({ defaultValue, value, onChange, className, style }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<RubiksCubeScene | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const [isAnimating, setIsAnimating] = useState(false);
    const [moveHistory, setMoveHistory] = useState<string[]>([]);
    const isInitializedRef = useRef(false);

    // Initialize scene
    useEffect(() => {
      if (!containerRef.current) return;

      const scene = new RubiksCubeScene(containerRef.current);
      sceneRef.current = scene;

      // OrbitControls for camera rotation
      const controls = new OrbitControls(scene.camera, scene.renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.enablePan = false;
      controls.minDistance = 4;
      controls.maxDistance = 15;
      controlsRef.current = controls;

      // Animation loop
      const animate = () => {
        controls.update();
        scene.render();
        requestAnimationFrame(animate);
      };
      animate();

      // Execute defaultValue moves on init (instant, no animation)
      if (defaultValue && !isInitializedRef.current) {
        isInitializedRef.current = true;
        scene.executeMovesInstant(defaultValue);
        setMoveHistory(defaultValue.split(/\s+/).filter(Boolean));
        onChange?.(scene.getState());
      }

      return () => {
        controls.dispose();
        scene.dispose();
      };
    }, []);

    // Execute a single move
    const executeMove = useCallback(async (face: FaceName, dir: 1 | -1 = 1) => {
      if (!sceneRef.current || isAnimating) return;

      setIsAnimating(true);
      const moveStr = dir === 1 ? face : `${face}'`;
      setMoveHistory(prev => [...prev, moveStr]);

      await sceneRef.current.rotateFace(face, dir);

      setIsAnimating(false);
      onChange?.(sceneRef.current.getState());
    }, [isAnimating, onChange]);

    // Execute multiple moves from string
    const executeMoves = useCallback(async (movesStr: string) => {
      if (!sceneRef.current) return;

      const moves = parseMoves(movesStr);
      for (const move of moves) {
        await executeMove(move.face, move.dir);
      }
    }, [executeMove]);

    // Scramble
    const scramble = useCallback(async () => {
      const faces: FaceName[] = ['U', 'D', 'L', 'R', 'F', 'B'];
      const moves: Move[] = [];
      let lastFace: FaceName | null = null;

      for (let i = 0; i < 20; i++) {
        let face: FaceName;
        do {
          face = faces[Math.floor(Math.random() * faces.length)];
        } while (face === lastFace);

        lastFace = face;
        const dir = Math.random() > 0.5 ? 1 : -1 as 1 | -1;
        moves.push({ face, dir });
      }

      for (const move of moves) {
        await executeMove(move.face, move.dir);
      }
    }, [executeMove]);

    // Reset
    const reset = useCallback(() => {
      sceneRef.current?.reset();
      setMoveHistory([]);
      onChange?.(solvedState());
    }, [onChange]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      executeMoves,
      reset,
      scramble,
    }), [executeMoves, reset, scramble]);

    return (
      <div className={className} style={{ ...style }}>
        <div
          ref={containerRef}
          style={{
            width: '100%',
            height: '400px',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        />

        {/* Controls */}
        <div style={{
          marginTop: '16px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          justifyContent: 'center',
        }}>
          {/* Face rotation buttons */}
          {MOVE_BUTTONS.map(({ face }) => (
            <React.Fragment key={face}>
              <button
                onClick={() => executeMove(face, 1)}
                disabled={isAnimating}
                className="vp-button"
              >
                {face}
              </button>
              <button
                onClick={() => executeMove(face, -1)}
                disabled={isAnimating}
                className="vp-button"
              >
                {face}'
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Action buttons */}
        <div style={{
          marginTop: '12px',
          display: 'flex',
          gap: '12px',
          justifyContent: 'center',
        }}>
          <button
            onClick={scramble}
            disabled={isAnimating}
            style={{
              padding: '8px 20px',
              fontSize: '14px',
              background: '#4a9eff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isAnimating ? 'not-allowed' : 'pointer',
            }}
          >
            打乱
          </button>
          <button
            onClick={reset}
            disabled={isAnimating}
            style={{
              padding: '8px 20px',
              fontSize: '14px',
              background: '#ff6b6b',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isAnimating ? 'not-allowed' : 'pointer',
            }}
          >
            重置
          </button>
        </div>

        {/* Move history */}
        {moveHistory.length > 0 && (
          <div style={{
            marginTop: '12px',
            fontSize: '12px',
            color: '#666',
            textAlign: 'center',
          }}>
            操作记录: {moveHistory.join(' ')}
          </div>
        )}
      </div>
    );
  }
);

RubiksCube.displayName = 'RubiksCube';

export default RubiksCube;
