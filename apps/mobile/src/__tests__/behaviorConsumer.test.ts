// @ts-nocheck
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { correctionOptions } from '../features/core/correctionOptions';
import { deriveContextBucketHint } from '../features/behavior/contextBucket';
import {
  behaviorPrudenceCopy,
  consumerEvidenceSections,
  showPrimaryAdvice,
} from '../features/behavior/consumerPresentation';

const resultViewSource = readFileSync(
  resolve(__dirname, '../features/core/components.tsx'),
  'utf8',
);

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

describe('risultato comportamento consumer', () => {
  it('separa osservazioni, contesto owner e memoria personale', () => {
    const sections = consumerEvidenceSections([
      { source: 'OBSERVATION', label: 'Corpo rigido vicino alla ciotola' },
      { source: 'CONTEXT', label: 'Mi hai detto che aveva appena mangiato' },
      { source: 'PERSONAL_PATTERN', label: 'Simile a un episodio confermato' },
      { source: 'SCIENTIFIC_KB', label: 'claim interno' },
    ]);

    expect(sections.observed.map((item) => item.label)).toEqual([
      'Corpo rigido vicino alla ciotola',
    ]);
    expect(sections.ownerContext).toHaveLength(1);
    expect(sections.personalMemory).toHaveLength(1);
    expect(Object.values(sections).flat()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'SCIENTIFIC_KB' }),
      ]),
    );
  });

  it('spiega sempre la prudenza senza percentuali o nomi di band', () => {
    for (const band of ['LOW', 'MEDIUM', 'HIGH', null] as const) {
      const copy = behaviorPrudenceCopy(band);
      expect(copy).toMatch(/lettura|possibil|certezza/i);
      expect(copy).not.toMatch(/LOW|MEDIUM|HIGH|\d+%/);
    }
  });

  it('la safety esclude un secondo consiglio', () => {
    expect(showPrimaryAdvice({ hasSafety: true, hasAdvice: true })).toBe(false);
    expect(showPrimaryAdvice({ hasSafety: false, hasAdvice: true })).toBe(true);
  });

  it('mostra il risultato e rimanda analisi e affidabilità ai dettagli', () => {
    expect(resultViewSource).toContain('Il risultato per {dogName}');
    expect(resultViewSource).toContain('Scopri perché');
    expect(resultViewSource).not.toContain(
      'Quanto è prudente questa lettura',
    );
    for (const detail of [
      'In parole semplici',
      'Cosa ha considerato DOGly',
      'behavior-prudence',
      'what-to-watch',
    ]) {
      expect(resultViewSource.indexOf('Scopri perché')).toBeLessThan(
        resultViewSource.indexOf(detail),
      );
    }
  });
});
