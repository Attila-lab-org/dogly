// @ts-nocheck
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CONSUMER_LEAK_PATTERN,
  PROCESSING_ACKS,
  processingQuestionKicker,
} from '../features/core/conversationCopy';

const card = readFileSync(
  resolve(__dirname, '../features/behavior/ProcessingContextCard.tsx'),
  'utf8',
);
const processingScreen = readFileSync(
  resolve(__dirname, '../../app/behavior/processing/[eventId].tsx'),
  'utf8',
);

describe('processing context companion UX', () => {
  it('keeps the analysis companion primary and the questions as accompaniment', () => {
    expect(processingScreen).toContain('ProcessingCompanion');
    expect(processingScreen).toContain('ProcessingContextCard');
    expect(processingScreen.indexOf('ProcessingCompanion')).toBeLessThan(
      processingScreen.indexOf('ProcessingContextCard'),
    );
    expect(processingScreen).not.toMatch(/Rispondi alle domande per avviare/);
    expect(card).toContain('processingQuestionKicker');
    expect(card).toContain('Salta');
    expect(card).toContain('finishing');
    expect(card).toContain('isProcessingCollecting');
    expect(card).toContain('accepting_answers');
    expect(card).not.toMatch(/chat|bubble/i);
  });

  it('asks one locked question with 2-4 buttons and never fakes a save', () => {
    expect(card).toContain('locked');
    expect(card).toContain('skipped: true');
    expect(card).toContain('Non sono riuscito a salvare la risposta');
    expect(card).not.toContain('Salvato');
    expect(card).toMatch(/560/);
    expect(PROCESSING_ACKS.length).toBe(3);
    expect(processingQuestionKicker('Attilio')).not.toMatch(CONSUMER_LEAK_PATTERN);
  });

  it('hides the companion when interpretation has started', () => {
    expect(card).toContain('!collecting');
    expect(card).toContain('applied_to_interpretation === false');
    expect(processingScreen).toContain('analysisStatus={displayStatus}');
  });
});

describe('result feedback stays minimal', () => {
  const feedback = readFileSync(
    resolve(__dirname, '../features/core/components.tsx'),
    'utf8',
  );

  it('uses thumbs only and never opens a correction questionnaire', () => {
    expect(feedback).toContain('Ti è stata utile questa lettura?');
    expect(feedback).toContain('thumbs-up');
    expect(feedback).toContain('thumbs-down');
    expect(feedback).not.toContain('Sì, è così');
    expect(feedback).not.toContain('Non lo so');
    expect(feedback).not.toContain('Salvato');
    expect(feedback).not.toContain('Cosa stava davvero facendo?');
  });
});
