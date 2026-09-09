'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PaperHandle } from '@/components/FortunePaper';

/*
 * The fortune, as a real piece of paper.
 *
 * A strip of geometry whose vertices are laid out fresh every time the roll
 * moves: however much has been pulled open lies flat, and the remainder is
 * wound into a spiral at the end of it. Nothing is faked with shading — the
 * coil is a coil, lit by a lamp of its own in PaperStage, and the fortune is
 * printed on the inside of it, so it can only be read once the paper has
 * been opened.
 *
 * All of the paper's numbers are in strip lengths, so the roll keeps its
 * proportions whatever size it is drawn at.
 */

/** Segments along the strip. Enough that four turns of coil stay round. */
const SEGMENTS = 160;
/** Segments across it. Enough for creases to run at an angle across the sheet. */
const ROWS = 6;
/** Height as a fraction of length: the ~5:1 slip. */
const ASPECT = 1 / 5;
/** The innermost turn of the coil, and the paper's own thickness. */
const CORE_RADIUS = 0.028;
const THICKNESS = 0.0055;
/** Never quite flat: the free end keeps this much of itself curled. */
const MIN_WOUND = 0.03;
/** A gentle bow across the open part, so it is paper rather than a plane. */
const BOW = 0.012;
/**
 * The crumple. A slip that has been rolled tight inside a cookie, then pulled
 * open by hand, does not lie flat: it keeps a few creases from the rolling,
 * the long edges lift a little, and the free end never quite settles. All of
 * it is relief in z, in strip lengths — on a 640px sheet the deepest crease
 * is about five pixels — and it fades out just before the coil so the paper
 * feeds into the roll cleanly.
 */
const CREASES = 5;
const CREASE_DEPTH: [number, number] = [0.004, 0.009];
const CREASE_WIDTH: [number, number] = [0.012, 0.03];
/** How far a crease drifts across the sheet's height, so none runs dead straight. */
const CREASE_SKEW = 0.35;
/** The long edges curl up toward the reader. */
const EDGE_CURL = 0.009;
/** The free end lifts, the way a strip does when it has been held. */
const END_LIFT = 0.02;
/** Relief fades out over this much of the strip before the coil. */
const RELIEF_FADE = 0.06;

/**
 * The paper faces its camera and sizes itself in screen pixels, so it always
 * lands where its DOM hand-hold is: min(86vw, 40rem) wide, the same rule the
 * hand-hold uses in globals.css.
 */
const WIDTH_FRACTION = 0.86;
const WIDTH_MAX_PX = 640;

/**
 * Leaned back toward the viewer, more while rolled than once open. Tilting the
 * top of the tube toward the camera is what lets it see down into the end of
 * the coil, which is the one view from which a roll of paper is unmistakably
 * a roll of paper; once it is open the lean eases off so the type sits nearly
 * square to the eye.
 */
const TILT_ROLLED_DEG = 24;
const TILT_OPEN_DEG = 7;

/**
 * How the paper catches the light. Roughness is what spreads the lamp's
 * highlight across the sheet; the clearcoat is a thin gloss over it that
 * gives a second, tighter glint. Low enough to shine, high enough that
 * the sheet still reads as paper rather than plastic.
 */
const SHEEN = { roughness: 0.55, clearcoat: 0.22, clearcoatRoughness: 0.3 };

/** The texture the fortune is printed on. Same 5:1 as the paper. */
const TEXTURE_W = 2048;
const TEXTURE_H = 410;
/** The stock and the ink. White — the tooth below is what keeps it from
    reading as a screen. */
const PAPER_COLOUR = '#ffffff';
const INK_COLOUR = '#26231f';
/** Type size on the texture: ~22px once the sheet is 640px wide on screen.
    The hand is wide and tall, so it is set a touch smaller than a serif
    would be, with more lead. */
const TYPE_PX = 70;
const LINE_HEIGHT = 1.7;
const MEASURE = 0.86;

/**
 * Lays the strip out for a given amount of opening.
 *
 * Arc length runs 0..1 along the strip. The first `flat` of it lies along +x
 * with a slight bow; the rest winds into a spiral that starts tangent to the
 * flat part and curls up toward +z (toward the camera, once the group is
 * turned to face it). The paper enters the coil at its outermost turn and
 * winds inward, which is how a rolled strip is actually arranged — the free
 * end is at the centre.
 *
 * For paper of thickness t wound from radius R in to r0, arc length and angle
 * relate by  w = Rθ - tθ²/4π,  and the whole coil holds  W = π(R² - r0²)/t.
 * Both invert in closed form, so every vertex is placed directly.
 *
 * Finally the whole thing is shifted so its horizontal extent is centred on
 * x=0: the group's origin is the paper's on-screen centre, and as it opens the
 * coil recedes while the flat part grows, rather than either end staying put.
 */
function layout(positions: Float32Array, unroll: number, creases: Crease[]) {
  const wound = Math.max(MIN_WOUND, 1 - unroll);
  const flat = 1 - wound;
  const R = Math.sqrt(CORE_RADIUS * CORE_RADIUS + (THICKNESS * wound) / Math.PI);

  const cols = SEGMENTS + 1;
  const rows = ROWS + 1;
  let xmin = Infinity;
  let xmax = -Infinity;

  for (let i = 0; i < cols; i++) {
    const s = i / SEGMENTS;
    let x: number;
    let z: number;
    let onSheet = false;
    if (s <= flat) {
      x = s;
      z = flat > 0 ? BOW * Math.sin((Math.PI * s) / flat) : 0;
      onSheet = true;
    } else {
      const w = s - flat;
      const r = Math.sqrt(Math.max(0, R * R - (THICKNESS * w) / Math.PI));
      const theta = (2 * Math.PI * (R - r)) / THICKNESS;
      x = flat + r * Math.sin(theta);
      z = R - r * Math.cos(theta);
    }
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;

    // Relief on the open sheet only, fading to nothing at the coil.
    const fade = onSheet ? Math.min(1, (flat - s) / RELIEF_FADE) : 0;

    for (let j = 0; j < rows; j++) {
      const k = (j * cols + i) * 3;
      // Top row first, to match PlaneGeometry's vertex order and UVs.
      const v = 0.5 - j / ROWS;
      let relief = 0;
      if (fade > 0) {
        for (const c of creases) {
          const d = (s - c.at + c.skew * v * ASPECT) / c.width;
          relief += c.depth * Math.exp(-d * d);
        }
        relief += EDGE_CURL * (2 * v) * (2 * v);
        relief += END_LIFT * Math.exp(-s / 0.03);
        relief *= fade;
      }
      positions[k] = x;
      positions[k + 1] = v * ASPECT;
      positions[k + 2] = z + relief;
    }
  }

  const shift = (xmin + xmax) / 2;
  for (let k = 0; k < positions.length; k += 3) positions[k] -= shift;
}

/** The hand next/font installed, by whatever name it gave it. */
function handFamily() {
  const family = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-hand')
    .trim();
  return family || '"Bradley Hand", "Segoe Script", cursive';
}

/** Every fortune is printed as something said. Typographer's quotes, not inch marks. */
export function quoted(text: string) {
  return `\u201C${text}\u201D`;
}

/**
 * A small deterministic generator, so the fibres in the stock fall the same
 * way every time a given fortune is printed rather than reshuffling on each
 * mount.
 */
function seeded(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

type Crease = { at: number; width: number; depth: number; skew: number };

/** Where this sheet was creased. Seeded, so a given fortune always crumples the same way. */
function makeCreases(seed: number): Crease[] {
  const rand = seeded(seed);
  const creases: Crease[] = [];
  for (let i = 0; i < CREASES; i++) {
    creases.push({
      at: 0.06 + rand() * 0.88,
      width: CREASE_WIDTH[0] + rand() * (CREASE_WIDTH[1] - CREASE_WIDTH[0]),
      depth:
        (CREASE_DEPTH[0] + rand() * (CREASE_DEPTH[1] - CREASE_DEPTH[0])) *
        (rand() > 0.5 ? 1 : -1),
      skew: (rand() - 0.5) * 2 * CREASE_SKEW,
    });
  }
  return creases;
}

/**
 * Lays down the stock: white, with the faint mottling and the short fibres
 * of a cheap laid paper, which is what fortune slips are printed on.
 * All at very low contrast — it has to read as texture under a lamp, never as
 * dirt — and seeded from the text so the sheet is stable.
 */
function stock(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const rand = seeded(seed);
  ctx.fillStyle = PAPER_COLOUR;
  ctx.fillRect(0, 0, w, h);

  // Mottling: a handful of large soft pools, some a shade warmer, some cooler.
  for (let i = 0; i < 14; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = (0.18 + rand() * 0.3) * w;
    const warm = rand() > 0.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, warm ? 'rgba(150,140,120,0.03)' : 'rgba(110,115,125,0.025)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Fibres: thousands of short hairlines, mostly along the grain.
  ctx.lineCap = 'round';
  for (let i = 0; i < 9000; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const len = 4 + rand() * 22;
    const angle = (rand() - 0.5) * 0.9 + (rand() > 0.85 ? Math.PI / 2 : 0);
    const dark = rand() > 0.42;
    ctx.strokeStyle = dark
      ? `rgba(70,65,55,${0.02 + rand() * 0.035})`
      : `rgba(255,255,255,${0.05 + rand() * 0.06})`;
    ctx.lineWidth = 0.8 + rand() * 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }

  // Speckle: the odd fleck in the pulp.
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(70,65,55,${0.04 + rand() * 0.08})`;
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h, 0.8 + rand() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Prints the fortune onto the stock. Drawn with the page's own hand — the
 * same file next/font already loaded, so no second copy of the face is
 * fetched — and word-wrapped to the slip's measure.
 */
async function print(canvas: HTMLCanvasElement, text: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // The same hand as the name in the corner: written, not typeset.
  const font = `400 ${TYPE_PX}px ${handFamily()}`;
  try {
    await document.fonts.load(font);
  } catch {
    // The fallback face prints instead. Still paper, still a fortune.
  }

  let seed = 2166136261;
  for (const ch of text) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  stock(ctx, canvas.width, canvas.height, seed);

  // A blank sheet, for writing on. The words are typed over it in the DOM
  // until they are sent, and printed here only then.
  if (!text) return;

  ctx.fillStyle = INK_COLOUR;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${TYPE_PX * 0.015}px`;

  const maxWidth = canvas.width * MEASURE;
  const lines: string[] = [];
  let line = '';
  for (const word of quoted(text).split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  const step = TYPE_PX * LINE_HEIGHT;
  const top = canvas.height / 2 - ((lines.length - 1) * step) / 2;
  lines.forEach((l, i) => {
    ctx.fillText(l, canvas.width / 2, top + i * step);
  });
}

export function PaperRoll({
  handle,
  fortune,
}: {
  handle: React.RefObject<PaperHandle | null>;
  fortune: string;
}) {
  const camera = useThree((state) => state.camera as THREE.PerspectiveCamera);
  const size = useThree((state) => state.size);
  const gl = useThree((state) => state.gl);

  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const geometry = useRef<THREE.PlaneGeometry>(null);
  const front = useRef<THREE.MeshPhysicalMaterial>(null);
  const back = useRef<THREE.MeshPhysicalMaterial>(null);

  // Seeded from the text, like the stock, so the sheet is the same each time.
  const creases = useMemo(() => {
    let seed = 2166136261;
    for (const ch of fortune) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
    return makeCreases(seed ^ 0x9e3779b9);
  }, [fortune]);

  const [map, setMap] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    let cancelled = false;
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_W;
    canvas.height = TEXTURE_H;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = gl.capabilities.getMaxAnisotropy();
    print(canvas, fortune).then(() => {
      if (cancelled) return;
      texture.needsUpdate = true;
      setMap(texture);
    });
    return () => {
      cancelled = true;
      texture.dispose();
    };
  }, [fortune, gl]);

  // One mesh, one geometry, two materials over the same triangles: the printed
  // side faces out of the front, the plain side out of the back, so the back
  // of the paper is blank rather than a mirror image of the fortune. Both
  // groups cover every index; which one shows is decided by the face culling.
  useEffect(() => {
    const geo = geometry.current;
    if (!geo || !geo.index) return;
    geo.clearGroups();
    geo.addGroup(0, geo.index.count, 0);
    geo.addGroup(0, geo.index.count, 1);
  }, [map]);

  const scratch = useMemo(
    () => ({
      forward: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      spin: new THREE.Quaternion(),
      lean: new THREE.Quaternion(),
      axisZ: new THREE.Vector3(0, 0, 1),
      axisX: new THREE.Vector3(1, 0, 0),
    }),
    [],
  );
  const lastUnroll = useRef(-1);

  useFrame(() => {
    const live = handle.current;
    const node = group.current;
    if (!live || !node) return;

    // Re-lay the strip only when the roll has actually moved.
    const unroll = live.unroll.get();
    const geo = geometry.current;
    if (geo && unroll !== lastUnroll.current) {
      lastUnroll.current = unroll;
      const position = geo.attributes.position as THREE.BufferAttribute;
      layout(position.array as Float32Array, unroll, creases);
      position.needsUpdate = true;
      geo.computeVertexNormals();
    }

    // Screen space to world space, at the paper's depth. The camera looks at
    // the origin, so the origin projects to the exact centre of the viewport,
    // and one pixel there is this many units.
    camera.getWorldDirection(scratch.forward);
    const depth = camera.position.length();
    const unitsPerPx =
      (2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) /
      size.height;

    scratch.right.setFromMatrixColumn(camera.matrixWorld, 0);
    scratch.up.setFromMatrixColumn(camera.matrixWorld, 1);
    node.position
      .set(0, 0, 0)
      .addScaledVector(scratch.right, live.x.get() * unitsPerPx)
      .addScaledVector(scratch.up, -live.y.get() * unitsPerPx);

    // Face the camera; tilt in the plane of the screen (CSS rotation is
    // clockwise-positive, three's is not, hence the sign); then lean the top
    // toward the viewer, more while it is still a roll.
    scratch.spin.setFromAxisAngle(
      scratch.axisZ,
      THREE.MathUtils.degToRad(-live.rotate.get()),
    );
    const tilt = TILT_ROLLED_DEG + (TILT_OPEN_DEG - TILT_ROLLED_DEG) * unroll;
    scratch.lean.setFromAxisAngle(scratch.axisX, THREE.MathUtils.degToRad(tilt));
    node.quaternion
      .copy(camera.quaternion)
      .multiply(scratch.spin)
      .multiply(scratch.lean);

    node.scale.setScalar(
      Math.min(WIDTH_FRACTION * size.width, WIDTH_MAX_PX) * unitsPerPx,
    );

    const opacity = live.opacity.get();
    if (front.current) front.current.opacity = opacity;
    if (back.current) back.current.opacity = opacity;
    node.visible = opacity > 0.001;
  });

  if (!map) return null;

  return (
    <group ref={group} visible={false}>
      <mesh ref={mesh}>
        <planeGeometry ref={geometry} args={[1, ASPECT, SEGMENTS, ROWS]} />
        {/* Glossy stock. The lamp puts a soft highlight on the sheet that
            breaks up over the creases and streaks down the coil as it turns;
            the clearcoat adds a second, tighter glint on top, the way a
            coated slip catches the light. */}
        <meshPhysicalMaterial
          ref={front}
          attach="material-0"
          map={map}
          bumpMap={map}
          bumpScale={0.35}
          roughness={SHEEN.roughness}
          metalness={0}
          clearcoat={SHEEN.clearcoat}
          clearcoatRoughness={SHEEN.clearcoatRoughness}
          transparent
          side={THREE.FrontSide}
        />
        <meshPhysicalMaterial
          ref={back}
          attach="material-1"
          color="#ffffff"
          roughness={SHEEN.roughness}
          metalness={0}
          clearcoat={SHEEN.clearcoat}
          clearcoatRoughness={SHEEN.clearcoatRoughness}
          transparent
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
}
