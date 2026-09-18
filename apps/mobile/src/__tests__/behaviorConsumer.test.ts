import { correctionOptions } from '../features/core/correctionOptions';
import { deriveContextBucketHint } from '../features/behavior/contextBucket';

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
  it('preferisce alternative consumer-facing e non espone INSUFFICIENT/AMBIGUOUS', () => {
    const withAlts = correctionOptions('ATTENTION_REQUEST', [
      { intent: 'PLAY_INTERACTION' },
    ]);
    const without = correctionOptions('ATTENTION_REQUEST', []);
    expect(withAlts[0]).toBe('PLAY_INTERACTION');
    expect(without).not.toContain('INSUFFICIENT');
    expect(without).not.toContain('AMBIGUOUS');
  });
});
