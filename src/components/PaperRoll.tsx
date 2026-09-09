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
/** Segments across it. Only there so the normals can be smooth. */
const ROWS = 2;
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

/** The texture the fortune is printed on. Same 5:1 as the paper. */
const TEXTURE_W = 2048;
const TEXTURE_H = 410;
/** The stock and the ink. White — the tooth below is what keeps it from
    reading as a screen. */
const PAPER_COLOUR = '#ffffff';
const INK_COLOUR = '#26231f';
/** Type size on the texture: ~25px once the sheet is 640px wide on screen. */
const TYPE_PX = 80;
const LINE_HEIGHT = 1.5;
const MEASURE = 0.84;

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
function layout(positions: Float32Array, unroll: number) {
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
    if (s <= flat) {
      x = s;
      z = flat > 0 ? BOW * Math.sin((Math.PI * s) / flat) : 0;
    } else {
      const w = s - flat;
      const r = Math.sqrt(Math.max(0, R * R - (THICKNESS * w) / Math.PI));
      const theta = (2 * Math.PI * (R - r)) / THICKNESS;
      x = flat + r * Math.sin(theta);
      z = R - r * Math.cos(theta);
    }
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;
    for (let j = 0; j < rows; j++) {
      const k = (j * cols + i) * 3;
      positions[k] = x;
      // Top row first, to match PlaneGeometry's vertex order and UVs.
      positions[k + 1] = (0.5 - j / ROWS) * ASPECT;
      positions[k + 2] = z;
    }
  }

  const shift = (xmin + xmax) / 2;
  for (let k = 0; k < positions.length; k += 3) positions[k] -= shift;
}

/** The serif next/font installed, by whatever name it gave it. */
function serifFamily() {
  const family = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-serif')
    .trim();
  return family || 'Georgia, serif';
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
 * Prints the fortune onto the stock. Drawn with the page's own serif — the
 * same file next/font already loaded, so no second copy of the face is
 * fetched — and word-wrapped to the slip's measure.
 */
async function print(canvas: HTMLCanvasElement, text: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const font = `500 ${TYPE_PX}px ${serifFamily()}`;
  try {
    await document.fonts.load(font);
  } catch {
    // The fallback face prints instead. Still paper, still a fortune.
  }

  let seed = 2166136261;
  for (const ch of text) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  stock(ctx, canvas.width, canvas.height, seed);

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
  const front = useRef<THREE.MeshStandardMaterial>(null);
  const back = useRef<THREE.MeshStandardMaterial>(null);

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
      layout(position.array as Float32Array, unroll);
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
        <meshStandardMaterial
          ref={front}
          attach="material-0"
          map={map}
          bumpMap={map}
          bumpScale={0.35}
          roughness={0.94}
          metalness={0}
          transparent
          side={THREE.FrontSide}
        />
        <meshStandardMaterial
          ref={back}
          attach="material-1"
          color="#f6f6f3"
          roughness={0.96}
          metalness={0}
          transparent
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  );
}
