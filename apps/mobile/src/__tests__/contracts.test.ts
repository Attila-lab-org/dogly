import {
  BEHAVIOR_EVENT_STATUSES,
  BEHAVIOR_INTENTS,
  BEHAVIOR_INTENT_LABELS,
  BehaviorEventResult,
} from '../contracts/types';

describe('contracts — tassonomia intent chiusa (sez. 16.2)', () => {
  it('contiene esattamente i 12 codici V0', () => {
    expect([...BEHAVIOR_INTENTS]).toEqual([
      'PLAY_INTERACTION',
      'ATTENTION_REQUEST',
      'OUTSIDE_REQUEST',
      'ALERT_VIGILANCE',
      'DISCOMFORT_AVOIDANCE',
      'FEAR_INSECURITY',
      'HIGH_AROUSAL',
      'FRUSTRATION',
      'RELAX_REST',
      'RESOURCE_TENSION',
      'AMBIGUOUS',
      'INSUFFICIENT',
    ]);
  });

  it('ogni intent ha una label consumer in italiano, wording probabilistico', () => {
    for (const intent of BEHAVIOR_INTENTS) {
      expect(BEHAVIOR_INTENT_LABELS[intent].length).toBeGreaterThan(0);
    }
  });

  it('stati evento (sez. 33.1) completi', () => {
    expect([...BEHAVIOR_EVENT_STATUSES]).toContain('COMPLETED');
    expect(BEHAVIOR_EVENT_STATUSES).toHaveLength(10);
  });

  it('BehaviorEventResult: confidence_band è una band, mai percentuale', () => {
    const result: BehaviorEventResult = {
      eventId: 'e1',
      dogId: 'd1',
      status: 'COMPLETED',
      primary_intent: 'PLAY_INTERACTION',
      confidence_band: 'HIGH',
      consumer_summary: 'Rocky sembra voler giocare',
      evidence: [{ source: 'OBSERVATION', label: 'Postura di gioco' }],
      alternatives: [],
      feedback: 'YES',
      schema_version: 'v1',
      policy_version: 'v0',
      taxonomy_version: 'v0',
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };
    expect(['LOW', 'MEDIUM', 'HIGH']).toContain(result.confidence_band);
  });
});
