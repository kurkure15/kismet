'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  OrbitControls,
  useGLTF,
} from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { useDrag } from '@use-gesture/react';
import * as THREE from 'three';
import { Shards, type ShardDef } from '@/components/Shards';
import { playCrack, preloadCrackSounds } from '@/lib/crackSound';
import { playPaperIn, preloadPaperSounds } from '@/lib/paperSound';
import { FortunePaper } from '@/components/FortunePaper';
import { useKismet } from '@/lib/appState';
import { nextFortune } from '@/lib/fortunes';
import { CRACK, HAPTIC_MS, PAPER_DELAY_MS, TAP, TENSION, WOBBLE } from '@/lib/tuning';

/** Live drag state, shared from the DOM gesture layer into the R3F frame loop. */
type DragState = {
  active: boolean;
  x: number;
  y: number;
  /** performance.now() of the last tap that should trigger a wobble, or null. */
  wobbleAt: number | null;
};

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

/**
 * Applies the live drag tension to the intact cookie: a lean in the direction
 * being pulled, plus a slight squash, plus the wobble tease on a bare tap.
 * Everything is written straight to the group's transform each frame — nothing
 * here touches materials or lighting.
 */
function CookieTension({
  drag,
  reducedMotion,
  children,
}: {
  drag: React.RefObject<DragState>;
  reducedMotion: boolean;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((state) => state.camera);
  const tension = useRef(0);
  const axis = useRef(new THREE.Vector3(1, 0, 0));

  const scratch = useMemo(
    () => ({
      right: new THREE.Vector3(),
      forward: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      lean: new THREE.Quaternion(),
      wobble: new THREE.Quaternion(),
    }),
    [],
  );

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;

    if (reducedMotion) {
      node.quaternion.identity();
      node.scale.setScalar(1);
      return;
    }

    const state = drag.current;
    const threshold =
      TENSION.thresholdFraction *
      Math.min(window.innerWidth, window.innerHeight);
    const distance = Math.hypot(state.x, state.y);
    const target = state.active
      ? Math.min(distance / Math.max(threshold, 1), 1)
      : 0;

    // Exponential follow: stiff while dragging, and an ease-out on release.
    const k = 1 - Math.exp(-TENSION.followPerSecond * delta);
    tension.current += (target - tension.current) * k;

    // Lean about the horizontal axis perpendicular to the drag, so the cookie
    // tips the way it is pulled rather than spinning in place.
    if (state.active && distance > 0.5) {
      scratch.right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0);
      camera.getWorldDirection(scratch.forward).setY(0);
      if (scratch.right.lengthSq() > 1e-6) scratch.right.normalize();
      if (scratch.forward.lengthSq() > 1e-6) scratch.forward.normalize();
      scratch.direction
        .copy(scratch.right)
        .multiplyScalar(state.x)
        .addScaledVector(scratch.forward, -state.y);
      if (scratch.direction.lengthSq() > 1e-6) {
        scratch.direction.normalize();
        axis.current.crossVectors(scratch.up, scratch.direction).normalize();
      }
    }

    scratch.lean.setFromAxisAngle(
      axis.current,
      tension.current * TENSION.maxTilt,
    );

    // Wobble tease: a damped nod that decays to nothing.
    let wobbleAngle = 0;
    if (state.wobbleAt !== null) {
      const t = (performance.now() - state.wobbleAt) / 1000;
      // Left to lapse rather than cleared: the timestamp is owned by the
      // gesture layer, and the next tap simply overwrites it.
      if (t <= WOBBLE.durationMs / 1000) {
        wobbleAngle =
          WOBBLE.amplitude *
          Math.exp(-t / WOBBLE.decay) *
          Math.sin(2 * Math.PI * WOBBLE.frequencyHz * t);
      }
    }
    scratch.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    scratch.wobble.setFromAxisAngle(scratch.right, wobbleAngle);

    node.quaternion.copy(scratch.lean).multiply(scratch.wobble);
    node.scale.setScalar(1 - (1 - TENSION.maxSquash) * tension.current);
  });

  return <group ref={group}>{children}</group>;
}

/**
 * Owns everything that needs the loaded GLB: the intact cookie, the camera
 * framing solve, and the shard definitions handed to physics once it cracks.
 */
/**
 * The fracture faces use the GLB's second material, Cookie_Interior, which
 * never rendered before the cookie could break. Left alone it reads cold and
 * chalky beside the crust — measured over the pixels actually visible in the
 * settled pile, #e9cfa0 lands at [197,181,150], only 24% saturated against the
 * crust's 51%, which is the sage-grey cast.
 *
 * The intent was to tame its environment response the way the wafer's was, but
 * that is not available per material: `envMapIntensity` provably does nothing
 * to light arriving from `scene.environment` in three r185 — sweeping it from
 * 1.0 to 0.0 on this material changed not a single pixel, the same result the
 * wafer gave in phase 1. The wafer is tamed globally on <Environment
 * environmentIntensity>, and that control is shared with the approved crust,
 * so it cannot be moved. The warmth is therefore carried by the albedo alone,
 * tuned against the crust until the pair sit together: #f5c273 renders to
 * [204,175,117] at 43% saturation, warmer than the chalk but still lighter and
 * less saturated than the crust, so it reads as the pale inside of the same
 * biscuit rather than a different material.
 *
 * Flat shading is left exactly as exported — the fracture faces are meant to
 * read as flat broken planes.
 */
const INTERIOR = {
  color: '#f5c273',
  roughness: 0.9,
} as const;

function useInteriorMaterial(source: THREE.Material | null) {
  return useMemo(() => {
    if (!source) return null;
    const m = source.clone() as THREE.MeshStandardMaterial;
    m.color.set(INTERIOR.color);
    m.roughness = INTERIOR.roughness;
    return m;
  }, [source]);
}

function CookieStage({
  drag,
  reducedMotion,
  cracked,
  armed,
  settled,
  onPointerDownCookie,
  onSettled,
}: {
  drag: React.RefObject<DragState>;
  reducedMotion: boolean;
  cracked: boolean;
  armed: boolean;
  settled: boolean;
  onPointerDownCookie: () => void;
  onSettled: () => void;
}) {
  const { scene } = useGLTF(MODEL_URL);

  // Reading geometry and material off the intact mesh renders it alone while
  // leaving the loaded scene graph untouched in the drei cache.
  const intact = useMemo(
    () => scene.getObjectByName('Cookie_Intact') as THREE.Mesh,
    [scene],
  );
  const material = useWaferMaterial(intact.material as THREE.Material);

  // The 14 shards reassemble into the intact cookie, so their GLB rest
  // transforms are exactly where the pieces should start. Each shard is a Group
  // of two primitives: the outer wafer (which shares the intact cookie's
  // material, so it gets the same tuning) and the inner fracture face.
  // The shards' inner faces carry the GLB's Cookie_Interior material.
  const interiorSource = useMemo(() => {
    let found: THREE.Material | null = null;
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (found || !mesh.isMesh) return;
      const own = mesh.material as THREE.Material;
      if (own && own.name === 'Cookie_Interior') found = own;
    });
    return found;
  }, [scene]);
  const interior = useInteriorMaterial(interiorSource);

  const shards = useMemo<ShardDef[]>(() => {
    const source = intact.material as THREE.Material;
    const out: ShardDef[] = [];
    for (const node of scene.children) {
      if (!node.name.startsWith('Cookie_Shard_')) continue;
      const parts: ShardDef['parts'] = [];
      node.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const own = mesh.material as THREE.Material;
        const swapped =
          own === source ? material : own === interiorSource && interior ? interior : own;
        parts.push({ geometry: mesh.geometry, material: swapped });
      });
      if (parts.length === 0) continue;
      out.push({
        name: node.name,
        position: [
          node.position.x,
          node.position.y - COOKIE_CENTRE_Y,
          node.position.z,
        ],
        parts,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [scene, intact, material, interiorSource, interior]);

  return (
    <>
      <CameraFraming geometry={intact.geometry} />

      {!cracked && (
        <CookieTension drag={drag} reducedMotion={reducedMotion}>
          <group position={[0, -COOKIE_CENTRE_Y, 0]}>
            <mesh
              geometry={intact.geometry}
              material={material}
              onPointerDown={onPointerDownCookie}
            />
          </group>
        </CookieTension>
      )}

      {/* Mounted at the first pointer-down so Rapier's WASM is compiled and the
          world is live before the crack frame, then unpaused at the break and
          paused again once the pile stops moving. Its own Suspense boundary
          keeps that load from unmounting the cookie. */}
      {armed && (
        <Suspense fallback={null}>
          <Physics paused={!cracked || settled} gravity={CRACK.gravity}>
            {cracked && (
              <Shards shards={shards} floorY={SHADOW_Y} onSettled={onSettled} />
            )}
          </Physics>
        </Suspense>
      )}
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
 * Reports where the settled pile sits on screen, so the paper can rise out of
 * it rather than appear at the middle of nowhere. Measured from a point just
 * above the shadow plane — the camera looks at the cookie's centre, so the
 * origin itself is dead centre and would give no rise at all.
 */
const PILE_ANCHOR = new THREE.Vector3(0, SHADOW_Y + 0.18, 0);

function PileAnchor({
  onMeasure,
}: {
  onMeasure: (offset: { x: number; y: number }) => void;
}) {
  const camera = useThree((state) => state.camera);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);

  useEffect(() => {
    if (!width || !height) return;
    const ndc = PILE_ANCHOR.clone().project(camera);
    onMeasure({ x: (ndc.x * width) / 2, y: (-ndc.y * height) / 2 });
  }, [camera, width, height, onMeasure]);

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

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return reduced;
}

export default function Scene() {
  // Safe to read directly: this component only ever mounts on the client.
  const [debug] = useState(() =>
    new URLSearchParams(window.location.search).has('debug'),
  );
  const [ready, setReady] = useState(false);
  const [armed, setArmed] = useState(false);
  const [settled, setSettled] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const kismet = useKismet();
  const [fortune, setFortune] = useState('');
  const [riseFrom, setRiseFrom] = useState({ x: 0, y: 0 });

  const drag = useRef<DragState>({ active: false, x: 0, y: 0, wobbleAt: null });
  const onCookie = useRef(false);
  const dragging = useRef(false);
  const hasCracked = useRef(false);
  const taps = useRef(0);
  const lastTapAt = useRef(0);

  const crack = useCallback(() => {
    if (hasCracked.current) return;
    hasCracked.current = true;

    // Sound and haptics fire here, synchronously in the gesture handler, so
    // they land on the same frame as the shard swap React is about to commit.
    playCrack();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(HAPTIC_MS);
    }

    drag.current.active = false;
    drag.current.x = 0;
    drag.current.y = 0;
    drag.current.wobbleAt = null;
    kismet.send('crack');
  }, [kismet]);

  const handleTap = useCallback(() => {
    if (reducedMotion) {
      crack();
      return;
    }
    const now = performance.now();
    if (now - lastTapAt.current > TAP.resetMs) taps.current = 0;
    taps.current += 1;
    lastTapAt.current = now;

    if (taps.current >= TAP.countToCrack) {
      crack();
      return;
    }
    drag.current.wobbleAt = now;
  }, [crack, reducedMotion]);

  // Let the break land before the paper answers it, so the two read as one
  // chain of cause and effect rather than two separate events.
  useEffect(() => {
    if (kismet.state !== 'cracked') return;
    const timer = window.setTimeout(() => {
      setFortune(nextFortune());
      playPaperIn();
      kismet.send('reveal');
    }, PAPER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [kismet]);

  const endGesture = useCallback(() => {
    drag.current.active = false;
    drag.current.x = 0;
    drag.current.y = 0;
    dragging.current = false;
    onCookie.current = false;
  }, []);

  const bind = useDrag(
    ({ first, last, tap, movement: [mx, my] }) => {
      if (hasCracked.current || kismet.pileLocked) return;

      if (first) dragging.current = onCookie.current;

      // A filtered tap arrives as a single call with neither `first` nor
      // `last` set, so it cannot be handled inside the drag lifecycle.
      const engaged = dragging.current || (tap && onCookie.current);
      if (!engaged) return;

      // First contact with the cookie: unlock audio (the only moment iOS
      // allows it) and warm the physics WASM before the crack frame.
      preloadCrackSounds();
      preloadPaperSounds();
      setArmed(true);

      if (tap) {
        endGesture();
        handleTap();
        return;
      }

      if (last) {
        endGesture();
        return;
      }

      const distance = Math.hypot(mx, my);
      const threshold =
        TENSION.thresholdFraction *
        Math.min(window.innerWidth, window.innerHeight);

      if (reducedMotion) {
        // No tension theatre — a deliberate drag simply breaks it.
        if (distance > 8) crack();
        return;
      }

      drag.current.active = true;
      drag.current.x = mx;
      drag.current.y = my;
      if (distance >= threshold) crack();
    },
    { filterTaps: true },
  );

  return (
    <div
      className={ready ? 'stage__canvas is-ready' : 'stage__canvas'}
      {...bind()}
    >
      <Canvas
        camera={{ position: CAMERA_POSITION, fov: FOV }}
        gl={{ toneMappingExposure: 0.7 }}
      >
        <Suspense fallback={null}>
          <Environment files={HDRI_URL} environmentIntensity={0.4} />
          <CookieStage
            drag={drag}
            reducedMotion={reducedMotion}
            cracked={kismet.isBroken}
            armed={armed}
            settled={settled}
            onPointerDownCookie={() => {
              onCookie.current = true;
            }}
            onSettled={() => setSettled(true)}
          />
          <PileAnchor onMeasure={setRiseFrom} />
          <RevealOnFirstFrame onReady={() => setReady(true)} />
        </Suspense>

        {/* Soft warm key, cross-lighting the 3/4 camera from the upper left. */}
        <directionalLight
          position={[-2.6, 3.8, 2.4]}
          intensity={2.6}
          color="#ffc078"
        />

        {/* Redrawn every frame while the pieces are in the air; once the pile
            settles it is remounted to bake a single static shadow. */}
        <ContactShadows
          key={settled ? 'settled' : 'live'}
          frames={settled ? 1 : Infinity}
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

      {kismet.state === 'reading' && (
        <FortunePaper
          fortune={fortune}
          riseFrom={riseFrom}
          reducedMotion={reducedMotion}
          onDismiss={() => kismet.send('dismiss')}
        />
      )}
    </div>
  );
}

useGLTF.preload(MODEL_URL);
