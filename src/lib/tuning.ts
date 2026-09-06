/**
 * Every number in phase 2 that was chosen by feel rather than derived, kept in
 * one place so it can be reviewed and re-tuned without hunting through
 * components. Phase 1's staging, lighting and material values are NOT here —
 * those are frozen in Scene.tsx.
 */

/** Live tension while a drag is held. */
export const TENSION = {
  /**
   * Drag distance that triggers the crack, as a fraction of the smaller
   * viewport dimension. 0.18 is far enough that a stray flick won't fire it,
   * close enough to reach one-thumbed on a phone (~71px on a 393pt screen).
   */
  thresholdFraction: 0.18,
  /** Lean at full tension, radians. ~15deg reads as strain without toppling. */
  maxTilt: 0.26,
  /** Uniform scale at full tension — the brief's "slight squash". */
  maxSquash: 0.97,
  /** Spring-back on release below threshold. */
  releaseMs: 200,
  /** How fast the lean chases the pointer. Higher is stiffer. */
  followPerSecond: 14,
} as const;

/** The wobble tease on a tap that doesn't crack. */
export const WOBBLE = {
  amplitude: 0.055,
  frequencyHz: 6.5,
  /** Exponential decay constant, seconds. */
  decay: 0.11,
  durationMs: 380,
} as const;

/** Tap-to-crack. */
export const TAP = {
  countToCrack: 3,
  /** Idle time after which the consecutive-tap count resets. */
  resetMs: 1500,
} as const;

/** The fracture itself. */
export const CRACK = {
  /**
   * Gravity. The cookie is modelled ~1.24 units tall where a real one is about
   * 6cm, so the scene is roughly 20x life size; default -9.81 makes the shards
   * drift like a slow-motion boulder. Scaled up until the fall reads as a small
   * brittle object.
   */
  gravity: [0, -24, 0] as [number, number, number],
  /** Radial impulse per shard before jitter. */
  impulse: 0.85,
  /** Per-shard randomisation of impulse magnitude, +/- this fraction. */
  impulseJitter: 0.3,
  /** How much of the impulse is redirected upward, before renormalising. */
  upwardBias: 0.42,
  /** Random torque impulse per shard, per axis. */
  torque: 0.014,
  /** Low, so pieces land dead rather than bouncing like rubber. */
  restitution: 0.15,
  friction: 1.1,
  linearDamping: 1.1,
  angularDamping: 2.6,
} as const;

/**
 * When the pile counts as settled, so physics can sleep.
 *
 * Counted in physics steps rather than wall-clock milliseconds: the step rate
 * is fixed, so these mean the same amount of *visible motion* on a 144Hz
 * desktop and a stuttering phone alike, where a wall-clock timer would cut a
 * slow device off early.
 *
 * Measured as net displacement over a window, which took three attempts to get
 * right. Velocity fails: shards resting on convex hulls keep spiking to 0.3
 * linear / 1.7 angular forever while going nowhere. Per-step movement fails
 * too, for the opposite reason — it cannot tell a shard still sliding into the
 * pile (which must not count as settled) from one vibrating in place (which
 * must), since both read about 0.006 per step. Net movement over a window
 * separates them cleanly: drift accumulates, vibration cancels out.
 */
export const SETTLE = {
  /** Steps over which net displacement is accumulated. */
  windowSteps: 12,
  /** Net movement across the window, world units, below which the pile is still. */
  netMovement: 0.015,
  /** Net rotation across the window, radians, below which the pile is still. */
  netRotation: 0.07,
  /** Never settle before this, so the first still steps don't count. */
  minimumSteps: 16,
  /** Hard stop, so a jammed shard can't keep the simulation alive forever. */
  timeoutSteps: 120,
} as const;

/** How long the break is left alone before the paper answers it. */
export const PAPER_DELAY_MS = 500;

/**
 * Eating. The pile is 14 shards and the target is a greedy 4-6 taps, so a bite
 * takes the shard that was hit plus its two nearest neighbours: 14 / 3 lands on
 * five taps whichever piece is struck first.
 */
export const EAT = {
  /** Shards removed per tap, including the one actually hit. */
  clusterSize: 3,
  /** Neighbours further than this are left alone, so a stray piece across the
   *  pile is never yanked away with an unrelated bite. */
  clusterRadius: 1.0,
  /** Shard shrink on being eaten — fast, and sucked away rather than faded. */
  biteMs: 120,
  /** How far the shard slides toward the tap as it goes, in world units. */
  sinkDistance: 0.09,
  crumbsMin: 8,
  crumbsMax: 14,
  crumbLifeMs: 600,
  crumbSpeed: 1.7,
  crumbGravity: 9,
  crumbSize: 0.032,
  /** Beat between the last shard going and the next cookie arriving. */
  respawnDelayMs: 400,
  /** The new cookie pops in from this scale. */
  popFrom: 0.9,
  popMs: 260,
  hapticMs: 10,
} as const;

/** The contact shadow's life cycle around eating and respawning. */
export const SHADOW = {
  /** The approved phase 1 opacity; the fade scales this, never replaces it. */
  opacity: 0.45,
  /** Fade to nothing when the pile is gone, and back in with a new cookie. */
  fadeMs: 250,
  /** How long after a bite the shadow keeps redrawing before it re-bakes. */
  liveAfterBiteMs: 340,
} as const;

/** Haptic pulse on crack, milliseconds. */
export const HAPTIC_MS = 15;
