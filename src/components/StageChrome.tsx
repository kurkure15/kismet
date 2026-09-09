'use client';

import { useEffect, useState } from 'react';

/**
 * Which plate the sheet is printed with. Derived from the state machine plus
 * one extra beat: `eaten` is the pause after the last shard goes and before
 * the next cookie arrives, which is the only moment the centre of the sheet
 * is empty enough to carry a 160px numeral.
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
 * from them is which plate to print and how many cookies are gone.
 */
export function StageChrome({
  plate,
  eaten,
}: {
  plate: Plate;
  /** Cookies finished so far. */
  eaten: number;
}) {
  const [hintGone, setHintGone] = useState(false);
  const [quiet, setQuiet] = useState(false);

  // The hint answers the only question a first visit has, and once the answer
  // is obvious it should never return. Memory only, so a reload starts fresh.
  useEffect(() => {
    if (hintGone) return;
    const dismiss = () => setHintGone(true);
    window.addEventListener('pointerdown', dismiss, { once: true });
    return () => window.removeEventListener('pointerdown', dismiss);
  }, [hintGone]);

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
  const after = plate === 'eating' || plate === 'eaten';

  // The pile empties before `eaten` is bumped for the fresh cookie, so during
  // the beat this plate is printed the finished count is one ahead of it.
  const tally = String(eaten + 1).padStart(2, '0');

  return (
    <>
      <div className="grain" aria-hidden="true" />

      <div className={`plate${quiet ? ' is-quiet' : ''}`}>
        {/* --- plate 1 · idle --- */}
        <p className={f('label', idle || after)}>
          Fortune
          <br />
          Telling
        </p>

        <p className={f('fineprint', idle)}>
          One cookie, one fortune.
          <br />
          Drag it, or tap it three times.
          <br />
          Read whatever falls out.
          <br />
          Then eat the evidence.
        </p>

        <p className={f('credit', idle)}>
          ANKUR
          <br />
          YADAV
        </p>

        <p className={f('statement', idle)}>
          CRACK<span className="f__statement-tail"> AND FIND OUT</span>
        </p>

        <p className={f('wordmark', idle)}>KISMET</p>

        <p className={f('hint', idle && !hintGone)}>d r a g</p>

        <div className={f('chip', idle || after)} aria-hidden="true" />

        {/* --- plate 2 · cracked --- */}
        <div className={f('bar', broken)} aria-hidden="true" />

        <p className={f('chapter', broken)}>
          <span className="f__part">Part.</span>
          <span className="f__numeral">01</span>
          <span className="f__chapter-title">The Breaking</span>
        </p>

        {/* --- plate 3 · reading --- */}
        <div className={f('vertbox', plate === 'reading')}>
          <span>KISMET</span>
        </div>

        <p className={f('meta', plate === 'reading')}>
          <span className="f__meta-head">
            Happen
            <br />
            Ending
          </span>
          <span className="f__meta-body">
            Every fortune was printed before you arrived.
          </span>
        </p>

        {/* --- plate 4 · eaten --- */}
        <p className={f('count', plate === 'eaten')} aria-live="polite">
          <span className="f__no">No.</span>
          <span className="f__tally">{tally}</span>
          <span className="f__accepted">FATE ACCEPTED</span>
        </p>
      </div>
    </>
  );
}
