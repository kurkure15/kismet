'use client';

import { useEffect, useImperativeHandle, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EAT } from '@/lib/tuning';

/**
 * A fixed pool. Bursts write into it round-robin, so tapping as fast as a hand
 * can move allocates nothing and the worst case is that the oldest crumbs are
 * recycled a little early. Sized for several overlapping bites: three shards a
 * tap, up to 14 crumbs each, and a 600ms life.
 */
const POOL = 360;

/** Warm crumb colours, taken from the crust and the fracture faces. */
const COLOURS = ['#c98f4a', '#e0ae66', '#f0d29a'];

export type CrumbBurst = { emit: (at: THREE.Vector3, count: number) => void };

type Pool = ReturnType<typeof createPool>;

function createPool() {
  return {
    position: new Float32Array(POOL * 3),
    velocity: new Float32Array(POOL * 3),
    spin: new Float32Array(POOL * 3),
    /** Seconds lived; >= life means dead. */
    age: new Float32Array(POOL).fill(Infinity),
    size: new Float32Array(POOL),
    next: 0,
    dummy: new THREE.Object3D(),
  };
}

export function Crumbs({ handle }: { handle: RefObject<CrumbBurst | null> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  // Held in a ref and built on first use: this is a mutable scratch buffer
  // written every frame, which is exactly what refs are for.
  const pool = useRef<Pool | null>(null);
  const getPool = () => (pool.current ??= createPool());

  // Colours are assigned once per pool slot rather than per burst: crumbs are
  // recycled constantly, so the mix stays varied without touching the buffer
  // on every bite.
  useEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    const colour = new THREE.Color();
    for (let i = 0; i < POOL; i++) {
      colour.set(COLOURS[i % COLOURS.length]);
      instanced.setColorAt(i, colour);
    }
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  }, []);

  useImperativeHandle(handle, () => ({
    emit(at: THREE.Vector3, count: number) {
      const state = getPool();
      for (let n = 0; n < count; n++) {
        const i = state.next;
        state.next = (state.next + 1) % POOL;
        const p = i * 3;
        state.position[p] = at.x;
        state.position[p + 1] = at.y;
        state.position[p + 2] = at.z;

        // Upward-biased cone, so crumbs spray off the bite rather than sink.
        const theta = Math.random() * Math.PI * 2;
        const up = 0.35 + Math.random() * 0.8;
        const out = 0.4 + Math.random() * 0.8;
        const speed = EAT.crumbSpeed * (0.5 + Math.random() * 0.8);
        state.velocity[p] = Math.cos(theta) * out * speed;
        state.velocity[p + 1] = up * speed;
        state.velocity[p + 2] = Math.sin(theta) * out * speed;

        state.spin[p] = (Math.random() - 0.5) * 12;
        state.spin[p + 1] = (Math.random() - 0.5) * 12;
        state.spin[p + 2] = (Math.random() - 0.5) * 12;

        state.age[i] = 0;
        state.size[i] = EAT.crumbSize * (0.5 + Math.random());
      }
    },
  }));

  useFrame((_, rawDelta) => {
    const instanced = mesh.current;
    if (!instanced) return;
    const state = getPool();
    // A stall must not teleport every crumb through the floor.
    const delta = Math.min(rawDelta, 1 / 30);
    const life = EAT.crumbLifeMs / 1000;
    let live = 0;

    for (let i = 0; i < POOL; i++) {
      const age = state.age[i];
      if (age >= life) {
        // Park dead crumbs at zero scale rather than reordering the buffer.
        state.dummy.position.set(0, -999, 0);
        state.dummy.scale.setScalar(0);
        state.dummy.rotation.set(0, 0, 0);
      } else {
        const p = i * 3;
        state.velocity[p + 1] -= EAT.crumbGravity * delta;
        state.position[p] += state.velocity[p] * delta;
        state.position[p + 1] += state.velocity[p + 1] * delta;
        state.position[p + 2] += state.velocity[p + 2] * delta;
        state.age[i] = age + delta;

        const t = Math.min(1, state.age[i] / life);
        // Shrinking to nothing stands in for fading: an InstancedMesh cannot
        // carry per-instance opacity without patching the shader, and at this
        // size the read is the same.
        const fade = (1 - t) * (1 - t * 0.4);
        state.dummy.position.set(
          state.position[p],
          state.position[p + 1],
          state.position[p + 2],
        );
        state.dummy.rotation.set(
          state.spin[p] * state.age[i],
          state.spin[p + 1] * state.age[i],
          state.spin[p + 2] * state.age[i],
        );
        state.dummy.scale.setScalar(state.size[i] * fade);
        live++;
      }
      state.dummy.updateMatrix();
      instanced.setMatrixAt(i, state.dummy.matrix);
    }

    instanced.instanceMatrix.needsUpdate = true;
    instanced.visible = live > 0;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, POOL]}
      frustumCulled={false}
      visible={false}
    >
      <tetrahedronGeometry args={[1, 0]} />
      <meshStandardMaterial roughness={0.85} />
    </instancedMesh>
  );
}

export { COLOURS as CRUMB_COLOURS };
