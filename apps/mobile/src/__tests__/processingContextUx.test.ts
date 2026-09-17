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

  it('hides the companion when the result is ready', () => {
    expect(card).toContain('if (finishing || (!locked && !ack)) return null');
    expect(processingScreen).toContain('finishing={finishing}');
  });
});
