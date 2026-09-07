import { correctionOptions } from '../features/core/correctionOptions';
import { deriveContextBucketHint } from '../features/behavior/contextBucket';
import { contextAnswersForQuestion } from '../features/behavior/contextQuestion';

describe('deriveContextBucketHint', () => {
  it('di notte suggerisce REST, di giorno lascia UNKNOWN al backend', () => {
    expect(deriveContextBucketHint(new Date(2026, 8, 7, 23, 30))).toBe('REST');
    expect(deriveContextBucketHint(new Date(2026, 8, 7, 11, 0))).toBe('UNKNOWN');
  });
});

describe('correctionOptions after Non proprio', () => {
  it('mette prima le alternative del reasoner e esclude il primario', () => {
    const options = correctionOptions('ATTENTION_REQUEST', [
      { intent: 'OUTSIDE_REQUEST' },
      { intent: 'PLAY_INTERACTION' },
    ]);
    expect(options[0]).toBe('OUTSIDE_REQUEST');
    expect(options).not.toContain('ATTENTION_REQUEST');
    expect(options.length).toBeGreaterThanOrEqual(3);
    expect(options.length).toBeLessThanOrEqual(5);
  });
});

describe('contextAnswersForQuestion', () => {
  it('mappa la domanda sulla porta senza inventare un contesto generico', () => {
    expect(contextAnswersForQuestion('Eravate vicino alla porta?')).toEqual([
      { label: 'Sì', contextBucket: 'DOOR_EXIT' },
      { label: 'No', contextBucket: 'HOME' },
    ]);
    expect(contextAnswersForQuestion('Che cosa è successo?')).toEqual([]);
  });
});
