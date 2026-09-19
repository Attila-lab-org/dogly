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
const machine = readFileSync(
  resolve(__dirname, '../features/behavior/processingContextMachine.ts'),
  'utf8',
);
const processingScreen = readFileSync(
  resolve(__dirname, '../../app/behavior/processing/[eventId].tsx'),
  'utf8',
);
const copy = readFileSync(
  resolve(__dirname, '../features/core/copy.ts'),
  'utf8',
);
const captureScreen = readFileSync(
  resolve(__dirname, '../../app/behavior/capture.tsx'),
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
    expect(card).toContain('Intanto, aiutami a capire meglio');
    expect(card).toContain('Se ho bisogno, ti farò fino a 3 domande mentre analizzo.');
    expect(card).toContain('Risposta acquisita');
    expect(card).toContain('PROCESSING_ACK_MS');
    expect(card).toContain('cancelQueries');
    expect(card).toContain('setQueryData');
    expect(card).toContain('Salta');
    expect(card).toContain('finishing');
    expect(card).toContain('isProcessingCollecting');
    expect(machine).toContain('accepting_answers');
    expect(card).toContain('styles.pill');
    expect(card).not.toContain('processingQuestionKicker');
    expect(card).not.toContain('PROCESSING_ACKS');
    expect(card).not.toMatch(/chat|bubble/i);
    expect(companion).toContain('processingCompanionCopy');
    expect(copy).toContain('Sto osservando movimenti, postura e suoni');
    expect(copy).toContain('Video ricevuto');
    expect(companion).not.toContain('Sto capendo');
    expect(companion).not.toContain('Sto mettendo insieme');
  });

  it('asks one locked question with compact options and confirms only after 200 OK', () => {
    expect(card).toContain('locked');
    expect(card).toContain('skipped: true');
    expect(machine).toContain('Non sono riuscito a salvare la risposta');
    expect(card).not.toContain('Salvato');
    expect(card).not.toMatch(/560/);
    expect(card).not.toContain('Perfetto');
    expect(card).not.toContain('Questo dettaglio');
    expect(card).not.toContain('Attilio');
    expect(card).not.toContain('ownerDisplayName');
    expect(machine).toContain("type: 'MUTATION_START'");
    expect(machine).toContain("applied ? 'acquired' : 'too_late'");
  });

  it('hides the questions when interpretation has started', () => {
    expect(card).toContain('isProcessingCollecting');
    expect(machine).toContain('applied_to_interpretation');
    expect(processingScreen).toContain('analysisStatus={displayStatus}');
  });

  it('enables stop only after the 5 second minimum', () => {
    expect(captureScreen).toContain('CAPTURE_MIN_SECONDS * 1000');
    expect(captureScreen).not.toMatch(/,\s*700\)/);
  });
});

describe('result feedback teaches DOGly without becoming technical', () => {
  const feedback = readFileSync(
    resolve(__dirname, '../features/core/components.tsx'),
    'utf8',
  );

  it('separates interpretation correctness from advice usefulness', () => {
    expect(feedback).toContain('Ti sembra proprio');
    expect(feedback).toContain('Sì, è così');
    expect(feedback).toContain('Non proprio');
    expect(feedback).toContain('Non so');
    expect(feedback).toContain('Quale lettura ti sembra più vicina?');
    expect(feedback).toContain('correction_label');
    expect(feedback).not.toContain('Ti è stata utile questa lettura?');
    expect(feedback).not.toContain('Salvato');
  });

  it('keeps owner processing answers separate from video observations', () => {
    expect(feedback).toContain('Ciò che hai raccontato durante l’analisi');
    expect(feedback).toContain('processing-owner-context');
  });
});
