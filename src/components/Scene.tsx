'use client';

import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type * as THREE from 'three';

const MODEL_URL = '/models/cookie-fractured.glb';

/**
 * Cookie_Intact measures 1.654 x 1.238 x 1.594 with its base on y=0, so its
 * centre sits at y=0.619. Lifting the group by -0.619 puts that centre on the
 * world origin, which is where R3F aims the default camera.
 */
const COOKIE_HEIGHT = 1.2381;
const COOKIE_CENTRE_Y = 0.619;

function Cookie() {
  const { scene } = useGLTF(MODEL_URL);

  // The GLB also carries Cookie_Shard_01..14. Reading geometry and material off
  // the intact mesh renders it alone while leaving the loaded scene graph
  // untouched in the drei cache for later phases.
  const intact = useMemo(
    () => scene.getObjectByName('Cookie_Intact') as THREE.Mesh,
    [scene],
  );

  return (
    <group position={[0, -COOKIE_CENTRE_Y, 0]}>
      <mesh geometry={intact.geometry} material={intact.material} />
    </group>
  );
}

/**
 * Distance at which the cookie fills ~40% of viewport height, for a 30deg
 * vertical FOV: (height / 0.4) / (2 * tan(fov/2)).
 */
const FOV = 30;
const CAMERA_DISTANCE =
  COOKIE_HEIGHT / 0.4 / (2 * Math.tan((FOV / 2) * (Math.PI / 180)));

// Gentle 3/4 view: 28deg around, 18deg up.
const AZIMUTH = (28 * Math.PI) / 180;
const ELEVATION = (18 * Math.PI) / 180;
const CAMERA_POSITION: [number, number, number] = [
  CAMERA_DISTANCE * Math.cos(ELEVATION) * Math.sin(AZIMUTH),
  CAMERA_DISTANCE * Math.sin(ELEVATION),
  CAMERA_DISTANCE * Math.cos(ELEVATION) * Math.cos(AZIMUTH),
];

export default function Scene() {
  return (
    <Canvas camera={{ position: CAMERA_POSITION, fov: FOV }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 2]} intensity={2.5} />
      <Suspense fallback={null}>
        <Cookie />
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload(MODEL_URL);
