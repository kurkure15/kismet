import { Howl } from 'howler';

/**
 * Sprited to their attacks, like every other recording in this project: the
 * files carry up to 94ms of silence before the bite, and crunch-01 holds two
 * separate chews with a second at ~1s that we do not want.
 *
 * crunch-01 is reserved for the first bite of each cookie — it is the long hard
 * one, and it only reads as special if it is not in the rotation.
 */
const FIRST_BITE = {
  file: '/sounds/crunch-01.mp3',
  sprite: [24, 400] as [number, number],
};

const BITES = [
  { file: '/sounds/crunch-02.mp3', sprite: [26, 620] as [number, number] },
  { file: '/sounds/crunch-03.mp3', sprite: [15, 620] as [number, number] },
  { file: '/sounds/crunch-04.mp3', sprite: [4, 620] as [number, number] },
  { file: '/sounds/crunch-05.mp3', sprite: [86, 540] as [number, number] },
];

const POP = { file: '/sounds/pop.mp3', sprite: [0, 700] as [number, number] };

const RATE_MIN = 0.94;
const RATE_MAX = 1.06;

let firstBite: Howl | null = null;
let bites: Howl[] = [];
let pop: Howl | null = null;
let lastBite = -1;
let warned = false;

function warnOnce() {
  if (warned) return;
  warned = true;
  console.warn('kismet: crunch sounds unavailable — eating silently.');
}

function make(file: string, sprite: [number, number]) {
  return new Howl({
    src: [file],
    format: ['mp3'],
    sprite: { clip: sprite },
    preload: true,
    html5: false,
    onloaderror: warnOnce,
  });
}

/** Called on the first user gesture, alongside the other preloads. */
export function preloadCrunchSounds() {
  if (firstBite) return;
  firstBite = make(FIRST_BITE.file, FIRST_BITE.sprite);
  bites = BITES.map((b) => make(b.file, b.sprite));
  pop = make(POP.file, POP.sprite);
}

function playClip(howl: Howl | null, rate = true) {
  if (!howl || howl.state() !== 'loaded') {
    warnOnce();
    return;
  }
  const id = howl.play('clip');
  if (rate) howl.rate(RATE_MIN + Math.random() * (RATE_MAX - RATE_MIN), id);
}

/**
 * One crunch per bite. The pool never plays the same file twice running, so
 * rapid tapping layers rather than stutters on one sample.
 */
export function playCrunch(isFirstBite: boolean) {
  if (isFirstBite) {
    playClip(firstBite);
    return;
  }
  const loaded = bites.filter((h) => h.state() === 'loaded');
  if (loaded.length === 0) {
    warnOnce();
    return;
  }
  let index = Math.floor(Math.random() * loaded.length);
  if (loaded.length > 1 && index === lastBite) {
    index = (index + 1) % loaded.length;
  }
  lastBite = index;
  playClip(loaded[index]);
}

export function playPop() {
  playClip(pop, false);
}
