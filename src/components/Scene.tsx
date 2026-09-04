'use client';

import { Canvas } from '@react-three/fiber';

/**
 * Phase 0 placeholder: a primitive in a full-viewport canvas, purely to verify
 * the WebGL pipeline renders. Replaced by the cookie in phase 1.
 */
export default function Scene() {
  return (
    <Canvas camera={{ position: [0, 0, 4], fov: 35 }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 2]} intensity={2.5} />
      <mesh rotation={[0.4, 0.7, 0]}>
        <boxGeometry args={[1.2, 1.2, 1.2]} />
        <meshStandardMaterial color="#e0a96d" roughness={0.6} />
      </mesh>
    </Canvas>
  );
}
