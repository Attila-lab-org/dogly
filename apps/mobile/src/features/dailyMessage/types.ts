/**
 * Messaggio quotidiano interattivo — interpretazione giocosa, non traduzione letterale.
 */
export type DailyReaction = 'heart' | 'paw' | 'smile' | null;

export type SafeCareSuggestion =
  | 'play'
  | 'walk'
  | 'rest'
  | 'observe'
  | 'remind';

export interface DailyDogMessage {
  id: string;
  dogId: string;
  dogName: string;
  /** Prima persona giocosa */
  body: string;
  /** Disclaimer obbligatorio */
  disclaimer: string;
  evidence: string[];
  suggestions: SafeCareSuggestion[];
  basedOnEventId: string | null;
  createdAt: string;
}

export const SUGGESTION_LABELS: Record<SafeCareSuggestion, string> = {
  play: 'Gioca insieme',
  walk: 'Proponi una passeggiata',
  rest: 'Lascia riposare',
  observe: 'Osserva ancora',
  remind: 'Imposta un promemoria',
};
