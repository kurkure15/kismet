'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useSpring } from 'motion/react';
import { useDrag } from '@use-gesture/react';
import { playPaperThrow } from '@/lib/paperSound';

/** Enter: a spring with ease-out character, settling in roughly 450ms. */
export const ENTER_SPRING = { stiffness: 125, damping: 18, mass: 1 } as const;

/** Resting tilt, degrees. The slip never sits perfectly square. */
const REST_ROTATION = -2;

/** How closely the slip chases the pointer. Stiff, with just enough lag to live. */
const FOLLOW_SPRING = { stiffness: 700, damping: 42, mass: 0.9 } as const;

/**
 * Flick threshold in px/ms. A deliberate flick runs well over 1; letting go of
 * a slow drag lands near 0.1. 0.55 sits in the empty space between, so a weak
 * release cannot dismiss by accident.
 */
const FLICK_VELOCITY = 0.55;

/** Exit duration is distance/speed, held inside these bounds. */
const EXIT_MIN_MS = 240;
const EXIT_MAX_MS = 620;

/** Degrees of spin per px/ms of horizontal flick, capped. */
const SPIN_PER_VELOCITY = 34;
const MAX_SPIN = 90;

export type Release = {
  /** Where the slip sits when let go, relative to centre. */
  mx: number;
  my: number;
  /** use-gesture velocity, px/ms. */
  vx: number;
  vy: number;
  /** use-gesture direction, -1 | 0 | 1 per axis. */
  dx: number;
  dy: number;
  viewportWidth: number;
  viewportHeight: number;
};

export type ThrowPlan = {
  targetX: number;
  targetY: number;
  /** Milliseconds. */
  duration: number;
  /** Degrees added to the current rotation. */
  spin: number;
};

/**
 * Whether a release counts as a throw. Kept separate from the animation so the
 * numbers can be checked directly rather than by flicking at a screen.
 */
export function isThrow(vx: number, vy: number) {
  return Math.hypot(vx, vy) >= FLICK_VELOCITY;
}

/** Half the slip's diagonal, so "off screen" means fully gone, not clipped. */
const PAPER_CLEARANCE = 240;

/**
 * Turns a release into an exit.
 *
 * Direction comes from the velocity vector itself rather than use-gesture's
 * quantised dx/dy: those are only ever -1, 0 or 1, so a flick that is mostly
 * sideways with a little drift down would leave at a full 45 degrees, which
 * does not match the hand at all.
 *
 * Distance is measured to the screen edge along that heading, not across the
 * whole diagonal. With a fixed diagonal every realistic flick overshot the
 * duration cap and they all left at the same speed; measuring the real distance
 * lets duration = distance/speed vary the way the hand did.
 */
export function planThrow(release: Release): ThrowPlan {
  const { mx, my, vx, vy, dx, dy, viewportWidth, viewportHeight } = release;
  const speed = Math.hypot(vx, vy);

  let nx = speed > 0 ? vx / speed : dx;
  let ny = speed > 0 ? vy / speed : dy;
  if (nx === 0 && ny === 0) ny = -1; // straight up, rather than nowhere
  const norm = Math.hypot(nx, ny) || 1;
  nx /= norm;
  ny /= norm;

  const edgeX = viewportWidth / 2 + PAPER_CLEARANCE;
  const edgeY = viewportHeight / 2 + PAPER_CLEARANCE;
  const toX = nx !== 0 ? (Math.sign(nx) * edgeX - mx) / nx : Infinity;
  const toY = ny !== 0 ? (Math.sign(ny) * edgeY - my) / ny : Infinity;
  const distance = Math.max(1, Math.min(toX, toY));

  const duration = Math.min(
    EXIT_MAX_MS,
    Math.max(EXIT_MIN_MS, speed > 0 ? distance / speed : EXIT_MAX_MS),
  );
  const spin = Math.max(
    -MAX_SPIN,
    Math.min(MAX_SPIN, Math.abs(vx) * SPIN_PER_VELOCITY * (nx >= 0 ? 1 : -1)),
  );

  return {
    targetX: mx + nx * distance,
    targetY: my + ny * distance,
    duration,
    spin,
  };
}

export function FortunePaper({
  fortune,
  riseFrom,
  reducedMotion,
  onDismiss,
}: {
  fortune: string;
  /** Screen offset of the pile from viewport centre, in px. */
  riseFrom: { x: number; y: number };
  reducedMotion: boolean;
  onDismiss: () => void;
}) {
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const x = useSpring(dragX, FOLLOW_SPRING);
  const y = useSpring(dragY, FOLLOW_SPRING);
  const rotate = useMotionValue(REST_ROTATION);
  const opacity = useMotionValue(0);
  const scale = useMotionValue(reducedMotion ? 1 : 0.6);

  const slip = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const dismissed = useRef(false);

  // Enter. The slip starts down in the pile and rises to the middle.
  useEffect(() => {
    if (reducedMotion) {
      animate(opacity, 1, { duration: 0.2, ease: 'easeOut' });
      return;
    }
    dragX.jump(riseFrom.x);
    dragY.jump(riseFrom.y);
    x.jump(riseFrom.x);
    y.jump(riseFrom.y);
    rotate.set(-11);
    animate(dragX, 0, { type: 'spring', ...ENTER_SPRING });
    animate(dragY, 0, { type: 'spring', ...ENTER_SPRING });
    animate(scale, 1, { type: 'spring', ...ENTER_SPRING });
    animate(rotate, REST_ROTATION, { type: 'spring', ...ENTER_SPRING });
    animate(opacity, 1, { duration: 0.22, ease: 'easeOut' });
    // Runs once, on mount, for the reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    setLeaving(true);
    onDismiss();
  };

  useDrag(
    ({ down, movement: [mx, my], velocity: [vx, vy], direction: [dx, dy], last, tap }) => {
      if (dismissed.current) return;

      if (reducedMotion) {
        // No dragging to speak of — a tap sends it away. A filtered tap arrives
        // as a single call with neither `first` nor `last` set, so it has to be
        // caught explicitly rather than at the end of the drag.
        if (tap || last) {
          playPaperThrow();
          animate(opacity, 0, { duration: 0.2, ease: 'easeOut' }).then(dismiss);
        }
        return;
      }

      if (down) {
        dragX.set(mx);
        dragY.set(my);
        // Lean into the direction of travel, a little more the further it goes.
        rotate.set(REST_ROTATION + Math.max(-14, Math.min(14, mx * 0.045)));
        return;
      }

      if (!last) return;

      if (!isThrow(vx, vy)) {
        // Not a throw. Settle back to the middle.
        animate(dragX, 0, { type: 'spring', ...ENTER_SPRING });
        animate(dragY, 0, { type: 'spring', ...ENTER_SPRING });
        animate(rotate, REST_ROTATION, { type: 'spring', ...ENTER_SPRING });
        return;
      }

      const { targetX, targetY, duration, spin } = planThrow({
        mx, my, vx, vy, dx, dy,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });

      playPaperThrow();
      setLeaving(true);

      const ease = [0.16, 0.7, 0.35, 1] as const;
      animate(dragX, targetX, { duration: duration / 1000, ease });
      animate(dragY, targetY, { duration: duration / 1000, ease });
      animate(rotate, rotate.get() + spin, { duration: duration / 1000, ease });
      // Fade only once it is near the edge, so it reads as leaving, not dissolving.
      animate(opacity, 0, {
        duration: (duration * 0.4) / 1000,
        delay: (duration * 0.55) / 1000,
        ease: 'linear',
      }).then(dismiss);
    },
    {
      // Bound to the element rather than spread as props: motion.div has its
      // own onDrag, and the two collide.
      target: slip,
      filterTaps: true,
      enabled: !leaving,
    },
  );

  return (
    <div className="fortune" aria-live="polite">
      <motion.div
        ref={slip}
        className="fortune__slip"
        style={{ x, y, rotate, scale, opacity }}
        role="note"
      >
        <p className="fortune__text">{fortune}</p>
      </motion.div>
    </div>
  );
}
