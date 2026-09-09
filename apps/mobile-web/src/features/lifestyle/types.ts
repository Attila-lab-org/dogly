/**
 * Tipi "Routine e abitudini" (progressive profiling, brief V2 sez. 7/13).
 * Form amichevole, NON questionario: ogni area ha una scelta singola +
 * "Non so" (valore null = non impostato, resta unknown anche lato backend).
 * Alimentazione: derivata dal cibo attivo (FeedingPeriod), mai chiesta qui.
 */

export const LIFESTYLE_ACTIVITY_VALUES = ['CALM', 'MODERATE', 'VERY_ACTIVE'] as const;
export type LifestyleActivity = (typeof LIFESTYLE_ACTIVITY_VALUES)[number];

export const LIFESTYLE_SLEEP_VALUES = ['REGULAR', 'IRREGULAR'] as const;
export type LifestyleSleep = (typeof LIFESTYLE_SLEEP_VALUES)[number];

export const LIFESTYLE_TIME_ALONE_VALUES = ['LITTLE', 'SOME_HOURS', 'MANY_HOURS'] as const;
export type LifestyleTimeAlone = (typeof LIFESTYLE_TIME_ALONE_VALUES)[number];

export const LIFESTYLE_SOCIAL_VALUES = ['DOGS', 'PEOPLE', 'BOTH', 'LITTLE'] as const;
export type LifestyleSocial = (typeof LIFESTYLE_SOCIAL_VALUES)[number];

export const LIFESTYLE_ENRICHMENT_VALUES = ['TOYS', 'NEW_WALKS', 'NOTHING_SPECIAL'] as const;
export type LifestyleEnrichment = (typeof LIFESTYLE_ENRICHMENT_VALUES)[number];

/**
 * Profilo lifestyle di un cane (mirror di `dog_lifestyle_profiles.routine_json`,
 * brief sez. 8). I campi null restano "non impostati".
 */
export interface LifestyleProfile {
  dogId: string;
  activity: LifestyleActivity | null;
  sleep: LifestyleSleep | null;
  timeAlone: LifestyleTimeAlone | null;
  /** Derivato dal cibo attivo, read-only in questa schermata. */
  feedingLabel: string | null;
  social: LifestyleSocial | null;
  enrichment: LifestyleEnrichment | null;
  updatedAt: string | null;
}

/** Aree editabili dal form (feeding è derivata, non conta nel completamento). */
export const LIFESTYLE_EDITABLE_FIELDS = [
  'activity',
  'sleep',
  'timeAlone',
  'social',
  'enrichment',
] as const;
export type LifestyleEditableField = (typeof LIFESTYLE_EDITABLE_FIELDS)[number];

export const LIFESTYLE_FIELD_TITLES: Record<LifestyleEditableField, string> = {
  activity: 'Attività quotidiana',
  sleep: 'Sonno',
  timeAlone: 'Tempo da solo',
  social: 'Socialità',
  enrichment: 'Arricchimento',
};

export const LIFESTYLE_ACTIVITY_LABELS: Record<LifestyleActivity, string> = {
  CALM: 'Tranquillo',
  MODERATE: 'Moderato',
  VERY_ACTIVE: 'Molto attivo',
};

export const LIFESTYLE_SLEEP_LABELS: Record<LifestyleSleep, string> = {
  REGULAR: 'Regolare',
  IRREGULAR: 'Irregolare',
};

export const LIFESTYLE_TIME_ALONE_LABELS: Record<LifestyleTimeAlone, string> = {
  LITTLE: 'Poco',
  SOME_HOURS: 'Qualche ora',
  MANY_HOURS: 'Molte ore',
};

export const LIFESTYLE_SOCIAL_LABELS: Record<LifestyleSocial, string> = {
  DOGS: 'Cani',
  PEOPLE: 'Persone',
  BOTH: 'Entrambi',
  LITTLE: 'Poco',
};

export const LIFESTYLE_ENRICHMENT_LABELS: Record<LifestyleEnrichment, string> = {
  TOYS: 'Giochi',
  NEW_WALKS: 'Passeggiate nuove',
  NOTHING_SPECIAL: 'Niente di speciale',
};

export function lifestyleAnsweredCount(profile: LifestyleProfile): number {
  return LIFESTYLE_EDITABLE_FIELDS.filter((field) => profile[field] !== null)
    .length;
}

export function isLifestyleComplete(profile: LifestyleProfile): boolean {
  return lifestyleAnsweredCount(profile) === LIFESTYLE_EDITABLE_FIELDS.length;
}

/** Stato completamento compatto (es. "2 di 5", "Completato"). */
export function lifestyleCompletionLabel(profile: LifestyleProfile): string {
  if (isLifestyleComplete(profile)) return 'Completato';
  return `${lifestyleAnsweredCount(profile)} di ${LIFESTYLE_EDITABLE_FIELDS.length}`;
}
