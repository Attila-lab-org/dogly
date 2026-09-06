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
