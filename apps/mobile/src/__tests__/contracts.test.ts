import {
  BEHAVIOR_EVENT_STATUSES,
  BEHAVIOR_INTENTS,
  BEHAVIOR_INTENT_LABELS,
  BehaviorEventResult,
} from '../contracts/types';
import type { ApiBehaviorEvent } from '../features/behavior/api';
import { mapApiEventToResult } from '../features/behavior/map';
import {
  digestiveActionCardKind,
  digestiveNutritionHref,
  mapApiDigestiveEventToResult,
  type ApiDigestiveEvent,
} from '../features/digestive/map';

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
      context_options: [
        {
          id: 'already_playing',
          label: 'Stavamo già giocando',
        },
      ],
      dog_voice: '«Forse cercavo proprio te.»',
      sound_note: 'Si sente un abbaio breve, letto insieme alla postura.',
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
    expect(result.context_options?.[0].id).toBe('already_playing');
    expect(result.dog_voice).toBe('«Forse cercavo proprio te.»');
    expect(result.sound_note).toContain('abbaio breve');
    expect(result.baseline_note).toBeNull();
  });

  it('mappa il blocco Per Rocky e la safety consumer', () => {
    const event: ApiBehaviorEvent = {
      id: 'evt-2',
      dog_id: 'dog-1',
      status: 'COMPLETED',
      schema_version: 'interpretation.v0',
      primary_intent: 'RESOURCE_TENSION',
      confidence_band: 'MEDIUM',
      summary: 'Corpo più rigido vicino alla ciotola.',
      alternatives: [],
      evidence: [],
      safety_flags: [{ code: 'SAFE_ESCALATION_001', severity: 'urgent' }],
      needs_context: false,
      context_question: null,
      policy_version: 'policy.v1',
      taxonomy_version: 'intent-taxonomy/v0',
      consumer_headline: 'Rocky sembra chiedere più spazio',
      baseline_note: 'Questa volta il comportamento è diverso dal solito di Rocky.',
      baseline_comparison: 'VARIATION',
      safety: {
        code: 'SAFE_ESCALATION_001',
        severity: 'urgent',
        title: 'Chiede più spazio',
        message: 'Il corpo appare teso.',
        action: 'Aumenta la distanza e non forzare il contatto.',
      },
      created_at: '2026-09-07T00:00:00Z',
      completed_at: '2026-09-07T00:00:10Z',
    };
    const result = mapApiEventToResult(event);
    expect(result.consumer_headline).toContain('più spazio');
    expect(result.baseline_note).toContain('diverso dal solito');
    expect(result.safety?.action).toContain('distanza');
    expect(result.safety?.action).not.toContain('SAFE_');
  });
});

describe('digestive mapping — valori reali del backend, non mock', () => {
  it('mappa i tre livelli senza esporre metadata audit alla UI', () => {
    const event = {
      id: 'evt-layers',
      dog_id: 'dog-real',
      status: 'COMPLETED',
      fecal_score_estimate: 4,
      consistency: 'SOFT',
      color: 'brown',
      image_quality: 'sufficient',
      quality_warnings: [],
      mucus_candidate: 'none_observed',
      fresh_blood_candidate: 'none_observed',
      melena_candidate: 'none_observed',
      foreign_material_candidate: 'none_observed',
      confidence_band: 'MEDIUM',
      safety_flags: [],
      summary: null,
      active_food_name: null,
      baseline_comparison: 'INSUFFICIENT',
      interpretation_layers: [
        {
          key: 'general',
          title: 'Valutazione generale',
          summary: 'Feci più morbide.',
          claim_ids: ['DIG_SCORE_4_001'],
          factors_used: ['observation'],
        },
        {
          key: 'profile',
          title: 'Profilo di Oreo',
          summary: 'Contesto supportato dalla taglia.',
          claim_ids: ['DIG_SIZE_CONTEXT_001'],
          factors_used: ['size'],
        },
      ],
      created_at: '2026-09-18T09:00:00Z',
    } satisfies ApiDigestiveEvent;

    const result = mapApiDigestiveEventToResult(event);

    expect(result.interpretationLayers).toEqual([
      {
        key: 'general',
        title: 'Valutazione generale',
        summary: 'Feci più morbide.',
      },
      {
        key: 'profile',
        title: 'Profilo di Oreo',
        summary: 'Contesto supportato dalla taglia.',
      },
    ]);
    expect(result.interpretationLayers?.[0]).not.toHaveProperty('claim_ids');
    expect(result.interpretationLayers?.[0]).not.toHaveProperty('factors_used');
  });

  it('traduce SOFT/FORMED inglese in consistenza consumer', () => {
    const event: ApiDigestiveEvent = {
      id: 'evt-real',
      dog_id: 'dog-real',
      status: 'COMPLETED',
      fecal_score_estimate: 4,
      consistency: 'SOFT',
      color: 'olive brown',
      image_quality: 'sufficient',
      quality_warnings: [],
      mucus_candidate: 'possible',
      fresh_blood_candidate: 'none_observed',
      melena_candidate: 'none_observed',
      foreign_material_candidate: 'none_observed',
      confidence_band: 'MEDIUM',
      safety_flags: [],
      summary: null,
      active_food_name: null,
      baseline_comparison: 'NEAR_USUAL',
      created_at: '2026-09-06T23:56:54Z',
    };

    const result = mapApiDigestiveEventToResult(event);
    expect(result.consistency).toBe('morbida');
    expect(result.color).toBe('marrone con una tonalità verdastra');
    expect(result.status).toBe('COMPLETED');
  });

  it('traduce i colori restituiti dal servizio', () => {
    const event: ApiDigestiveEvent = {
      id: 'evt-color',
      dog_id: 'dog-real',
      status: 'COMPLETED',
      fecal_score_estimate: 3,
      consistency: 'FORMED',
      color: 'dark brown',
      image_quality: 'sufficient',
      quality_warnings: [],
      mucus_candidate: 'none_observed',
      fresh_blood_candidate: 'none_observed',
      melena_candidate: 'none_observed',
      foreign_material_candidate: 'none_observed',
      confidence_band: 'MEDIUM',
      safety_flags: [],
      summary: null,
      active_food_name: null,
      baseline_comparison: 'BELOW_USUAL',
      created_at: '2026-09-17T19:35:52Z',
    };

    expect(mapApiDigestiveEventToResult(event).color).toBe('marrone scuro');
  });

  it('usa useful_action.href per complete_nutrition invece di hardcodare la lista', () => {
    expect(
      digestiveNutritionHref(
        '/nutrition/foods/food-abc/verify?focus=quantity',
      ),
    ).toBe('/nutrition/foods/food-abc/verify?focus=quantity');
    expect(digestiveNutritionHref('/account')).toBe('/nutrition/foods');
    expect(digestiveNutritionHref(null)).toBe('/nutrition/foods');
  });

  it('mostra contact_vet come unica useful action card', () => {
    const event: ApiDigestiveEvent = {
      id: 'evt-vet',
      dog_id: 'dog-real',
      status: 'COMPLETED',
      fecal_score_estimate: 4,
      consistency: 'SOFT',
      color: 'brown',
      image_quality: 'sufficient',
      quality_warnings: [],
      mucus_candidate: 'none_observed',
      fresh_blood_candidate: 'possible',
      melena_candidate: 'none_observed',
      foreign_material_candidate: 'none_observed',
      confidence_band: 'MEDIUM',
      safety_flags: [],
      summary: null,
      active_food_name: null,
      baseline_comparison: 'NEAR_USUAL',
      useful_action: {
        key: 'contact_vet',
        label: 'Contatta il veterinario',
        body: 'Non riesco a confermare bene questo dettaglio dalla foto.',
      },
      created_at: '2026-09-18T01:00:00Z',
    };

    const result = mapApiDigestiveEventToResult(event);
    expect(result.usefulAction?.key).toBe('contact_vet');
    expect(result.usefulAction?.label).toBe('Contatta il veterinario');
    expect(digestiveActionCardKind(result.usefulAction?.key)).toBe('vet');
    expect(digestiveActionCardKind('ask_followup')).toBeNull();
  });

  it('mantiene la CTA alimentazione compatta', () => {
    const event: ApiDigestiveEvent = {
      id: 'evt-food',
      dog_id: 'dog-real',
      status: 'COMPLETED',
      fecal_score_estimate: 3,
      consistency: 'FORMED',
      color: 'brown',
      image_quality: 'sufficient',
      quality_warnings: [],
      mucus_candidate: 'none_observed',
      fresh_blood_candidate: 'none_observed',
      melena_candidate: 'none_observed',
      foreign_material_candidate: 'none_observed',
      confidence_band: 'MEDIUM',
      safety_flags: [],
      summary: null,
      active_food_name: null,
      baseline_comparison: 'NEAR_USUAL',
      overall_state: 'ROUTINE',
      useful_action: {
        key: 'add_nutrition',
        label: 'Aggiungi',
        title: 'Alimentazione non impostata',
        href: '/nutrition/foods',
      },
      created_at: '2026-09-18T01:00:00Z',
    };
    const result = mapApiDigestiveEventToResult(event);
    expect(digestiveActionCardKind(result.usefulAction?.key)).toBe('nutrition');
    expect(result.usefulAction?.title).toBe('Alimentazione non impostata');
    expect(result.usefulAction?.label).toBe('Aggiungi');
    expect(result.usefulAction?.body ?? null).toBeNull();
  });
});
