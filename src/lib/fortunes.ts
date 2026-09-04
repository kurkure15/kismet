/**
 * Forty fortunes. The register is the good kind of fortune cookie: warm,
 * aphoristic, occasionally sly. Nothing borrowed from famous people, no
 * astrology, nothing that could land as a dig. Typographic apostrophes,
 * because these are set in a serif and it shows.
 */
export const FORTUNES = [
  'The door you keep checking is already unlocked.',
  'Someone is quietly glad you exist.',
  'Your patience is compounding faster than you think.',
  'Say the smaller true thing first.',
  'A good idea arrives while you wash the dishes.',
  'You are closer than the middle.',
  'The detour is the scenic route.',
  'Trust the version of you that woke up early.',
  'Answer the message you have been avoiding.',
  'Small kindnesses travel further than you will see.',
  'You will soon be overqualified for an old worry.',
  'The work you hid is the work worth showing.',
  'Luck prefers people who are already moving.',
  'Something you planted last year is about to bloom.',
  'Rest is also a form of progress.',
  'The right people will find your handwriting familiar.',
  'You are allowed to change your mind loudly.',
  'An old friend is about to become new again.',
  'Ask for the thing. The worst answer is information.',
  'Your future self is rooting for you, obnoxiously.',
  'Begin badly. Begin anyway.',
  'The best seat is usually the one nobody claimed.',
  'You will win an argument by not having it.',
  'Curiosity has never once made you smaller.',
  'Tomorrow rewards the person who slept tonight.',
  'A stranger will hand you the missing word.',
  'Not every fire needs your attention.',
  'You have outgrown a room you still visit.',
  'The generous move is also the strategic one.',
  'Something unglamorous is about to pay off enormously.',
  'Keep the promise you made in the shower.',
  'Your instincts were right the first time.',
  'Leave earlier. Everything improves.',
  'What you call luck, others call your habits.',
  'You are two conversations away from what you want.',
  'Delight is a skill, and you are practising.',
  'Put your name on it.',
  'A quiet week is not a wasted week.',
  'The map is wrong here. Go anyway.',
  'You will be someone’s good news today.',
] as const;

/**
 * Shuffle bag: every fortune is seen once before any repeats. Lives in module
 * memory only — deliberately not persisted, so a fresh visit starts fresh.
 */
let bag: string[] = [];
let lastDrawn: string | null = null;

function refill() {
  bag = [...FORTUNES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  // Avoid the one case the bag cannot prevent on its own: the last fortune of
  // a round landing again as the first of the next.
  if (bag.length > 1 && bag[bag.length - 1] === lastDrawn) {
    [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
  }
}

export function nextFortune(): string {
  if (bag.length === 0) refill();
  lastDrawn = bag.pop() ?? FORTUNES[0];
  return lastDrawn;
}
