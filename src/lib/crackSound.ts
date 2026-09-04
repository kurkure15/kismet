import { Howl } from 'howler';

const SOURCES = [
  '/sounds/crack-01.mp3',
  '/sounds/crack-02.mp3',
  '/sounds/crack-03.mp3',
  '/sounds/crack-04.mp3',
];

const RATE_MIN = 0.94;
const RATE_MAX = 1.06;

let howls: Howl[] | null = null;
let warned = false;

function warnOnce() {
  if (warned) return;
  warned = true;
  console.warn(
    `kismet: no crack sounds found (expected ${SOURCES.join(', ')}) — cracking silently.`,
  );
}

/**
 * Called from the first real user gesture, which is both when we want the files
 * in memory and the only moment iOS will unlock the audio context. Safe to call
 * repeatedly; only the first call does anything.
 */
export function preloadCrackSounds() {
  if (howls) return;
  howls = SOURCES.map(
    (src) =>
      new Howl({
        src: [src],
        preload: true,
        // Buffered rather than streamed, so playback starts on the same frame
        // as the shard swap instead of a network tick later.
        html5: false,
        onloaderror: warnOnce,
      }),
  );
}

/**
 * Plays one random crack at a randomised rate. Never throws and never waits —
 * a missing or still-loading file just means silence.
 */
export function playCrack() {
  if (!howls) return;
  const loaded = howls.filter((h) => h.state() === 'loaded');
  if (loaded.length === 0) {
    warnOnce();
    return;
  }
  const howl = loaded[Math.floor(Math.random() * loaded.length)];
  const id = howl.play();
  howl.rate(RATE_MIN + Math.random() * (RATE_MAX - RATE_MIN), id);
}
