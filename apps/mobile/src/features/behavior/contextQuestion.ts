import type { ContextBucket } from '../../contracts/types';

export type ContextAnswer = {
  label: string;
  /** null = l'utente nega il contesto suggerito: non sovrascrivere. */
  contextBucket: ContextBucket | null;
};

/**
 * Closed one-tap answers for questions whose meaning maps safely to a
 * ContextBucket. Unknown generated questions remain visible but are not
 * converted into a guessed context. "No" never invents HOME.
 */
export function contextAnswersForQuestion(
  question: string | null | undefined,
): ContextAnswer[] {
  const normalized = (question ?? '').toLocaleLowerCase('it-IT');
  if (/porta|uscire|guinzaglio/.test(normalized)) {
    return [
      { label: 'Sì', contextBucket: 'DOOR_EXIT' },
      { label: 'No', contextBucket: null },
    ];
  }
  if (/ciotola|cibo|mangi/.test(normalized)) {
    return [
      { label: 'Sì', contextBucket: 'FEEDING' },
      { label: 'No', contextBucket: null },
    ];
  }
  if (/gioc|palla|giocattolo/.test(normalized)) {
    return [
      { label: 'Sì', contextBucket: 'PLAY' },
      { label: 'No', contextBucket: null },
    ];
  }
  if (/passegg|cammin|fuori/.test(normalized)) {
    return [
      { label: 'Sì', contextBucket: 'WALK' },
      { label: 'No', contextBucket: null },
    ];
  }
  if (/altro cane|altri cani/.test(normalized)) {
    return [
      { label: 'Sì', contextBucket: 'OTHER_DOG' },
      { label: 'No', contextBucket: null },
    ];
  }
  return [];
}
