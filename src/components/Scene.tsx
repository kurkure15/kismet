'use client';

import { Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  OrbitControls,
  useGLTF,
} from '@react-three/drei';
import * as THREE from 'three';

const MODEL_URL = '/models/cookie-fractured.glb';

/**
 * The exact file <Environment preset="studio"> pulls from raw.githack.com,
 * vendored so the approved lighting no longer depends on a third-party CDN.
 */
const HDRI_URL = '/hdri/studio_small_03_1k.hdr';

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
    <>
      <CameraFraming geometry={intact.geometry} />
      <group position={[0, -COOKIE_CENTRE_Y, 0]}>
        <mesh geometry={intact.geometry} material={material} />
      </group>
    </>
  );
}

const FOV = 30;

// Gentle 3/4 view: 28deg around, 18deg up.
const AZIMUTH = (28 * Math.PI) / 180;
const ELEVATION = (18 * Math.PI) / 180;
const VIEW_DIR = new THREE.Vector3(
  Math.cos(ELEVATION) * Math.sin(AZIMUTH),
  Math.sin(ELEVATION),
  Math.cos(ELEVATION) * Math.cos(AZIMUTH),
);

/**
 * The cookie is framed to min(40% of viewport height, 70% of viewport width).
 *
 * The height term is the approved phase 1 distance, kept as an exact literal so
 * every non-narrow screen renders bit-for-bit what was signed off — re-solving
 * it at runtime converges to more decimals and shifts the image sub-pixel. The
 * width term is solved from projected vertices below, and only ever pushes the
 * camera further back, so it cannot alter a screen where height already binds.
 */
const MAX_WIDTH_FRACTION = 0.7;

/** Distance at which the cookie fills exactly 40% of viewport height. */
const CAMERA_DISTANCE = 6.5816;
const CAMERA_POSITION: [number, number, number] = [
  VIEW_DIR.x * CAMERA_DISTANCE,
  VIEW_DIR.y * CAMERA_DISTANCE,
  VIEW_DIR.z * CAMERA_DISTANCE,
];

/**
 * Nearest distance at which the cookie's silhouette still fits inside
 * MAX_WIDTH_FRACTION of the viewport width, found by projecting every vertex
 * through a real PerspectiveCamera — the rounded shape sits well inside its
 * bounding box, so the box would overstate its on-screen size.
 */
function solveWidthDistance(
  geometry: THREE.BufferGeometry,
  aspect: number,
): number {
  const position = geometry.attributes.position;
  const probe = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 200);
  const v = new THREE.Vector3();

  const tooWide = (distance: number) => {
    probe.position.copy(VIEW_DIR).multiplyScalar(distance);
    probe.lookAt(0, 0, 0);
    probe.updateMatrixWorld();
    probe.updateProjectionMatrix();
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      v.y -= COOKIE_CENTRE_Y;
      v.project(probe);
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
    }
    return (maxX - minX) / 2 > MAX_WIDTH_FRACTION;
  };

  let tooClose = 1;
  let farEnough = 60;
  for (let i = 0; i < 40; i++) {
    const mid = (tooClose + farEnough) / 2;
    if (tooWide(mid)) tooClose = mid;
    else farEnough = mid;
  }
  return (tooClose + farEnough) / 2;
}

function CameraFraming({ geometry }: { geometry: THREE.BufferGeometry }) {
  const camera = useThree((state) => state.camera);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);

  useLayoutEffect(() => {
    if (!width || !height) return;
    const distance = Math.max(
      CAMERA_DISTANCE,
      solveWidthDistance(geometry, width / height),
    );
    camera.position.copy(VIEW_DIR).multiplyScalar(distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, geometry, width, height]);

  return null;
}

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
          <Environment files={HDRI_URL} environmentIntensity={0.4} />
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
