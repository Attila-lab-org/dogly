// @ts-nocheck
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const card = readFileSync(
  resolve(__dirname, '../features/behavior/ProcessingContextCard.tsx'),
  'utf8',
);
const companion = readFileSync(
  resolve(__dirname, '../features/behavior/ProcessingCompanion.tsx'),
  'utf8',
);
const processingScreen = readFileSync(
  resolve(__dirname, '../../app/behavior/processing/[eventId].tsx'),
  'utf8',
);

describe('processing context companion UX', () => {
  it('keeps one quiet question above continuous analysis', () => {
    expect(processingScreen).toContain('ProcessingCompanion');
    expect(processingScreen).toContain('ProcessingContextCard');
    expect(processingScreen.lastIndexOf('<ProcessingContextCard')).toBeLessThan(
      processingScreen.lastIndexOf('<ProcessingCompanion'),
    );
    expect(processingScreen).toContain('styles.experience');
    expect(processingScreen).not.toMatch(/Rispondi alle domande per avviare/);
    expect(processingScreen).not.toContain('heroText');
    expect(processingScreen).not.toContain('stepper');
    expect(processingScreen).not.toContain('progressTrack');
    expect(processingScreen).not.toContain('Sto guardando');
    expect(processingScreen).not.toContain('Analisi in corso');
    expect(card).toContain('Intanto, alcune domande');
    expect(card).toContain('Salta');
    expect(card).toContain('finishing');
    expect(card).toContain('isProcessingCollecting');
    expect(card).toContain('accepting_answers');
    expect(card).toContain('styles.pill');
    expect(card).not.toContain('processingQuestionKicker');
    expect(card).not.toContain('PROCESSING_ACKS');
    expect(card).not.toMatch(/chat|bubble/i);
    expect(companion).toContain('Analizzando ${dogName}');
    expect(companion).not.toContain('Sto capendo');
    expect(companion).not.toContain('Sto mettendo insieme');
  });

  it('asks one locked question with compact options and never fakes a save', () => {
    expect(card).toContain('locked');
    expect(card).toContain('skipped: true');
    expect(card).toContain('Non sono riuscito a salvare la risposta');
    expect(card).not.toContain('Salvato');
    expect(card).not.toMatch(/560/);
    expect(card).not.toContain('Perfetto');
    expect(card).not.toContain('Questo dettaglio');
    expect(card).not.toContain('Attilio');
    expect(card).not.toContain('ownerDisplayName');
  });

  it('hides the questions when interpretation has started', () => {
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
