'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  OrbitControls,
  useGLTF,
} from '@react-three/drei';
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

/**
 * The GLB's exported material needs tuning to read as baked wafer rather than
 * pale wax. Its base colour and normal maps are good; the third texture wired
 * into both the occlusion and metallic-roughness slots is not an ORM map at
 * all — it looks like a curvature bake. Measured over the image: the roughness
 * (green) channel is effectively constant at 0.51-0.55, so it carries no
 * detail, and the occlusion (red) channel averages 0.29 with large black
 * regions, which crushes ambient light into flat grey where it applies.
 *
 * So: drive roughness directly and keep the false occlusion as a light touch of
 * crevice shading only. Note that `envMapIntensity` is deliberately not set —
 * measured against the running renderer it has no effect on light coming from
 * `scene.environment`, so the studio HDR is scaled on <Environment> instead.
 *
 * The GLB itself is never touched — this clones the loaded material, which also
 * leaves the shards' shared material untouched for later phases.
 */
function useWaferMaterial(source: THREE.Material) {
  return useMemo(() => {
    const m = source.clone() as THREE.MeshPhysicalMaterial;
    m.roughnessMap = null;
    m.roughness = 0.78;
    m.aoMapIntensity = 0.3;
    return m;
  }, [source]);
}

function Cookie() {
  const { scene } = useGLTF(MODEL_URL);

  // The GLB also carries Cookie_Shard_01..14. Reading geometry and material off
  // the intact mesh renders it alone while leaving the loaded scene graph
  // untouched in the drei cache for later phases.
  const intact = useMemo(
    () => scene.getObjectByName('Cookie_Intact') as THREE.Mesh,
    [scene],
  );
  const material = useWaferMaterial(intact.material as THREE.Material);

  return (
    <group position={[0, -COOKIE_CENTRE_Y, 0]}>
      <mesh geometry={intact.geometry} material={material} />
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

/**
 * Sits inside <Suspense>, so it mounts only once the model and environment have
 * loaded, and then waits for one actual rendered frame before reporting ready —
 * fading in on mount alone would reveal a blank canvas a frame early.
 */
function RevealOnFirstFrame({ onReady }: { onReady: () => void }) {
  const fired = useRef(false);
  useFrame(() => {
    if (fired.current) return;
    fired.current = true;
    onReady();
  });
  return null;
}

export default function Scene() {
  // Safe to read directly: this component only ever mounts on the client.
  const [debug] = useState(() =>
    new URLSearchParams(window.location.search).has('debug'),
  );
  const [ready, setReady] = useState(false);

  return (
    <div className={ready ? 'stage__canvas is-ready' : 'stage__canvas'}>
      <Canvas
        camera={{ position: CAMERA_POSITION, fov: FOV }}
        gl={{ toneMappingExposure: 0.7 }}
      >
        <Suspense fallback={null}>
          <Environment preset="studio" environmentIntensity={0.4} />
          <Cookie />
          <RevealOnFirstFrame onReady={() => setReady(true)} />
        </Suspense>

        {/* Soft warm key, cross-lighting the 3/4 camera from the upper left. */}
        <directionalLight
          position={[-2.6, 3.8, 2.4]}
          intensity={2.6}
          color="#ffc078"
        />

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
    </div>
  );
}

useGLTF.preload(MODEL_URL);
