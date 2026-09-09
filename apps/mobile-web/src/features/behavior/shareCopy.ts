import type { BehaviorEventResult } from '../../contracts/types';
import { intentHeadline } from '../core/copy';

export type BehaviorShareCard = {
  title: string;
  message: string;
};

export function buildBehaviorShareCard(
  result: BehaviorEventResult,
  dogName: string,
): BehaviorShareCard {
  // FIX 3.9: tolerate a null summary (API omitted it) without inventing one.
  const personalize = (copy: string | null | undefined) =>
    (copy ?? '').replace(/Rocky/g, dogName);
  const lines = [intentHeadline(dogName, result.primary_intent)];
  if (result.evidence.length > 0) {
    lines.push('', 'Segnali osservati:');
    for (const item of result.evidence) {
      lines.push(`• ${personalize(item.label)}`);
    }
  }
  const summaryLine = personalize(result.consumer_summary);
  lines.push(
    '',
    ...(summaryLine ? [summaryLine] : []),
    '',
    `Condiviso da Dogly — un'osservazione di ${dogName}, non una diagnosi.`,
  );
  return {
    title: `Come sta ${dogName}`,
    message: lines.join('\n'),
  };
}
