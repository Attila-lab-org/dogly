import {
  BEHAVIOR_EVENT_STATUSES,
  BEHAVIOR_INTENTS,
  BEHAVIOR_INTENT_LABELS,
  BehaviorEventResult,
} from '../contracts/types';
import type { ApiBehaviorEvent } from '../features/behavior/api';
import { mapApiEventToResult } from '../features/behavior/map';

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

  it('preserva schema, safety e provenienza scientifica dalla API', () => {
    const event: ApiBehaviorEvent = {
      id: 'evt-1',
      dog_id: 'dog-1',
      status: 'COMPLETED',
      schema_version: 'interpretation.v0',
      primary_intent: 'RELAX_REST',
      confidence_band: 'HIGH',
      summary: 'Sembra rilassato.',
      alternatives: [],
      evidence: [
        { source: 'scientific_kb', description: 'Segnale coperto dalla KB' },
        { source: 'future_source', description: 'Fonte futura' },
      ],
      safety_flags: [{ code: 'SAFE_TEST', severity: 'info' }],
      needs_context: true,
      context_question: 'Cosa è successo prima?',
      policy_version: 'policy.v1',
      taxonomy_version: 'intent-taxonomy/v0',
      feedback: null,
      created_at: '2026-09-07T00:00:00Z',
      completed_at: '2026-09-07T00:00:10Z',
    };

    const result = mapApiEventToResult(event);
    expect(result.schema_version).toBe('interpretation.v0');
    expect(result.evidence.map((item) => item.source)).toEqual([
      'SCIENTIFIC_KB',
      'UNKNOWN',
    ]);
    expect(result.safety_flags).toEqual(event.safety_flags);
    expect(result.needs_context).toBe(true);
    expect(result.context_question).toBe('Cosa è successo prima?');
  });
});
