'use client';

import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * A second scene, laid over the cookie's, that holds nothing but the paper.
 *
 * Two reasons it is not simply part of the first. The cookie's light is
 * frozen and tuned for baked crust, which leaves white paper looking grey;
 * the paper wants a light of its own. And the page blurs the cookie once the
 * fortune is open — that is a CSS filter on the cookie's canvas, and the
 * paper has to be drawn somewhere that filter cannot reach.
 *
 * The camera looks straight down the axis at a fixed distance, so the paper,
 * which faces it and sizes itself in screen pixels, always lands where its
 * DOM hand-hold is. Kept mounted the whole time rather than created on the
 * crack: making a WebGL context is a visible hitch, and the empty scene costs
 * next to nothing to keep alive.
 *
 * No tone mapping. There is no dynamic range to compress here — it is paper
 * under a lamp — and the untouched curve is what keeps white white.
 */
export const PAPER_CAMERA_DISTANCE = 6;
export const PAPER_FOV = 30;

export function PaperStage({ children }: { children: React.ReactNode }) {
  return (
    <div className="stage__paper" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, PAPER_CAMERA_DISTANCE], fov: PAPER_FOV }}
        gl={{ alpha: true, antialias: true, toneMapping: THREE.NoToneMapping }}
        style={{ pointerEvents: 'none' }}
      >
        {/* White sky, pale floor: the room the sheet is read in. Three's
            physically-based lighting divides ambient terms by pi, so an
            ambient intensity has to be about three times what it reads as —
            this is "roughly 0.9". Measured against the paper: the lit side
            of the open sheet lands in the mid 240s, the shaded inside of the
            coil around 200. */}
        <hemisphereLight args={['#ffffff', '#e4e4e2', 2.7]} />
        {/* Lamp, high and to the left, the same side the cookie is lit from.
            Neutral, so white paper stays white — the warmth is the cookie's. */}
        <directionalLight position={[-2.2, 3.2, 4]} intensity={1.5} />
        {/* A whisper from the right, so the shaded side of the coil is not black. */}
        <directionalLight position={[3, -0.5, 2.5]} intensity={0.45} />
        {children}
      </Canvas>
    </div>
  );
}
