import { Howl } from 'howler';

/**
 * Like the crack recordings, these two files each hold several takes separated
 * by silence, so neither opens on its sound: paper-in's first flutter starts at
 * 455ms and paper-throw's best take is 2.5 seconds in. Each is addressed as a
 * sprite of [startMs, lengthMs] taken just before the attack.
 *
 * paper-in  takes at 455ms (peak 0.68), 1885ms (0.60), 3830ms (1.00)
 *           the first is used: short, and a rustle rather than a crumple
 * paper-throw takes at 130ms (0.14), 960ms (0.52), 2540ms (1.00), 3115ms (0.22)
 *           the third is used: the only one with a real flick to it
 */
const CLIPS = {
  in: { file: '/sounds/paper-in.mp3', sprite: [447, 620] as [number, number] },
  throw: {
    file: '/sounds/paper-throw.mp3',
    sprite: [2532, 385] as [number, number],
  },
};

type Key = keyof typeof CLIPS;

const howls: Partial<Record<Key, Howl>> = {};
let warned = false;

function warnOnce() {
  if (warned) return;
  warned = true;
  console.warn('kismet: paper sounds unavailable — continuing silently.');
}

/** Called on the first user gesture, alongside the crack preload. */
export function preloadPaperSounds() {
  if (howls.in) return;
  (Object.keys(CLIPS) as Key[]).forEach((key) => {
    howls[key] = new Howl({
      src: [CLIPS[key].file],
      format: ['mp3'],
      sprite: { clip: CLIPS[key].sprite },
      preload: true,
      html5: false,
      onloaderror: warnOnce,
    });
  });
}

function play(key: Key) {
  const howl = howls[key];
  if (!howl || howl.state() !== 'loaded') {
    warnOnce();
    return;
  }
  howl.play('clip');
}

export const playPaperIn = () => play('in');
export const playPaperThrow = () => play('throw');
