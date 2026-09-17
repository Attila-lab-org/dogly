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
import { consumerCopy } from './conversationCopy';

/** Pill di confidenza: stile mockup, testo a band (Spec O-07). */
export const CONFIDENCE_BAND_LABELS: Record<ConfidenceBand, string> = {
  LOW: 'Non del tutto chiaro',
  MEDIUM: 'Segnali abbastanza chiari',
  HIGH: 'Segnali abbastanza chiari',
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
    return 'Non ho abbastanza elementi per capirlo bene';
  }
  const label = BEHAVIOR_INTENT_LABELS[intent];
  return `${dogName} ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

const DOG_VOICE_LINES: Record<BehaviorIntent, string> = {
  PLAY_INTERACTION: '«Giochiamo insieme?»',
  ATTENTION_REQUEST: '«Ehi, guardami un momento.»',
  OUTSIDE_REQUEST: '«Possiamo uscire?»',
  ALERT_VIGILANCE: '«C’è qualcosa qui: l’hai notato?»',
  DISCOMFORT_AVOIDANCE: '«Non mi sento a mio agio: lasciami spazio.»',
  FEAR_INSECURITY: '«Non mi sento sicuro: resta vicino senza forzarmi.»',
  HIGH_AROUSAL: '«Sono molto carico: aiutami a rallentare.»',
  FRUSTRATION: '«Non riesco ad arrivare a ciò che vorrei.»',
  RELAX_REST: '«Qui mi sento tranquillo.»',
  RESOURCE_TENSION: '«Per me è importante: lasciami un po’ di spazio.»',
  AMBIGUOUS: '«Ti sto mostrando qualcosa, ma serve più contesto.»',
  INSUFFICIENT: '«Non voglio inventare: fammi vedere meglio.»',
};

/** Human-readable mediation, explicitly framed as a possible translation. */
export function dogVoiceLine(intent: BehaviorIntent | null): string {
  return DOG_VOICE_LINES[intent ?? 'INSUFFICIENT'];
}

/** Ripulisce anche i risultati storici creati prima del copy consumer. */
export function sanitizeOwnerCopy(value: string): string {
  return consumerCopy(value)
    .replace(/\bPLAY_INTERACTION\b/g, 'invito al gioco')
    .replace(/\bATTENTION_REQUEST\b/g, 'richiesta di attenzione')
    .replace(/\bRELAX_REST\b/g, 'momento di relax')
    .replace(
      /richiesta di attenzione\/gioco/gi,
      'richiesta di attenzione o invito al gioco',
    )
    .replace(/dettagli contestuali/gi, 'qualche dettaglio in più')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^([a-zà-ù])/, (letter) => letter.toLocaleUpperCase('it-IT'))
    .replace(
      /([.!?]\s+)([a-zà-ù])/g,
      (_, separator: string, letter: string) =>
        `${separator}${letter.toLocaleUpperCase('it-IT')}`,
    );
}

export interface ProcessingStep {
  id: 'analyze' | 'signals' | 'personal' | 'answer';
  status: BehaviorEventStatus;
  title: string;
  description: string;
}

/** Copy consumer: gli stati tecnici restano nel motore. */
export function processingStepsFor(dogName: string): ProcessingStep[] {
  return [
    {
      id: 'analyze',
      status: 'QUEUED',
      title: 'Guardo il momento',
      description: `Sto guardando ${dogName}.`,
    },
    {
      id: 'signals',
      status: 'OBSERVING',
      title: 'Osservo i segnali principali',
      description: `Cerco ciò che può aiutarmi a capire ${dogName}.`,
    },
    {
      id: 'personal',
      status: 'INTERPRETING',
      title: `Li confronto con quello che so di ${dogName}`,
      description: 'Considero il suo contesto e ciò che hai già confermato.',
    },
    {
      id: 'answer',
      status: 'COMPLETED',
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
