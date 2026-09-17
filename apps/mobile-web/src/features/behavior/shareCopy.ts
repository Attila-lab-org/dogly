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
  const personalize = (copy: string | null | undefined) =>
    (copy ?? '').replace(/Rocky/g, dogName);
  const headline =
    personalize(result.consumer_headline) ||
    intentHeadline(dogName, result.primary_intent);
  const lines = [headline];
  const summaryLine = personalize(result.consumer_summary);
  lines.push(
    '',
    ...(summaryLine ? [summaryLine] : []),
    '',
    `Condiviso da Dogly — un'osservazione di ${dogName}, non una diagnosi.`,
  );
  return {
    title: `Cosa ho osservato di ${dogName}`,
    message: lines.join('\n'),
  };
}
