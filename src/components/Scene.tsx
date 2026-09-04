'use client';

import { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls, useGLTF } from '@react-three/drei';
import type * as THREE from 'three';

const MODEL_URL = '/models/cookie-fractured.glb';

/**
 * Cookie_Intact measures 1.654 x 1.238 x 1.594 with its base on y=0, so its
 * centre sits at y=0.619. Lifting the group by -0.619 puts that centre on the
 * world origin, which is where R3F aims the default camera.
 */
const COOKIE_CENTRE_Y = 0.619;

/** The cookie's base, then a little lower again so it floats above its shadow. */
const BASE_Y = -COOKIE_CENTRE_Y;
const SHADOW_Y = BASE_Y - 0.035;

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

const FOV = 30;

/**
 * Distance at which the cookie's silhouette covers 40% of viewport height,
 * solved by projecting the mesh's 3300 vertices rather than its bounding box —
 * the rounded shape sits well inside its AABB, so the box overstates it.
 */
const CAMERA_DISTANCE = 6.5816;

// Gentle 3/4 view: 28deg around, 18deg up.
const AZIMUTH = (28 * Math.PI) / 180;
const ELEVATION = (18 * Math.PI) / 180;
const CAMERA_POSITION: [number, number, number] = [
  CAMERA_DISTANCE * Math.cos(ELEVATION) * Math.sin(AZIMUTH),
  CAMERA_DISTANCE * Math.sin(ELEVATION),
  CAMERA_DISTANCE * Math.cos(ELEVATION) * Math.cos(AZIMUTH),
];

export default function Scene() {
  // Safe to read directly: this component only ever mounts on the client.
  const [debug] = useState(() =>
    new URLSearchParams(window.location.search).has('debug'),
  );

  return (
    <Canvas camera={{ position: CAMERA_POSITION, fov: FOV }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 2]} intensity={2.5} />

      <Suspense fallback={null}>
        <Cookie />
      </Suspense>

      <ContactShadows
        position={[0, SHADOW_Y, 0]}
        scale={4.5}
        blur={2.8}
        opacity={0.45}
        far={1.8}
        resolution={1024}
        color="#6f4f31"
      />

      {debug && <OrbitControls makeDefault />}
    </Canvas>
  );
}

useGLTF.preload(MODEL_URL);
