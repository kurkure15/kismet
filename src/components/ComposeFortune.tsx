'use client';

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { animate, useMotionValue, useSpring } from 'motion/react';
import { ENTER_SPRING, type PaperHandle } from '@/components/FortunePaper';
import { cleanFortune, MAX_LENGTH } from '@/lib/inbox';
import { playPaperIn, playPaperThrow } from '@/lib/paperSound';

/** The sheet's resting tilt, the same as a fortune's. */
const REST_ROTATION = -2;
/** Rolled up again, it tips back to how a tube stands in the pile. */
const ROLLED_ROTATION = -8;
/** Rolling up: the same softer spring the pull uses. */
const ROLL_SPRING = { stiffness: 92, damping: 17, mass: 1 } as const;
/** Rolling away: off the right of the page, a little upward, spinning. */
const AWAY_MS = 620;
const AWAY_SPIN = 34;
const AWAY_LIFT = 60;
/** Room past the edge so it is gone, not clipped. */
const CLEARANCE = 400;

const REJECTED = 'Just a sentence — no links, no numbers.';
export const TOAST_SENT = 'Sent. If it is a good one, someone will see it.';
export const TOAST_FAILED = 'That did not go through. Try again in a moment.';

/**
 * Writing a fortune for someone else.
 *
 * The paper is the same paper — a PaperRoll in the paper canvas, following
 * the handle published here — opened flat, with a native text field laid
 * over it so typing has a caret, a selection and a phone keyboard. Send
 * prints what was written onto the sheet, rolls it back up, and rolls it off
 * the page; the words go to the inbox tab of the sheet for a person to read.
 *
 * This component never says whether the fortune was accepted, because that
 * is not decided here. It says it was sent.
 */
export function ComposeFortune({
  handle,
  reducedMotion,
  onPrint,
  onDone,
}: {
  handle: React.RefObject<PaperHandle | null>;
  reducedMotion: boolean;
  /** What to print on the paper, once there is something to print. */
  onPrint: (text: string) => void;
  /** Over, one way or the other. A message to show, or nothing if cancelled. */
  onDone: (toast: string | null) => void;
}) {
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const x = useSpring(dragX, { stiffness: 700, damping: 42, mass: 0.9 });
  const y = useSpring(dragY, { stiffness: 700, damping: 42, mass: 0.9 });
  const rotate = useMotionValue(REST_ROTATION);
  const opacity = useMotionValue(0);
  const unroll = useMotionValue(1);

  useImperativeHandle(
    handle,
    () => ({ unroll, x, y, rotate, opacity }),
    [unroll, x, y, rotate, opacity],
  );

  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');

  // The field grows to what is written, up to the sheet's height, so a long
  // fortune is never cut off at the second line.
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const finished = useRef(false);

  // Enter: the sheet comes up from just below its place and settles, open.
  useEffect(() => {
    if (reducedMotion) {
      animate(opacity, 1, { duration: 0.2, ease: 'easeOut' });
    } else {
      dragY.jump(48);
      y.jump(48);
      animate(dragY, 0, { type: 'spring', ...ENTER_SPRING });
      animate(opacity, 1, { duration: 0.22, ease: 'easeOut' });
    }
    // Focus arrives a beat later, so the keyboard on a phone does not jump
    // the layout while the sheet is still settling.
    const timer = window.setTimeout(() => field.current?.focus(), 260);
    return () => window.clearTimeout(timer);
    // Runs once, on mount, for the reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = (toast: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(toast);
  };

  const cancel = () => {
    if (sending) return;
    animate(opacity, 0, { duration: 0.18, ease: 'easeOut' }).then(() =>
      finish(null),
    );
  };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (sending) return;
    const clean = cleanFortune(text);
    if (!clean) {
      setNote(REJECTED);
      return;
    }

    setSending(true);
    setNote('');
    onPrint(clean);

    // The request and the paper leave at the same time; whichever is slower,
    // the toast waits for both.
    const request = fetch('/api/fortunes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: clean }),
      keepalive: true,
    })
      .then((res) => res.ok)
      .catch(() => false);

    if (!reducedMotion) {
      // Roll it back up, the way it came, then send it off the page.
      playPaperIn();
      await Promise.all([
        animate(unroll, 0, { type: 'spring', ...ROLL_SPRING }),
        animate(rotate, ROLLED_ROTATION, { type: 'spring', ...ROLL_SPRING }),
      ]);
      playPaperThrow();
      const ease = [0.16, 0.7, 0.35, 1] as const;
      const seconds = AWAY_MS / 1000;
      await Promise.all([
        animate(dragX, window.innerWidth / 2 + CLEARANCE, {
          duration: seconds,
          ease,
        }),
        animate(dragY, -AWAY_LIFT, { duration: seconds, ease }),
        animate(rotate, ROLLED_ROTATION + AWAY_SPIN, { duration: seconds, ease }),
        animate(opacity, 0, {
          duration: seconds * 0.4,
          delay: seconds * 0.55,
          ease: 'linear',
        }),
      ]);
    } else {
      await animate(opacity, 0, { duration: 0.2, ease: 'easeOut' });
    }

    finish((await request) ? TOAST_SENT : TOAST_FAILED);
  };

  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <div className={`compose${sending ? ' is-sending' : ''}`}>
      <form className="compose__sheet" onSubmit={send}>
        <textarea
          ref={field}
          className="compose__field"
          value={text}
          maxLength={MAX_LENGTH}
          rows={1}
          placeholder="Write a good fortune for someone"
          aria-label="Write a good fortune for someone"
          autoComplete="off"
          spellCheck
          enterKeyHint="send"
          disabled={sending}
          onChange={(e) => {
            setText(e.target.value);
            if (note) setNote('');
          }}
          onKeyDown={onKey}
        />
        <button
          className="compose__send"
          type="submit"
          aria-label="Send"
          disabled={sending || !text.trim()}
        >
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
            <path
              d="M3 10h13M11 5l5 5-5 5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </form>
      <p className="compose__note" aria-live="polite">
        {note}
      </p>
    </div>
  );
}
