import { mapApiEventToResult } from '../features/behavior/map';
import {
  consumerCopy,
  homeGreeting,
  isPersonalBaselineNote,
  leaksInternalConsumerCopy,
  mediaQualityCopy,
  usefulQuestionKicker,
  processingQuestionKicker,
  PROCESSING_ACKS,
} from '../features/core/conversationCopy';
import { sanitizeOwnerCopy } from '../features/core/copy';
import { mapApiDigestiveEventToResult } from '../features/digestive/map';
import type { ApiBehaviorEvent } from '../features/behavior/api';
import type { ApiDigestiveEvent } from '../features/digestive/map';

const LEAKS = [
  'SAFE_ESCALATION_001',
  'Ripresa e audio degradati: filmed_screen…',
  'quality high',
  'score 4/7',
  'candidate mucus',
  'confidence medium',
  'Postura ferma, coda sopra linea neutra, candidate bark, confidence medium.',
];

describe('consumer conversation copy', () => {
  it('never leaves internal codes or observer jargon in owner-facing text', () => {
    for (const leak of LEAKS) {
      const cleaned = consumerCopy(leak);
      expect(leaksInternalConsumerCopy(cleaned)).toBe(false);
      expect(cleaned).not.toMatch(/SAFE_|filmed_screen|score 4\/7|candidate|confidence medium|quality high/i);
    }
  });

  it('turns media quality codes into natural Italian', () => {
    expect(mediaQualityCopy('filmed_screen')).not.toContain('filmed_screen');
    expect(mediaQualityCopy('audio_degraded')).toContain('audio più chiaro');
    expect(mediaQualityCopy('Foto mossa o sfocata')).toBe('Foto mossa o sfocata');
  });

  it('addresses the owner by name when a question is worth asking', () => {
    expect(usefulQuestionKicker('Attilio')).toBe(
      'Attilio, una cosa può aiutarmi',
    );
    expect(processingQuestionKicker('Attilio')).toBe(
      'Attilio, intanto una cosa può aiutarmi',
    );
    expect(processingQuestionKicker(null)).toBe(
      'Intanto una cosa può aiutarmi',
    );
    expect(PROCESSING_ACKS).toEqual([
      'Perfetto, questo mi aiuta.',
      'Ok, continuo a guardare.',
      'Questo dettaglio può essere utile.',
    ]);
    expect(homeGreeting({ ownerDisplayName: 'Attilio', dogName: 'Rocky' })).toBe(
      'Ciao Attilio, come sta Rocky oggi?',
    );
  });

  it('hides generic learning notes that are not personal history', () => {
    expect(
      isPersonalBaselineNote(
        'Sto ancora imparando il modo di comunicare di Rocky: questa lettura si basa soprattutto su ciò che vedo ora.',
      ),
    ).toBe(false);
    expect(
      isPersonalBaselineNote(
        'È simile ad altri episodi che hai già confermato per Rocky.',
      ),
    ).toBe(true);
  });

  it('keeps sanitizeOwnerCopy aligned with the conversation layer', () => {
    expect(
      sanitizeOwnerCopy(
        'Ha fatto un play bow. Confidenza media; potrebbero esserci alternative.',
      ),
    ).toBe('Ha fatto un inchino di gioco. Potrebbero esserci alternative.');
  });
});

describe('mapped API results stay consumer-facing', () => {
  it('strips observer dump from a behavior event', () => {
    const event = {
      id: 'evt-1',
      dog_id: 'dog-1',
      status: 'COMPLETED',
      schema_version: 'v1',
      primary_intent: 'ALERT_VIGILANCE',
      confidence_band: 'MEDIUM',
      summary: 'Postura ferma, candidate bark, confidence medium.',
      alternatives: [],
      evidence: [{ source: 'observation', label: 'play bow + arousal' }],
      safety_flags: [],
      needs_context: true,
      context_question: 'Cosa stava guardando?',
      policy_version: null,
      taxonomy_version: null,
      created_at: '2026-09-18T00:00:00Z',
      completed_at: '2026-09-18T00:00:01Z',
      consumer_headline: 'SAFE_ESCALATION_001 Rocky è attento',
      sound_note: 'audio_degraded filmed_screen',
    } as ApiBehaviorEvent;

    const result = mapApiEventToResult(event);
    for (const value of [
      result.consumer_headline,
      result.consumer_summary,
      result.sound_note,
      result.evidence[0]?.label,
    ]) {
      expect(leaksInternalConsumerCopy(value)).toBe(false);
    }
  });

  it('translates digestive quality codes before the screen', () => {
    const event: ApiDigestiveEvent = {
      id: 'evt-d',
      dog_id: 'dog-1',
      status: 'INSUFFICIENT_IMAGE',
      fecal_score_estimate: 4,
      consistency: 'SOFT',
      color: 'brown',
      image_quality: 'insufficient',
      quality_warnings: ['filmed_screen', 'quality high'],
      mucus_candidate: 'possible',
      fresh_blood_candidate: 'none_observed',
      melena_candidate: 'none_observed',
      foreign_material_candidate: 'none_observed',
      confidence_band: 'MEDIUM',
      safety_flags: [],
      summary: 'score 4/7 candidate mucus confidence medium',
      active_food_name: null,
      baseline_comparison: 'ABOVE_USUAL',
      consumer_headline: 'Oggi è un po’ più morbida del solito di Rocky',
      consumer_summary: 'score 4/7 candidate mucus',
      created_at: '2026-09-18T00:00:00Z',
    };

    const result = mapApiDigestiveEventToResult(event);
    expect(result.qualityWarnings.join(' ')).not.toMatch(/filmed_screen|quality high/i);
    expect(leaksInternalConsumerCopy(result.consumerSummary)).toBe(false);
    expect(result.baselineComparison).toContain('più morbida');
    expect(result.baselineComparison).not.toContain('ABOVE_USUAL');
  });
});
