'use client';

import { useEffect, useState } from 'react';
import { placeName } from '@/lib/place';

type Eat = { at: number; country: string };

/** How often to ask. The server answers from a ten-second cache anyway. */
const POLL_MS = 12_000;
/** Older than this and it is not "just" any more; the line goes quiet. */
const FRESH_MS = 15 * 60_000;

function ago(at: number, now: number) {
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return 'a minute ago';
  return `${minutes} minutes ago`;
}

/**
 * "Someone in Japan ate a cookie just now." The one line on the sheet that
 * admits other people exist. It knows a country and a time and nothing else,
 * and it only speaks when there is something recent to say.
 */
export function EatLine({ className }: { className: string }) {
  const [latest, setLatest] = useState<Eat | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let timer = 0;
    let stopped = false;

    const ask = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/eats', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { eats?: Eat[] };
        if (stopped) return;
        setLatest(data.eats?.[0] ?? null);
        setNow(Date.now());
      } catch {
        // The line stays as it was. It is not important enough to complain.
      }
    };

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        await ask();
        schedule();
      }, POLL_MS);
    };

    const wake = () => {
      if (document.visibilityState === 'visible') {
        void ask();
        schedule();
      }
    };

    void ask();
    schedule();
    document.addEventListener('visibilitychange', wake);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
    };
  }, []);

  const fresh = latest && now - latest.at < FRESH_MS;
  const place = latest ? placeName(latest.country) : '';

  return (
    <p className={`${className}${fresh ? ' is-on' : ''}`} aria-live="polite">
      {fresh && latest
        ? `Someone${place ? ` in ${place}` : ', somewhere,'} ate a cookie ${ago(latest.at, now)}.`
        : ''}
    </p>
  );
}
