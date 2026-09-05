import {
  FORBIDDEN_SIGNAL_COPY,
  SIGNAL_CATEGORIES,
  SIGNAL_HOME_SUBTITLE,
  SIGNAL_HOME_TITLE,
  metaForCategory,
  signalResultSummary,
} from '../features/signals/copy';
import {
  phaseProgress,
  SIGNAL_BASELINE_MS,
  SIGNAL_OBSERVATION_MS,
  SIGNAL_PLAYBACK_MS,
} from '../features/signals/sequence';

describe('Dogly Signals product contract', () => {
  it('usa una CTA sicura e vendibile senza promettere traduzione', () => {
    const copy = `${SIGNAL_HOME_TITLE} ${SIGNAL_HOME_SUBTITLE}`.toLowerCase();
    expect(copy).toContain('modo di rispondere');
    expect(copy).toContain('guidato da dogly');
    for (const forbidden of FORBIDDEN_SIGNAL_COPY) {
      expect(copy).not.toContain(forbidden);
    }
  });

  it('limita la V1 a categorie consumer-safe', () => {
    expect(SIGNAL_CATEGORIES.map((meta) => meta.category)).toEqual([
      'ATTENTION',
      'PLAY',
      'CONTACT',
      'CURIOSITY',
    ]);
    expect(SIGNAL_CATEGORIES.map((meta) => meta.category)).not.toContain('DISTRESS');
    expect(SIGNAL_CATEGORIES.map((meta) => meta.category)).not.toContain('AGONISTIC');
  });

  it('associa sound key e risultato osservabile a ogni categoria', () => {
    for (const meta of SIGNAL_CATEGORIES) {
      expect(meta.soundKey).toMatch(/-01$/);
      expect(meta.observedBehaviors.length).toBeGreaterThan(0);
      expect(meta.resultSummary).not.toMatch(/significa|obbedisce|traduce/i);
    }
    expect(metaForCategory('ATTENTION').soundKey).toBe('attention-soft-01');
  });

  it('genera il risultato soltanto dai comportamenti confermati', () => {
    expect(signalResultSummary('Luna', ['HEAD_TURN', 'EAR_RAISE'])).toBe(
      'Luna ha girato la testa e ha alzato le orecchie.',
    );
    expect(signalResultSummary('Luna', ['NO_VISIBLE_RESPONSE'])).toBe(
      'Luna non ha mostrato una reazione evidente.',
    );
  });

  it('mantiene una sequenza breve e automatica', () => {
    expect(SIGNAL_BASELINE_MS).toBe(3000);
    expect(SIGNAL_PLAYBACK_MS).toBeLessThanOrEqual(3000);
    expect(SIGNAL_OBSERVATION_MS).toBe(5000);
    expect(phaseProgress('playing')).toBeGreaterThan(phaseProgress('baseline'));
  });
});
