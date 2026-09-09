/** A fortune is a sentence. Longer than this and it is a paragraph. */
export const MAX_LENGTH = 120;
export const MIN_LENGTH = 4;

/**
 * Anything that would turn a fortune into a message: links, handles, and
 * runs of digits long enough to be a phone number. This is not moderation —
 * the sheet is moderation — it is a tripwire, so the inbox stays a list of
 * sentences rather than a list of things to delete.
 */
const NOT_A_FORTUNE =
  /https?:\/\/|www\.|\.[a-z]{2,4}(\/|\s|$)|@[\w.]{2,}|\+?\d[\d\s().-]{6,}\d/i;

/** Plain text, one line, one space between words — or nothing. */
export function cleanFortune(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const t = text
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length < MIN_LENGTH || t.length > MAX_LENGTH) return null;
  if (NOT_A_FORTUNE.test(t)) return null;
  return t;
}
