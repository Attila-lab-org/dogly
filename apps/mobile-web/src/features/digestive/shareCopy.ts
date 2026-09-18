import { sanitizeOwnerCopy } from '../core/copy';

export const DIGESTIVE_VET_SHARE_CTA = 'Invia questa osservazione';

export type DigestiveVetShareCard = {
  title: string;
  message: string;
};

export function buildDigestiveVetShareCard(options: {
  dogName: string;
  headline: string;
  summary: string;
  actionBody?: string | null;
}): DigestiveVetShareCard {
  const personalize = (value: string | null | undefined) =>
    sanitizeOwnerCopy((value ?? '').replace(/Rocky/g, options.dogName));
  const headline = personalize(options.headline);
  const summary = personalize(options.summary);
  const actionBody = personalize(options.actionBody);
  const lines = [
    `Osservazione digestiva di ${options.dogName}`,
    headline,
    summary,
    actionBody,
    `Condiviso da Dogly — un'osservazione di ${options.dogName}, non una diagnosi veterinaria.`,
  ].filter((line) => line.trim().length > 0);
  return {
    title: `Osservazione digestiva di ${options.dogName}`,
    message: lines.join('\n\n'),
  };
}
