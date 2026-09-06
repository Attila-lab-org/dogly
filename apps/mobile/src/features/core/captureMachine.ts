/**
 * Macchina a stati della cattura video comportamentale (Spec V1 sez. 6, 13).
 * Pura e testabile: la schermata behavior/capture la guida con timer reali.
 *
 * Contratto di cattura V1 (sez. 13):
 * - durata target 5–20 s; hard cap 20 s (stop automatico);
 * - sotto il minimo utile → avviso "too short", niente upload;
 * - permesso camera just-in-time; mic separato: se negato si continua
 *   video-only con evidenza ridotta (mai bloccante, sez. 13.1).
 */

/** Durata minima utile in secondi (sotto → avviso "troppo corto"). */
export const CAPTURE_MIN_SECONDS = 5;
/** Hard cap in secondi: la registrazione si ferma da sola. */
export const CAPTURE_MAX_SECONDS = 20;

export type CapturePhase =
  | 'permission_denied'
  | 'ready'
  | 'recording'
  | 'too_short'
  | 'completed';

export interface CaptureState {
  phase: CapturePhase;
  /** Secondi registrati nella sessione corrente */
  elapsedSeconds: number;
  /** Mic negato: analisi video-only con evidenza ridotta (sez. 13) */
  audioDegraded: boolean;
}

export type CaptureEvent =
  | { type: 'PERMISSION_GRANTED'; micGranted: boolean }
  | { type: 'PERMISSION_DENIED' }
  | { type: 'START' }
  | { type: 'TICK' }
  | { type: 'STOP' }
  | { type: 'RESET' };

export const initialCaptureState: CaptureState = {
  phase: 'permission_denied',
  elapsedSeconds: 0,
  audioDegraded: false,
};

export function captureReducer(
  state: CaptureState,
  event: CaptureEvent,
): CaptureState {
  switch (event.type) {
    case 'PERMISSION_GRANTED':
      if (
        state.phase === 'recording' ||
        state.phase === 'completed' ||
        state.phase === 'too_short'
      ) {
        return { ...state, audioDegraded: !event.micGranted };
      }
      return {
        phase: 'ready',
        elapsedSeconds: 0,
        audioDegraded: !event.micGranted,
      };
    case 'PERMISSION_DENIED':
      return { ...state, phase: 'permission_denied' };
    case 'START':
      if (state.phase !== 'ready' && state.phase !== 'too_short') return state;
      return { ...state, phase: 'recording', elapsedSeconds: 0 };
    case 'TICK': {
      if (state.phase !== 'recording') return state;
      const elapsed = state.elapsedSeconds + 1;
      // Hard cap 20 s: stop automatico, clip valida (sez. 13 Duration)
      if (elapsed >= CAPTURE_MAX_SECONDS) {
        return { ...state, phase: 'completed', elapsedSeconds: elapsed };
      }
      return { ...state, elapsedSeconds: elapsed };
    }
    case 'STOP': {
      if (state.phase !== 'recording') return state;
      // Sotto il minimo utile: avviso, niente upload (sez. 6/13)
      if (state.elapsedSeconds < CAPTURE_MIN_SECONDS) {
        return { ...state, phase: 'too_short' };
      }
      return { ...state, phase: 'completed' };
    }
    case 'RESET':
      return {
        ...state,
        phase: state.phase === 'permission_denied' ? 'permission_denied' : 'ready',
        elapsedSeconds: 0,
      };
    default:
      return state;
  }
}

/** Label timer mm:ss per la UI di registrazione. */
export function formatCaptureTimer(elapsedSeconds: number): string {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
