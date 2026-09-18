import { digestiveProcessingQuestions } from '../features/digestive/processingContext';

describe('digestive processing context', () => {
  it('asks at most three owner-friendly questions', () => {
    const questions = digestiveProcessingQuestions('Oreo');

    expect(questions).toHaveLength(3);
    expect(new Set(questions.map((question) => question.key)).size).toBe(3);
    expect(questions.every((question) => question.text.includes('Oreo'))).toBe(
      true,
    );
  });

  it('collects context rather than asking the owner to inspect the photo', () => {
    const copy = digestiveProcessingQuestions('Oreo')
      .map((question) => question.text)
      .join(' ')
      .toLowerCase();

    expect(copy).toContain('vomitato');
    expect(copy).toContain('mangiato meno');
    expect(copy).not.toContain('colore');
    expect(copy).not.toContain('consistenza');
  });
});
