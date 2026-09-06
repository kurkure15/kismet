'use client';

import { useEffect, useState } from 'react';

/**
 * Suffixes for the counter, in the same register as the fortunes. Kept short
 * enough that the line never competes with the cookie.
 */
const SUFFIXES = [
  'fate accepted',
  'no refunds',
  'destiny, lightly salted',
  'the universe noticed',
  'appetite intact',
  'crumbs forgiven',
] as const;

/**
 * The stage furniture: wordmark, first-visit hint, and the eaten counter.
 * Purely presentational — it never touches the cookie or the gestures.
 */
export function StageChrome({
  eaten,
  floorAt,
}: {
  eaten: number;
  /** Screen offset of the floor from viewport centre, in px. */
  floorAt: { x: number; y: number };
}) {
  const [hintGone, setHintGone] = useState(false);
  const [shown, setShown] = useState(eaten);
  const [swapping, setSwapping] = useState(false);
  // Seeded deterministically; the crossfade below picks the real one before the
  // counter is ever shown, so this placeholder never reaches the screen.
  const [suffix, setSuffix] = useState<string>(SUFFIXES[0]);

  // The hint answers the only question a first visit has, and once the answer
  // is obvious it should never return. Memory only, so a reload starts fresh.
  useEffect(() => {
    if (hintGone) return;
    const dismiss = () => setHintGone(true);
    window.addEventListener('pointerdown', dismiss, { once: true });
    return () => window.removeEventListener('pointerdown', dismiss);
  }, [hintGone]);

  // Crossfade the count: out, swap the words, back in. Both steps run off
  // timers rather than synchronously in the effect, which would cascade.
  useEffect(() => {
    if (eaten === shown) return;
    const out = window.setTimeout(() => setSwapping(true), 0);
    const swap = window.setTimeout(() => {
      let next: string = suffix;
      while (next === suffix) {
        next = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
      }
      setSuffix(next);
      setShown(eaten);
      setSwapping(false);
    }, 160);
    return () => {
      window.clearTimeout(out);
      window.clearTimeout(swap);
    };
  }, [eaten, shown, suffix]);

  return (
    <>
      {/* The room, under the canvas: floor glow, falloff, film stock. */}
      <div
        className="stage__pool"
        aria-hidden="true"
        style={{
          top: `calc(50% + ${Math.round(floorAt.y)}px)`,
          marginLeft: `${Math.round(floorAt.x)}px`,
        }}
      />
      <div className="vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <p className="chrome chrome--wordmark">kismet</p>
      <p className={`chrome chrome--hint${hintGone ? ' is-gone' : ''}`}>
        drag to crack
      </p>
      {shown > 0 && (
        <p
          className={`chrome chrome--counter${swapping ? ' is-swapping' : ''}`}
          aria-live="polite"
        >
          <span className="chrome__count">{shown}</span>{' '}
          {shown === 1 ? 'cookie' : 'cookies'} · {suffix}
        </p>
      )}
    </>
  );
}
