'use client';

import { useEffect, useRef, useState } from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from 'motion/react';
import { useDrag } from '@use-gesture/react';
import { playPaperIn, playPaperThrow } from '@/lib/paperSound';

/** Enter: a spring with ease-out character, settling in roughly 450ms. */
export const ENTER_SPRING = { stiffness: 125, damping: 18, mass: 1 } as const;

/** Resting tilt, degrees. The slip never sits perfectly square. */
const REST_ROTATION = -2;

/**
 * How the slip sits while it is still rolled: a narrow curled sliver, squeezed
 * along its length and tipped away from the viewer so the curve of the roll
 * catches the light before it flattens out. It arrives like this and stays
 * like this until somebody pulls it open.
 *
 * `scaleX` is the whole trick — the strip opens along its length, which is
 * what unrolling looks like. The tilt is what stops it reading as a rectangle
 * being scaled up; the perspective it needs lives on `.fortune` in the CSS.
 */
const ROLLED = { scaleX: 0.075, scaleY: 0.96, curlDeg: 26 } as const;

/**
 * Rolling a strip along its length does not shorten it, so the tube is as long
 * as the flat slip is tall and the shading is what has to carry the roll. Two
 * crossfades do it, both keyed off the same `unroll` value:
 *
 *   the cylinder shading is opaque while it is wound and gone by two-thirds
 *   open, where the flat paper's own gentle curl takes over;
 *
 *   the fortune itself only arrives in the last half of the pull, because a
 *   line of type squeezed into a 32px tube is grey mush, and because paper
 *   that has not been opened yet should not be readable.
 */
const ROLL_SHADE_OUT = [0, 0.62] as const;
const TEXT_IN = [0.5, 0.95] as const;

/** Its resting tilt while still rolled, degrees. Steeper than the open slip. */
const ROLLED_ROTATION = -8;

/**
 * How far you have to pull to get it all the way open, as a fraction of the
 * smaller viewport edge — about 173px on a laptop, 94px on a phone. The same
 * scale as the swipe-to-dismiss threshold, so the two gestures feel like they
 * belong to the same hand.
 */
const OPEN_DISTANCE_FRACTION = 0.22;

/**
 * Let go past this much of the way and it finishes opening on its own; short
 * of it, it rolls back up. Deliberately past halfway, so a stray nudge on the
 * roll does not commit you.
 */
const OPEN_THRESHOLD = 0.55;

/**
 * The spring that finishes the pull, or takes it back. Softer than the rest of
 * the entrance because paper opens more slowly than it travels.
 */
const UNROLL_SPRING = { stiffness: 92, damping: 17, mass: 1 } as const;

/** How closely the slip chases the pointer. Stiff, with just enough lag to live. */
const FOLLOW_SPRING = { stiffness: 700, damping: 42, mass: 0.9 } as const;

/**
 * Flick threshold in px/ms. A deliberate flick runs well over 1; letting go of
 * a slow drag lands near 0.1. 0.55 sits in the empty space between, so a weak
 * release cannot dismiss by accident.
 */
const FLICK_VELOCITY = 0.55;

/**
 * The other way out: carry the slip far enough in any direction and letting go
 * dismisses it however gently, because at that point the intent is obvious.
 * A fraction of the smaller viewport edge — about 158px on a laptop, 86px on a
 * phone — which is a deliberate swipe, well clear of a nudge that should still
 * spring back.
 */
const SWIPE_DISTANCE_FRACTION = 0.2;

/** Below this the velocity vector is noise, and the drag offset is the truth. */
const DIRECTION_FROM_VELOCITY_ABOVE = 0.15;

/** Exit duration is distance/speed, held inside these bounds. */
const EXIT_MIN_MS = 240;
const EXIT_MAX_MS = 620;
/** A slow swipe has no meaningful speed to scale by, so it leaves at a set clip. */
const SWIPE_EXIT_MS = 380;

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
 * Whether a release should send the slip away. Two ways to qualify, both
 * direction-agnostic: flick it hard, or simply carry it far. Kept separate from
 * the animation so the numbers can be checked directly rather than by swiping
 * at a screen.
 */
export function isThrow(
  vx: number,
  vy: number,
  mx = 0,
  my = 0,
  viewportMin = Infinity,
) {
  if (Math.hypot(vx, vy) >= FLICK_VELOCITY) return true;
  return Math.hypot(mx, my) >= SWIPE_DISTANCE_FRACTION * viewportMin;
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

  // A hard flick means the velocity vector; a slow swipe means wherever the
  // slip was actually carried. use-gesture's quantised dx/dy is the last resort.
  const offset = Math.hypot(mx, my);
  let nx: number;
  let ny: number;
  if (speed > DIRECTION_FROM_VELOCITY_ABOVE) {
    nx = vx / speed;
    ny = vy / speed;
  } else if (offset > 0) {
    nx = mx / offset;
    ny = my / offset;
  } else {
    nx = dx;
    ny = dy;
  }
  if (nx === 0 && ny === 0) ny = -1; // straight up, rather than nowhere
  const norm = Math.hypot(nx, ny) || 1;
  nx /= norm;
  ny /= norm;

  const edgeX = viewportWidth / 2 + PAPER_CLEARANCE;
  const edgeY = viewportHeight / 2 + PAPER_CLEARANCE;
  const toX = nx !== 0 ? (Math.sign(nx) * edgeX - mx) / nx : Infinity;
  const toY = ny !== 0 ? (Math.sign(ny) * edgeY - my) / ny : Infinity;
  const distance = Math.max(1, Math.min(toX, toY));

  const duration =
    speed > DIRECTION_FROM_VELOCITY_ABOVE
      ? Math.min(EXIT_MAX_MS, Math.max(EXIT_MIN_MS, distance / speed))
      : SWIPE_EXIT_MS;
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
  const rotate = useMotionValue(reducedMotion ? REST_ROTATION : ROLLED_ROTATION);
  const opacity = useMotionValue(0);

  /*
   * How far open the roll is, 0 to 1. One value drives the whole thing — the
   * width it opens to, the squeeze along its height, and the curl flattening
   * out — so the paper cannot come apart into three unrelated animations, and
   * a half-finished pull is always a real, coherent half-open roll.
   */
  const unroll = useMotionValue(reducedMotion ? 1 : 0);
  const scaleX = useTransform(unroll, [0, 1], [ROLLED.scaleX, 1]);
  const scaleY = useTransform(unroll, [0, 1], [ROLLED.scaleY, 1]);
  const curl = useTransform(unroll, [0, 1], [ROLLED.curlDeg, 0]);
  const rollShade = useTransform(unroll, [...ROLL_SHADE_OUT], [1, 0]);
  const textIn = useTransform(unroll, [...TEXT_IN], [0, 1]);

  const grab = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const dismissed = useRef(false);
  /** Open for good. Until then a drag pulls the roll rather than moving it. */
  const opened = useRef(reducedMotion);

  // Enter. The slip comes up out of the pile still rolled and stays that way:
  // a curled sliver sitting dead centre over the pile it came from, waiting to
  // be pulled open.
  useEffect(() => {
    if (reducedMotion) {
      animate(opacity, 1, { duration: 0.2, ease: 'easeOut' });
      return;
    }
    dragX.jump(riseFrom.x);
    dragY.jump(riseFrom.y);
    x.jump(riseFrom.x);
    y.jump(riseFrom.y);
    animate(dragX, 0, { type: 'spring', ...ENTER_SPRING });
    animate(dragY, 0, { type: 'spring', ...ENTER_SPRING });
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
        // No dragging to speak of — it arrives open, and a tap sends it away.
        // A filtered tap arrives as a single call with neither `first` nor
        // `last` set, so it has to be caught explicitly rather than at the end
        // of the drag.
        if (tap || last) {
          playPaperThrow();
          animate(opacity, 0, { duration: 0.2, ease: 'easeOut' }).then(dismiss);
        }
        return;
      }

      /*
       * Still rolled: the drag pulls it open rather than carrying it around.
       * Distance is taken unsigned, so it opens whichever way you pull — the
       * roll has two ends and neither is the wrong one.
       */
      if (!opened.current) {
        const reach =
          OPEN_DISTANCE_FRACTION *
          Math.min(window.innerWidth, window.innerHeight);
        const pulled = Math.min(1, Math.abs(mx) / reach);

        if (down) {
          unroll.set(pulled);
          rotate.set(ROLLED_ROTATION + (REST_ROTATION - ROLLED_ROTATION) * pulled);
          return;
        }
        if (!last) return;

        const spring = { type: 'spring' as const, ...UNROLL_SPRING };
        if (pulled >= OPEN_THRESHOLD) {
          opened.current = true;
          playPaperIn();
          animate(unroll, 1, spring);
          animate(rotate, REST_ROTATION, spring);
        } else {
          animate(unroll, 0, spring);
          animate(rotate, ROLLED_ROTATION, spring);
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

      const viewportMin = Math.min(window.innerWidth, window.innerHeight);
      if (!isThrow(vx, vy, mx, my, viewportMin)) {
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
      target: grab,
      filterTaps: true,
      enabled: !leaving,
    },
  );

  /*
   * Two elements, not one. The outer takes the gesture and the travel; the
   * inner takes the roll. A transform shrinks the box it is applied to, so a
   * single element would leave a 30px-wide target to grab hold of — the outer
   * one stays full width whatever the roll is doing.
   */
  return (
    <div className="fortune" aria-live="polite">
      <motion.div ref={grab} className="fortune__grab" style={{ x, y }}>
        <motion.div
          className="fortune__slip"
          style={{ rotate, rotateX: curl, scaleX, scaleY, opacity }}
          role="note"
        >
          <motion.div
            className="fortune__roll"
            style={{ opacity: rollShade }}
            aria-hidden="true"
          />
          <motion.p className="fortune__text" style={{ opacity: textIn }}>
            {fortune}
          </motion.p>
        </motion.div>
      </motion.div>
    </div>
  );
}
