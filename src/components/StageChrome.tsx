'use client';

import { useEffect, useState } from 'react';

/**
 * Which plate the sheet is printed with. Derived from the state machine plus
 * one extra beat: `eaten` is the pause after the last shard goes and before
 * the next cookie arrives. Nothing prints on it at the moment — the counter
 * that lived there is gone — but the beat is still the right seam to hang
 * anything centre-of-sheet on, so the state stays named.
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

  const idle = plate === 'idle';
  const broken = plate === 'cracked' || plate === 'reading';

  return (
    <>
      <div className="grain" aria-hidden="true" />

      <div className={`plate${quiet ? ' is-quiet' : ''}`}>
        {/* --- plate 1 · idle --- */}
        <p className={f('credit', idle)}>
          ANKUR
          <br />
          YADAV
        </p>

        {/* The name of the thing, set on its side down the right margin —
            the only place it is said. It used to sit in the top-left corner
            as well, which was saying it twice. */}
        <p className={f('statement', idle)}>
          FORTUNE<span className="f__statement-tail"> TELLING</span>
        </p>

        {/* --- plates 2 and 3 · cracked, then reading --- */}
        <p className={f('chapter', broken)}>
          <span className="f__part">Part.</span>
          <span className="f__numeral">01</span>
          <span className="f__chapter-title">The Breaking</span>
        </p>
      </div>
    </>
  );
}
