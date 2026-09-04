import { useCallback, useMemo, useReducer } from 'react';

/**
 * The single source of truth for where the toy is.
 *
 *   idle      cookie whole, waiting
 *   tension   being dragged or wobbling from a tap
 *   cracked   broken, pieces in flight or settling, paper not out yet
 *   reading   the fortune is on screen
 *   dismissed paper thrown away, pile still on screen
 *
 * Phase 4 hangs eating off `dismissed`.
 */
export type AppState = 'idle' | 'tension' | 'cracked' | 'reading' | 'dismissed';

export type AppEvent = 'grab' | 'release' | 'crack' | 'reveal' | 'dismiss';

/**
 * Anything not listed is ignored, which keeps the callers honest: a second
 * crack, or a reveal that lands after the paper was already thrown, is a
 * no-op rather than a state to defend against everywhere else.
 */
const TRANSITIONS: Record<AppState, Partial<Record<AppEvent, AppState>>> = {
  idle: { grab: 'tension', crack: 'cracked' },
  tension: { release: 'idle', crack: 'cracked' },
  cracked: { reveal: 'reading' },
  reading: { dismiss: 'dismissed' },
  dismissed: {},
};

function reduce(state: AppState, event: AppEvent): AppState {
  return TRANSITIONS[state][event] ?? state;
}

export function useKismet() {
  const [state, send] = useReducer(reduce, 'idle' as AppState);

  const is = useCallback(
    (...states: AppState[]) => states.includes(state),
    [state],
  );

  return useMemo(
    () => ({
      state,
      send,
      /** The cookie is broken, whatever has happened to the paper since. */
      isBroken: state === 'cracked' || state === 'reading' || state === 'dismissed',
      /** The pile should ignore pointer input. */
      pileLocked: state === 'reading',
      is,
    }),
    [state, is],
  );
}
