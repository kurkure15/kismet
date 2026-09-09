'use client';

import dynamic from 'next/dynamic';

/**
 * Agentation — click an element on the page, write a note, and copy markdown
 * that carries the selector, the element path and the bounding box, so the
 * feedback lands on the actual code rather than on "the blue thing".
 *
 * Development only, and deliberately so. It is a devDependency, its bundle is
 * 660 KB unminified, and the shipped page is measured on having zero
 * third-party requests. The NODE_ENV check is a literal comparison rather than
 * a runtime one: Next inlines the value, so in a production build this folds
 * to `null` and the dynamic import below is never reachable, which lets the
 * bundler drop the chunk entirely. Verified against the built output.
 *
 * `ssr: false` because the toolbar measures the document as it mounts.
 */
const Agentation =
  process.env.NODE_ENV === 'development'
    ? dynamic(() => import('agentation').then((m) => m.Agentation), {
        ssr: false,
      })
    : null;

export function FeedbackTools() {
  return Agentation ? <Agentation /> : null;
}
