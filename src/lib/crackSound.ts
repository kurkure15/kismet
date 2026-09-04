import { Howl } from 'howler';

const SOUNDS_DIR = '/sounds';

/**
 * The four crack takes are not one-shots, despite their original names.
 * Measured from the waveforms, three of them hold several separate snaps
 * separated by silence, and only crack-03 opens on its attack — the loudest
 * snap in crack-01 is 1.7 seconds in, so playing from the start would put the
 * sound that far behind the break.
 *
 * So each snap is addressed as a Howler sprite instead: [startMs, lengthMs],
 * taken 8ms before the attack and running past the decay. That fixes the sync
 * and, as a side effect, turns four files into ten distinct cracks.
 *
 * Snaps quieter than half their file's peak are left out — they read as a weak
 * crackle rather than a break. Regenerate these offsets if the files change.
 */
const RECORDINGS = [
  {
    file: 'crack-01.wav',
    // 4 snaps, relative peaks 0.58, 0.54, 1.00, 0.57
    snaps: [
      [342, 185],
      [867, 190],
      [1682, 210],
      [2222, 305],
    ],
  },
  {
    file: 'crack-02.wav',
    // 3 snaps, relative peaks 0.99, 0.66, 1.00
    snaps: [
      [102, 170],
      [337, 365],
      [1212, 235],
    ],
  },
  {
    file: 'crack-03.wav',
    // 1 snap, relative peak 1.00 — the only take that opens on its attack
    snaps: [[17, 235]],
  },
  {
    file: 'crack-04.wav',
    // 2 snaps, relative peaks 1.00, 0.89
    snaps: [
      [117, 380],
      [682, 365],
    ],
  },
] as const;

const RATE_MIN = 0.94;
const RATE_MAX = 1.06;

type Loaded = { howl: Howl; sprite: string };

let howls: Howl[] | null = null;
let clips: Loaded[] = [];
let warned = false;

function warnOnce() {
  if (warned) return;
  warned = true;
  console.warn(
    `kismet: no crack sounds loaded from ${SOUNDS_DIR} — cracking silently.`,
  );
}

/**
 * Called from the first real user gesture, which is both when we want the files
 * in memory and the only moment iOS will unlock the audio context. Safe to call
 * repeatedly; only the first call does anything.
 */
export function preloadCrackSounds() {
  if (howls) return;
  howls = [];
  clips = [];

  for (const recording of RECORDINGS) {
    const sprite: Record<string, [number, number]> = {};
    recording.snaps.forEach(([start, length], i) => {
      sprite[`snap${i}`] = [start, length];
    });

    const howl = new Howl({
      src: [`${SOUNDS_DIR}/${recording.file}`],
      format: ['wav'],
      sprite,
      preload: true,
      // Buffered rather than streamed, so playback starts on the same frame as
      // the shard swap instead of a network tick later.
      html5: false,
      onloaderror: warnOnce,
    });

    howls.push(howl);
    for (const name of Object.keys(sprite)) clips.push({ howl, sprite: name });
  }
}

/**
 * Plays one random snap at a randomised rate. Never throws and never waits — a
 * missing or still-loading file just means silence.
 */
export function playCrack() {
  const ready = clips.filter(({ howl }) => howl.state() === 'loaded');
  if (ready.length === 0) {
    warnOnce();
    return;
  }
  const { howl, sprite } = ready[Math.floor(Math.random() * ready.length)];
  const id = howl.play(sprite);
  howl.rate(RATE_MIN + Math.random() * (RATE_MAX - RATE_MIN), id);
}
