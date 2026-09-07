/**
 * Copy condiviso dei domini core (F1), in italiano (lingua UI, piano).
 * Regole vincolanti:
 * - confidenza SOLO a band LOW/MEDIUM/HIGH, mai percentuali (O-07, sez. 6.1);
 * - wording risultati sempre probabilistico ("sembra / probabilmente /
 *   possibile", sez. 6.1);
 * - stati pipeline con copy rassicurante e zero gergo tecnico (sez. 6, 7.2).
 */
import type {
  BehaviorIntent,
  BehaviorEventStatus,
  ConfidenceBand,
} from '../../contracts/types';
import { BEHAVIOR_INTENT_LABELS } from '../../contracts/types';

/** Pill di confidenza: stile mockup, testo a band (Spec O-07). */
export const CONFIDENCE_BAND_LABELS: Record<ConfidenceBand, string> = {
  LOW: 'Confidenza bassa',
  MEDIUM: 'Confidenza media',
  HIGH: 'Confidenza alta',
};

/**
 * Headline del risultato (mockup-result: "Rocky sembra voler giocare").
 * Le label di tassonomia (sez. 16.2) iniziano già con wording probabilistico;
 * qui vengono ricalibrate con il nome del cane e iniziale minuscola.
 */
export function intentHeadline(
  dogName: string,
  intent: BehaviorIntent | null,
): string {
  if (intent === null || intent === 'INSUFFICIENT') {
    return `Non riesco ancora a capire ${dogName}`;
  }
  const label = BEHAVIOR_INTENT_LABELS[intent];
  return `${dogName} ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

export interface ProcessingStep {
  status: BehaviorEventStatus;
  title: string;
  description: string;
}

/** Copy consumer: gli stati tecnici restano nel motore. */
export function processingStepsFor(dogName: string): ProcessingStep[] {
  return [
    {
      status: 'QUEUED',
      title: 'Guardo il video',
      description: `Sto iniziando a guardare ${dogName}.`,
    },
    {
      status: 'OBSERVING',
      title: 'Riconosco i segnali principali',
      description: `Cerco ciò che può aiutarmi a capire ${dogName}.`,
    },
    {
      status: 'INTERPRETING',
      title: 'Preparo la mia risposta',
      description: 'Manca poco.',
    },
  ];
}

/** Ordine degli step per evidenziare avanzamento/completamento. */
export const PROCESSING_STEP_ORDER: Record<string, number> = {
  QUEUED: 0,
  OBSERVING: 1,
  INTERPRETING: 2,
  COMPLETED: 3,
};
