export type SignalCategory = 'PLAY' | 'ATTENTION' | 'CURIOSITY' | 'CONTACT';

export type SignalMapState = 'DISCOVERING' | 'LEARNING' | 'RECURRING';

export type SignalObservedBehavior =
  | 'HEAD_TURN'
  | 'EAR_RAISE'
  | 'APPROACH'
  | 'PLAY_READY'
  | 'STILL_ATTENTIVE'
  | 'NO_VISIBLE_RESPONSE';

export type SignalFeedback = 'YES' | 'NO' | 'UNKNOWN';

export interface SignalExperiment {
  id: string;
  dogId: string;
  category: SignalCategory;
  soundKey: string;
  observedBehaviors: SignalObservedBehavior[];
  reactionLatencyMs: number | null;
  resultSummary: string;
  ownerFeedback: SignalFeedback | null;
  createdAt: string;
}

export interface SignalMapEntry {
  dogId: string;
  category: SignalCategory;
  state: SignalMapState;
  attemptCount: number;
  confirmCount: number;
  contradictCount: number;
  unknownCount: number;
  lastSummary: string | null;
  updatedAt: string;
}

export interface SignalCategoryMeta {
  category: SignalCategory;
  title: string;
  shortTitle: string;
  description: string;
  icon: 'tennisball-outline' | 'eye-outline' | 'sparkles-outline' | 'paw-outline';
  soundKey: string;
  resultSummary: string;
  observedBehaviors: SignalObservedBehavior[];
}
