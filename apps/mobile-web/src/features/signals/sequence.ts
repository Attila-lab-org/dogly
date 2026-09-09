export const SIGNAL_BASELINE_MS = 3_000;
export const SIGNAL_PLAYBACK_MS = 2_500;
export const SIGNAL_OBSERVATION_MS = 5_000;
export const SIGNAL_TOTAL_SECONDS = 11;

export type SignalCapturePhase =
  | 'intro'
  | 'baseline'
  | 'playing'
  | 'observing'
  | 'annotating'
  | 'result'
  | 'saved'
  | 'error';

export function phaseProgress(phase: SignalCapturePhase): number {
  switch (phase) {
    case 'intro':
      return 0;
    case 'baseline':
      return 0.2;
    case 'playing':
      return 0.5;
    case 'observing':
      return 0.75;
    case 'annotating':
    case 'result':
    case 'saved':
      return 1;
    case 'error':
      return 0;
  }
}
