'use client';

import { useEffect, useRef } from 'react';
import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  type RapierRigidBody,
} from '@react-three/rapier';
import * as THREE from 'three';
import { CRACK, SETTLE } from '@/lib/tuning';

export type ShardPart = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
};

export type ShardDef = {
  name: string;
  /** Rest position in world space, straight from the GLB node. */
  position: [number, number, number];
  parts: ShardPart[];
};

/**
 * Deterministic per-shard jitter. A seeded hash rather than Math.random so a
 * given shard always throws the same way — makes the break reproducible while
 * debugging, and still looks unrelated shard to shard.
 */
function jitter(seed: number, salt: number) {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x); // 0..1
}

export function Shards({
  shards,
  floorY,
  onSettled,
}: {
  shards: ShardDef[];
  floorY: number;
  onSettled: () => void;
}) {
  const bodies = useRef<(RapierRigidBody | null)[]>([]);
  const steps = useRef(0);
  const finished = useRef(false);
  const snapshot = useRef<
    { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number }[]
  >([]);
  const snapshotStep = useRef(0);

  // Blow the pieces apart on the frame they mount.
  useEffect(() => {
    const direction = new THREE.Vector3();
    bodies.current.forEach((body, i) => {
      if (!body) return;
      const [x, y, z] = shards[i].position;

      // Radial, away from the cookie's centre (the world origin), with a lift
      // so the pile opens upward instead of scraping along the floor.
      direction.set(x, y, z);
      if (direction.lengthSq() < 1e-6) direction.set(0, 1, 0);
      direction.normalize();
      direction.y += CRACK.upwardBias;
      direction.normalize();

      const scale =
        CRACK.impulse *
        (1 + (jitter(i + 1, 1) * 2 - 1) * CRACK.impulseJitter);
      const mass = body.mass() || 1;

      body.applyImpulse(
        {
          x: direction.x * scale * mass,
          y: direction.y * scale * mass,
          z: direction.z * scale * mass,
        },
        true,
      );
      body.applyTorqueImpulse(
        {
          x: (jitter(i + 1, 2) * 2 - 1) * CRACK.torque * mass,
          y: (jitter(i + 1, 3) * 2 - 1) * CRACK.torque * mass,
          z: (jitter(i + 1, 4) * 2 - 1) * CRACK.torque * mass,
        },
        true,
      );
    });
  }, [shards]);

  // Watch for the pile going quiet, then hand back so physics can be paused.
  useBeforePhysicsStep(() => {
    if (finished.current) return;
    steps.current += 1;

    const take = () =>
      bodies.current.map((body) => {
        const t = body ? body.translation() : { x: 0, y: 0, z: 0 };
        const r = body ? body.rotation() : { x: 0, y: 0, z: 0, w: 1 };
        return { x: t.x, y: t.y, z: t.z, qx: r.x, qy: r.y, qz: r.z, qw: r.w };
      });

    if (snapshot.current.length === 0) {
      snapshot.current = take();
      snapshotStep.current = steps.current;
      return;
    }

    let quiet = false;
    if (steps.current - snapshotStep.current >= SETTLE.windowSteps) {
      const now = take();
      let maxMoved = 0;
      let maxTurned = 0;
      for (let i = 0; i < now.length; i++) {
        const a = now[i];
        const b = snapshot.current[i];
        if (!b) continue;
        maxMoved = Math.max(maxMoved, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
        const dot = Math.abs(a.qx * b.qx + a.qy * b.qy + a.qz * b.qz + a.qw * b.qw);
        maxTurned = Math.max(maxTurned, 2 * Math.acos(Math.min(1, dot)));
      }
      quiet =
        maxMoved < SETTLE.netMovement && maxTurned < SETTLE.netRotation;
      snapshot.current = now;
      snapshotStep.current = steps.current;
    }

    const settled = steps.current > SETTLE.minimumSteps && quiet;

    if (settled || steps.current > SETTLE.timeoutSteps) {
      finished.current = true;
      // Park the bodies before the world is paused, so no residual contact
      // jitter is frozen mid-twitch.
      for (const body of bodies.current) body?.sleep();
      onSettled();
    }
  });

  return (
    <>
      {shards.map((shard, i) => (
        <RigidBody
          key={shard.name}
          ref={(body) => {
            bodies.current[i] = body;
          }}
          position={shard.position}
          colliders="hull"
          restitution={CRACK.restitution}
          friction={CRACK.friction}
          linearDamping={CRACK.linearDamping}
          angularDamping={CRACK.angularDamping}
        >
          {shard.parts.map((part, p) => (
            <mesh
              key={p}
              geometry={part.geometry}
              material={part.material}
              castShadow
            />
          ))}
        </RigidBody>
      ))}

      {/* Invisible floor, top face exactly on the contact-shadow plane. */}
      <CuboidCollider args={[8, 0.5, 8]} position={[0, floorY - 0.5, 0]} />
    </>
  );
}
