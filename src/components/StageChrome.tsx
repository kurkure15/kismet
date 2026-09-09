'use client';

import { useEffect, useState } from 'react';
import { EatLine } from '@/components/EatLine';

/**
 * Which plate the sheet is printed with: the state machine, plus one extra
 * beat — `eaten` is the pause after the last shard goes and before the next
 * cookie arrives.
 *
 * Only `idle` currently changes what is drawn; the other four all print an
 * empty sheet. They are kept named rather than collapsed to a boolean because
 * they are the seams the design keeps being hung off, and each one is a real,
 * distinct moment whether or not it has anything on it today.
 */
export type Plate = 'idle' | 'cracked' | 'reading' | 'eating' | 'eaten';

/** How long the whisper stays if nobody touches anything. */
const HINT_MS = 4000;

/** A pointer has to travel this far before it counts as a drag, not a tap. */
const DRAG_SLOP = 6;

/** Marks one piece of furniture on or off the current plate. */
function f(modifier: string, on: boolean) {
  return `f f--${modifier}${on ? ' is-on' : ''}`;
}

/**
 * The printed page the toy performs inside.
 *
 * Everything here is furniture: fixed, inert, and hung off the plate margin.
 * It never touches the cookie, the pile or the slip — the only thing it reads
 * from them is which plate to print.
 */
export function StageChrome({
  plate,
  eaten,
  composing,
  toast,
  onCompose,
}: {
  plate: Plate;
  /** Cookies finished so far. The + waits for the first one. */
  eaten: number;
  /** The sheet is out for writing on; the + reads as a ×. */
  composing: boolean;
  /** One quiet line, or nothing. */
  toast: string | null;
  /** The + (or the ×) was pressed. */
  onCompose: () => void;
}) {
  const [quiet, setQuiet] = useState(false);
  const [hintGone, setHintGone] = useState(false);

  // The whisper under the cookie answers the only question a first visit
  // has. It goes at the first touch, or after four seconds on its own, and
  // once gone it never returns. Memory only, so a reload starts fresh.
  useEffect(() => {
    if (hintGone) return;
    const dismiss = () => setHintGone(true);
    const timer = window.setTimeout(dismiss, HINT_MS);
    window.addEventListener('pointerdown', dismiss, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', dismiss);
    };
  }, [hintGone]);

  // Poster at rest, toy in motion. While a hand is dragging something — the
  // cookie, the pile, the slip — the whole sheet drops back to a watermark,
  // and it prints again the moment the hand comes off. A bare tap does not
  // count: dimming on pointer-down made every tap a blink. It waits for the
  // pointer to actually travel. Listened for on the window rather than wired
  // through the gesture layers, so there is exactly one rule.
  useEffect(() => {
    let downAt: { x: number; y: number } | null = null;
    const down = (event: PointerEvent) => {
      // Except a hand on the two things you can actually use: typing a
      // fortune, or following the credit, should not dim the sheet.
      const target = event.target as Element | null;
      if (target?.closest('.f--plus, .f--credit a, .compose')) return;
      downAt = { x: event.clientX, y: event.clientY };
    };
    const move = (event: PointerEvent) => {
      if (!downAt) return;
      if (Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) < DRAG_SLOP) return;
      downAt = null;
      setQuiet(true);
    };
    const up = () => {
      downAt = null;
      setQuiet(false);
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  // Everything on the sheet belongs to the idle plate. The moment the cookie
  // breaks the page clears itself and the toy has it to itself.
  const idle = plate === 'idle';

  return (
    <>
      <div className="grain" aria-hidden="true" />

      <div
        className={`plate${quiet ? ' is-quiet' : ''}${composing ? ' is-writing' : ''}`}
      >
        {/* Speaks only when there is something recent to say; it turns its
            own visibility on, since the plate cannot know. */}
        <EatLine className={idle && !toast ? 'f f--eat' : 'f f--eat is-off'} />

        <p className={f('hint', idle && !hintGone)}>Drag to break</p>

        {/* Write one for someone. The one control on the sheet, and it only
            appears once you have been through a cookie yourself — you cannot
            write one until you have read one. It turns into the way out once
            the paper is open. */}
        <button
          type="button"
          className={`${f('plus', idle && (eaten > 0 || composing))}${composing ? ' is-open' : ''}`}
          aria-label={composing ? 'Close' : 'Write a fortune for someone'}
          onClick={onCompose}
        />

        <p className={f('toast', !!toast)} aria-live="polite">
          {toast ?? ''}
        </p>

        {/* The bottom line: the name in the hand, the credit in small print. */}
        <p className={f('name', idle)}>Fortune Teller</p>
        <p className={f('credit', idle)}>
          Made by{' '}
          <a href="https://x.com/ankurchirps" target="_blank" rel="noreferrer">
            Ankur
          </a>
        </p>
      </div>
    </>
  );
}
