'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CuboidCollider,
  RigidBody,
  useBeforePhysicsStep,
  type RapierRigidBody,
} from '@react-three/rapier';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { CRACK, EAT, SETTLE } from '@/lib/tuning';

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

const sink = new THREE.Vector3();
const quaternion = new THREE.Quaternion();

export function Shards({
  shards,
  floorY,
  eatable,
  reducedMotion,
  onSettled,
  onBite,
  onEmptied,
}: {
  shards: ShardDef[];
  floorY: number;
  /** Taps only eat once the paper is out of the way. */
  eatable: boolean;
  reducedMotion: boolean;
  onSettled: () => void;
  /** Fires once per tap, not once per shard, with the crumb positions. */
  onBite: (crumbAt: THREE.Vector3[]) => void;
  onEmptied: () => void;
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

  // Authoritative in refs so a burst of taps in a single frame cannot race the
  // render: `version` exists only to re-render once the sets have changed.
  const eaten = useRef<Set<number>>(new Set());
  const biting = useRef<Map<number, { startedAt: number; toward: THREE.Vector3 }>>(
    new Map(),
  );
  const groups = useRef<(THREE.Group | null)[]>([]);
  // Mirrored into state purely so the render can drop eaten shards; the ref
  // above stays the authority, because taps must resolve synchronously.
  const [eatenList, setEatenList] = useState<number[]>([]);

  const bite = useCallback(
    (hit: number, point: THREE.Vector3) => {
      if (!eatable) return;
      if (eaten.current.has(hit) || biting.current.has(hit)) return;

      // Everything still on the plate, with its live physics position.
      const available: { index: number; position: THREE.Vector3 }[] = [];
      bodies.current.forEach((body, i) => {
        if (!body || eaten.current.has(i) || biting.current.has(i)) return;
        const t = body.translation();
        available.push({ index: i, position: new THREE.Vector3(t.x, t.y, t.z) });
      });

      const origin = available.find((s) => s.index === hit)?.position;
      if (!origin) return;

      // The shard that was hit, plus its nearest neighbours within reach.
      const cluster = available
        .filter((s) => s.index === hit || s.position.distanceTo(origin) <= EAT.clusterRadius)
        .sort(
          (a, b) =>
            a.position.distanceTo(origin) - b.position.distanceTo(origin),
        )
        .slice(0, EAT.clusterSize);

      const now = performance.now();
      const crumbAt: THREE.Vector3[] = [];
      for (const shard of cluster) {
        biting.current.set(shard.index, {
          startedAt: now,
          toward: point.clone(),
        });
        crumbAt.push(shard.position.clone());
      }

      onBite(crumbAt);
    },
    [eatable, onBite],
  );

  // Shrink the shards being eaten, then unmount them.
  useFrame(() => {
    if (biting.current.size === 0) return;
    const now = performance.now();
    const duration = reducedMotion ? 90 : EAT.biteMs;
    let finished = false;

    biting.current.forEach((entry, index) => {
      const group = groups.current[index];
      const t = Math.min(1, (now - entry.startedAt) / duration);

      if (group) {
        if (reducedMotion) {
          // No sucking away, just gone.
          group.scale.setScalar(1 - t);
        } else {
          // Ease-in: hangs for a moment, then whips away.
          group.scale.setScalar(1 - t * t);
          const body = bodies.current[index];
          if (body) {
            const at = body.translation();
            const rot = body.rotation();
            // The sink is a world-space pull toward the tap, so it has to be
            // rotated into the body's own frame before it can be applied.
            sink
              .set(entry.toward.x - at.x, entry.toward.y - at.y, entry.toward.z - at.z)
              .normalize()
              .multiplyScalar(EAT.sinkDistance * t)
              .applyQuaternion(
                quaternion.set(rot.x, rot.y, rot.z, rot.w).invert(),
              );
            group.position.copy(sink);
          }
        }
      }

      if (t >= 1) {
        biting.current.delete(index);
        eaten.current.add(index);
        // Retired, not unmounted. Removing a RigidBody while the world is
        // stepping frees memory Rapier is still iterating, which throws
        // "memory access out of bounds" from inside its own step every frame
        // afterwards. Disabling takes it out of the simulation just as well,
        // and the bodies are released together at respawn, when the world is
        // paused.
        bodies.current[index]?.setEnabled(false);
        finished = true;
      }
    });

    if (finished) {
      setEatenList([...eaten.current]);
      if (eaten.current.size >= shards.length) onEmptied();
    }
  });

  return (
    <>
      {shards.map((shard, i) => (
        (
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
            <group
              visible={!eatenList.includes(i)}
              ref={(group) => {
                groups.current[i] = group;
              }}
              onPointerDown={(event) => {
                if (!eatable) return;
                event.stopPropagation();
                bite(i, event.point);
              }}
            >
              {shard.parts.map((part, p) => (
                <mesh key={p} geometry={part.geometry} material={part.material} />
              ))}
            </group>
          </RigidBody>
        )
      ))}

      {/* Invisible floor, top face exactly on the contact-shadow plane. */}
      <CuboidCollider args={[8, 0.5, 8]} position={[0, floorY - 0.5, 0]} />
    </>
  );
}
