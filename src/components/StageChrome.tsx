'use client';

import { useEffect, useState } from 'react';

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
export function StageChrome({ plate }: { plate: Plate }) {
  const [quiet, setQuiet] = useState(false);

  // Poster at rest, toy in motion. Any hand on the screen — on the cookie, on
  // the pile, on the slip — drops the whole sheet back to a watermark, and it
  // prints again the moment the hand comes off. Listened for on the window
  // rather than wired through the gesture layers, so there is exactly one
  // rule and no gesture can forget to obey it.
  useEffect(() => {
    const down = () => setQuiet(true);
    const up = () => setQuiet(false);
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  // Everything on the sheet belongs to the idle plate now. The moment the
  // cookie breaks the page clears itself and the toy has it to itself.
  const idle = plate === 'idle';

  return (
    <>
      <div className="grain" aria-hidden="true" />

      <div className={`plate${quiet ? ' is-quiet' : ''}`}>
        <p className={f('credit', idle)}>
          ANKUR
          <br />
          YADAV
        </p>

        {/* The name of the thing, set on its side down the right margin —
            the only place it is said. */}
        <p className={f('statement', idle)}>
          FORTUNE<span className="f__statement-tail"> TELLING</span>
        </p>
      </div>
    </>
  );
}
