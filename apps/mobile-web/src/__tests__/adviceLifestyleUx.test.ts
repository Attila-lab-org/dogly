import { mapApiAdviceItem } from '../features/advice/map';
import { selectAdvice } from '../features/advice/logic';
import {
  __resetLifestyleState,
  getLifestyleProfileLocal,
  saveLifestyleProfileLocal,
} from '../features/lifestyle/store';
import { buildBehaviorShareCard } from '../features/behavior/shareCopy';
import type { BehaviorEventResult } from '../contracts/types';

describe('Advice Engine consumer surfaces', () => {
  it('maps the real backend AdviceItem shape', () => {
    expect(
      mapApiAdviceItem({
        code: 'ADVICE_DISTANCE_CHOICE',
        category: 'LOW_RISK_MANAGEMENT',
        action: 'Aumenta la distanza e lascia una scelta.',
        rationale: 'La postura mostra tensione.',
        follow_up: 'Osserva se si rilassa.',
        risk: 'LOW',
      }),
    ).toEqual({
      code: 'ADVICE_DISTANCE_CHOICE',
      category: 'LOW_RISK_MANAGEMENT',
      actionText: 'Aumenta la distanza e lascia una scelta.',
      whyText: 'La postura mostra tensione.',
      followUp: 'Osserva se si rilassa.',
      risk: 'LOW',
    });
  });

  it('shows a backend safety-management advice but never invents a mock one', () => {
    const result = {
      status: 'COMPLETED',
      primary_intent: 'FEAR_INSECURITY',
    } as const;
    const apiAdvice = mapApiAdviceItem({
      code: 'ADVICE_DISTANCE_CHOICE',
      category: 'LOW_RISK_MANAGEMENT',
      action: 'Aumenta la distanza.',
      rationale: 'È una scelta prudente.',
      risk: 'LOW',
    });
    expect(selectAdvice(result, { apiAdvice, useMockCatalog: false })).toEqual(
      apiAdvice,
    );
    expect(
      selectAdvice(result, { apiAdvice: null, useMockCatalog: true }),
    ).toBeNull();
  });
});

describe('Lifestyle progressive profile', () => {
  beforeEach(__resetLifestyleState);

  it('keeps unknown fields unknown while saving one answer', () => {
    const profile = saveLifestyleProfileLocal('dog-new', {
      activity: 'MODERATE',
    });
    expect(profile.activity).toBe('MODERATE');
    expect(profile.sleep).toBeNull();
    expect(getLifestyleProfileLocal('dog-new')).toEqual(profile);
  });
});

describe('Branded share copy fallback', () => {
  it('contains no raw media or technical path', () => {
    const result: BehaviorEventResult = {
      eventId: 'event-1',
      dogId: 'dog-1',
      status: 'COMPLETED',
      primary_intent: 'PLAY_INTERACTION',
      confidence_band: 'MEDIUM',
      consumer_summary: 'Sembra disponibile a giocare.',
      evidence: [{ source: 'OBSERVATION', label: 'Movimenti morbidi' }],
      alternatives: [],
      feedback: null,
      schema_version: 'v1',
      policy_version: 'v1',
      taxonomy_version: 'v1',
      created_at: '2026-09-06T00:00:00Z',
      completed_at: '2026-09-06T00:00:10Z',
    };
    const card = buildBehaviorShareCard(result, 'Luna');
    expect(card.message).toContain('Luna');
    expect(card.message).toContain('non una diagnosi');
    expect(card.message).not.toMatch(/storage|signed|https?:\/\//i);
  });
});
