/**
 * Condivisione risultato behavior: card testuale sanitizzata (UX_REFERENCE).
 * MAI raw video, path o URL firmati: solo headline, band di confidenza in
 * parole (mai %, O-07) ed evidence già mostrate all'utente.
 */
import { Share } from 'react-native';
import type { BehaviorEventResult } from '../../contracts/types';
import { CONFIDENCE_BAND_LABELS, intentHeadline } from '../core/copy';

export type BehaviorShareCard = {
  title: string;
  message: string;
};

export function buildBehaviorShareCard(
  result: BehaviorEventResult,
  dogName: string,
): BehaviorShareCard {
  const personalize = (copy: string) => copy.replace(/Rocky/g, dogName);
  const lines = [
    intentHeadline(dogName, result.primary_intent),
    CONFIDENCE_BAND_LABELS[result.confidence_band],
  ];
  if (result.evidence.length > 0) {
    lines.push('', 'Segnali osservati:');
    for (const item of result.evidence) {
      lines.push(`• ${personalize(item.label)}`);
    }
  }
  lines.push(
    '',
    personalize(result.consumer_summary),
    '',
    `Condiviso da Dogly — un'osservazione di ${dogName}, non una diagnosi.`,
  );
  return {
    title: `Come sta ${dogName}`,
    message: lines.join('\n'),
  };
}

/** Share sheet nativo testuale. Ritorna false se annullata/fallita. */
export async function shareBehaviorResult(
  result: BehaviorEventResult,
  dogName: string,
): Promise<boolean> {
  const card = buildBehaviorShareCard(result, dogName);
  try {
    await Share.share({ title: card.title, message: card.message });
    return true;
  } catch {
    return false;
  }
}
