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
import { preloadPaperSounds } from '@/lib/paperSound';
import { playCrunch, playPop, preloadCrunchSounds } from '@/lib/crunchSound';
import { Crumbs, type CrumbBurst } from '@/components/Crumbs';
import { StageChrome, type Plate } from '@/components/StageChrome';
import { FortunePaper, type PaperHandle } from '@/components/FortunePaper';
import { PaperRoll } from '@/components/PaperRoll';
import { PaperStage } from '@/components/PaperStage';
import { ComposeFortune } from '@/components/ComposeFortune';
import { useKismet } from '@/lib/appState';
import { addFortunes, nextFortune, type Fortune } from '@/lib/fortunes';
import {
  CRACK,
  EAT,
  SHADOW,
  HAPTIC_MS,
  PAPER_DELAY_MS,
  TAP,
  TENSION,
  WOBBLE,
} from '@/lib/tuning';

/** Live drag state, shared from the DOM gesture layer into the R3F frame loop. */
type DragState = {
  active: boolean;
  x: number;
  y: number;
  /** performance.now() of the last tap that should trigger a wobble, or null. */
  wobbleAt: number | null;
};

const MODEL_URL = '/models/cookie-fractured.glb';

/** How far out of focus the cookie goes behind a fully opened fortune. */
const SOFT_BLUR_PX = 7;
const SOFT_DIM = 0.02;

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

/**
 * Scales a freshly arrived cookie in. Deliberately inert on the very first
 * cookie: that render is the approved phase 1 image and must stay pixel-exact.
 */
function PopIn({
  generation,
  children,
}: {
  generation: number;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const startedAt = useRef(0);

  useEffect(() => {
    startedAt.current = generation > 0 ? performance.now() : 0;
    if (group.current && generation > 0) {
      group.current.scale.setScalar(EAT.popFrom);
    }
  }, [generation]);

  useFrame(() => {
    const node = group.current;
    if (!node || startedAt.current === 0) return;
    const t = Math.min(1, (performance.now() - startedAt.current) / EAT.popMs);
    // Ease-out with a touch of overshoot, so it arrives rather than inflates.
    const eased = 1 - Math.pow(1 - t, 3);
    const overshoot = Math.sin(t * Math.PI) * 0.035;
    node.scale.setScalar(EAT.popFrom + (1 - EAT.popFrom) * eased + overshoot);
    if (t >= 1) {
      node.scale.setScalar(1);
      startedAt.current = 0;
    }
  });

  return <group ref={group}>{children}</group>;
}

function CookieStage({
  drag,
  reducedMotion,
  cracked,
  armed,
  settled,
  edible,
  generation,
  onPointerDownCookie,
  onSettled,
  onBite,
  onEmptied,
}: {
  drag: React.RefObject<DragState>;
  reducedMotion: boolean;
  cracked: boolean;
  armed: boolean;
  settled: boolean;
  edible: boolean;
  generation: number;
  onPointerDownCookie: () => void;
  onSettled: () => void;
  onBite: (crumbAt: THREE.Vector3[]) => void;
  onEmptied: () => void;
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
          own === source
            ? material
            : own === interiorSource && interior
              ? interior
              : own;
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
          <PopIn generation={generation}>
            <group position={[0, -COOKIE_CENTRE_Y, 0]}>
              <mesh
                geometry={intact.geometry}
                material={material}
                onPointerDown={onPointerDownCookie}
              />
            </group>
          </PopIn>
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
              <Shards
                // Remounted per cookie, so no eaten state survives a respawn.
                key={generation}
                shards={shards}
                floorY={SHADOW_Y}
                eatable={edible}
                reducedMotion={reducedMotion}
                onSettled={onSettled}
                onBite={onBite}
                onEmptied={onEmptied}
              />
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
    const toScreen = (point: THREE.Vector3) => {
      const ndc = point.clone().project(camera);
      return { x: (ndc.x * width) / 2, y: (-ndc.y * height) / 2 };
    };
    onMeasure(toScreen(PILE_ANCHOR));
  }, [camera, width, height, onMeasure]);

  return null;
}

/**
 * Fades the contact shadow in and out by writing straight to its material.
 *
 * Deliberately not done by swapping the `opacity` prop: that re-renders the
 * whole scene every frame of the fade. And deliberately not done by remounting
 * ContactShadows — drei never disposes its render target, which is the leak
 * fixed in 4.4.
 */
function ShadowFade({
  target,
  visible,
}: {
  target: React.RefObject<THREE.Group | null>;
  visible: boolean;
}) {
  const level = useRef(1);

  useFrame((_, delta) => {
    const node = target.current;
    if (!node) return;
    const want = visible ? 1 : 0;
    if (level.current !== want) {
      const step = (delta * 1000) / SHADOW.fadeMs;
      level.current =
        want > level.current
          ? Math.min(want, level.current + step)
          : Math.max(want, level.current - step);
    }
    // Ease-out, so it leaves quickly and lands softly.
    const eased = 1 - Math.pow(1 - level.current, 3);
    node.traverse((child) => {
      const material = (child as THREE.Mesh).material as
        THREE.Material | undefined;
      if (material && 'opacity' in material) {
        (material as THREE.MeshBasicMaterial).opacity = SHADOW.opacity * eased;
      }
    });
  });

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
  const [fortune, setFortune] = useState<Fortune>({ text: '' });
  const [riseFrom, setRiseFrom] = useState({ x: 0, y: 0 });
  /** Bumped per cookie, so per-cookie components remount clean. */
  const [generation, setGeneration] = useState(0);
  const crumbs = useRef<CrumbBurst | null>(null);
  /** The live position and openness of the fortune, published by its gestures. */
  const paper = useRef<PaperHandle | null>(null);
  /** The cookie's canvas, which goes soft as the fortune is pulled open. */
  const cookieCanvas = useRef<HTMLDivElement>(null);

  // The fortunes ticked in the sheet join the pool. Asked once, on load; if
  // the sheet is not set up the route says so and the house forty carry on.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/fortunes')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { fortunes?: Fortune[] } | null) => {
        if (!cancelled && data?.fortunes?.length) addFortunes(data.fortunes);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /** Writing a fortune for someone: a second sheet, and the cookie waits. */
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const composePaper = useRef<PaperHandle | null>(null);
  const composeSheet = useRef<HTMLFormElement | null>(null);
  // The paper reports its face every frame; the field is moved to it directly,
  // never through state — that would re-render the scene sixty times a second.
  const placeSheet = useCallback(
    (dx: number, dy: number, rotateDeg: number) => {
      const el = composeSheet.current;
      if (!el) return;
      el.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${rotateDeg.toFixed(2)}deg)`;
    },
    [],
  );
  /** One quiet line at the bottom, for a few seconds. */
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  const say = useCallback((line: string | null) => {
    window.clearTimeout(toastTimer.current);
    setToast(line);
    if (line)
      toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  // Written straight to the element rather than through state: the pull
  // reports every frame, and re-rendering the scene for each would be silly.
  // Cleared when the paper goes, so the toy comes back sharp.
  const soften = useCallback((progress: number) => {
    const node = cookieCanvas.current;
    if (!node) return;
    node.style.filter =
      progress > 0.001
        ? `blur(${(SOFT_BLUR_PX * progress).toFixed(2)}px) brightness(${(1 - SOFT_DIM * progress).toFixed(3)})`
        : '';
  }, []);
  const firstBiteDone = useRef(false);
  const shadowGroup = useRef<THREE.Group>(null);
  /** The pile is gone, so its shadow should be too. */
  const [pileGone, setPileGone] = useState(false);
  /** Shadow redraws every frame while the pile is changing shape. */
  const [shadowLive, setShadowLive] = useState(false);
  const shadowTimer = useRef(0);

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
  //
  // The paper rustle used to fire here. It belongs to the unroll now — the
  // sound is a sheet opening, and the paper arrives rolled and stays that way
  // until it is pulled, so FortunePaper plays it at the moment that happens.
  useEffect(() => {
    if (kismet.state !== 'cracked') return;
    const timer = window.setTimeout(() => {
      setFortune(nextFortune());
      kismet.send('reveal');
    }, PAPER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [kismet]);

  // Each bite changes the pile's outline, so the shadow goes back to redrawing
  // every frame and re-bakes once the shrinking has finished.
  const wakeShadow = useCallback(() => {
    setShadowLive(true);
    window.clearTimeout(shadowTimer.current);
    shadowTimer.current = window.setTimeout(
      () => setShadowLive(false),
      SHADOW.liveAfterBiteMs,
    );
  }, []);
  useEffect(() => () => window.clearTimeout(shadowTimer.current), []);

  const handleBite = useCallback(
    (crumbAt: THREE.Vector3[]) => {
      kismet.send('eat');
      wakeShadow();

      // One crunch and one buzz per tap, not per shard: three shards go at once,
      // and three samples on the same frame reads as a glitch rather than a bite.
      playCrunch(!firstBiteDone.current);
      firstBiteDone.current = true;
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(EAT.hapticMs);
      }

      if (reducedMotion) return;
      for (const at of crumbAt) {
        const count =
          EAT.crumbsMin +
          Math.floor(Math.random() * (EAT.crumbsMax - EAT.crumbsMin + 1));
        crumbs.current?.emit(at, count);
      }
    },
    [kismet, reducedMotion, wakeShadow],
  );

  // Last shard gone: a beat, then a fresh cookie and a full reset.
  const respawnTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(respawnTimer.current), []);

  const respawn = useCallback(() => {
    // Tell the sheet. Country only, fire and forget — the page never waits
    // on it and never hears back; the line at the top finds out by asking.
    void fetch('/api/eats', { method: 'POST', keepalive: true }).catch(
      () => {},
    );

    // Shadow starts fading the moment the last shard goes, so it is gone by the
    // time the beat ends and comes back with the new cookie.
    setPileGone(true);
    window.clearTimeout(respawnTimer.current);
    respawnTimer.current = window.setTimeout(() => {
      hasCracked.current = false;
      firstBiteDone.current = false;
      taps.current = 0;
      lastTapAt.current = 0;
      drag.current.active = false;
      drag.current.x = 0;
      drag.current.y = 0;
      drag.current.wobbleAt = null;
      setSettled(false);
      setPileGone(false);
      setFortune({ text: '' });
      setGeneration((g) => g + 1);
      kismet.send('reset');
      playPop();
    }, EAT.respawnDelayMs);
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
      if (hasCracked.current || kismet.pileLocked || composing) return;

      if (first) dragging.current = onCookie.current;

      // A filtered tap arrives as a single call with neither `first` nor
      // `last` set, so it cannot be handled inside the drag lifecycle.
      const engaged = dragging.current || (tap && onCookie.current);
      if (!engaged) return;

      // First contact with the cookie: unlock audio (the only moment iOS
      // allows it) and warm the physics WASM before the crack frame.
      preloadCrackSounds();
      preloadPaperSounds();
      preloadCrunchSounds();
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

  /*
   * Which plate the sheet is printed with. `pileGone` wins over the state
   * machine: it marks the beat between the last shard and the next cookie,
   * which is the only time the centre of the sheet is clear enough to carry
   * the counter.
   */
  const plate: Plate = pileGone
    ? 'eaten'
    : kismet.state === 'cracked'
      ? 'cracked'
      : kismet.state === 'reading'
        ? 'reading'
        : kismet.isBroken
          ? 'eating'
          : 'idle';

  return (
    <div
      className={ready ? 'stage__canvas is-ready' : 'stage__canvas'}
      {...bind()}
    >
      <div ref={cookieCanvas} className="stage__cookie">
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
              edible={kismet.edible}
              generation={generation}
              onPointerDownCookie={() => {
                onCookie.current = true;
              }}
              onSettled={() => setSettled(true)}
              onBite={handleBite}
              onEmptied={respawn}
            />
            <Crumbs handle={crumbs} />
            <PileAnchor onMeasure={setRiseFrom} />
            <RevealOnFirstFrame onReady={() => setReady(true)} />
          </Suspense>

          {/* The approved phase 1 key: warm, high and to the left, so the
            crust keeps a lit side and a shaded side. Frozen — the dark-room
            relight that briefly lived here is gone with the dark room. */}
          <directionalLight
            position={[-2.6, 3.8, 2.4]}
            intensity={2.6}
            color="#ffc078"
          />

          <ContactShadows
            ref={shadowGroup}
            frames={settled && !shadowLive ? 1 : Infinity}
            position={[0, SHADOW_Y, 0]}
            scale={4.5}
            blur={2.8}
            opacity={0.45}
            far={1.8}
            resolution={1024}
            color="#6f4f31"
          />
          <ShadowFade target={shadowGroup} visible={!pileGone} />

          {debug && <OrbitControls makeDefault />}
        </Canvas>
      </div>

      {/* The fortune, as geometry, in a scene of its own over the cookie's.
          Mounted for exactly as long as its gesture controller below is, so
          the two can never disagree. */}
      <PaperStage>
        {kismet.state === 'reading' && (
          <PaperRoll
            handle={paper}
            fortune={fortune.text}
            from={fortune.from}
          />
        )}
        {composing && (
          <PaperRoll
            handle={composePaper}
            fortune={draft}
            onFace={placeSheet}
          />
        )}
      </PaperStage>

      <StageChrome
        plate={plate}
        eaten={generation}
        composing={composing}
        toast={toast}
        onCompose={() => {
          if (composing) {
            // The × — closing is the same as cancelling.
            setComposing(false);
            soften(0);
            return;
          }
          if (kismet.state !== 'idle') return;
          say(null);
          setDraft('');
          setComposing(true);
          soften(1);
        }}
      />

      {composing && (
        <ComposeFortune
          handle={composePaper}
          sheet={composeSheet}
          reducedMotion={reducedMotion}
          onPrint={setDraft}
          onDone={(line) => {
            setComposing(false);
            soften(0);
            say(line);
          }}
        />
      )}

      {kismet.state === 'reading' && (
        <FortunePaper
          fortune={fortune.text}
          from={fortune.from}
          riseFrom={riseFrom}
          reducedMotion={reducedMotion}
          handle={paper}
          onUnroll={soften}
          onDismiss={() => {
            soften(0);
            kismet.send('dismiss');
          }}
        />
      )}
    </div>
  );
}

useGLTF.preload(MODEL_URL);
