import { dogVoiceLine, sanitizeOwnerCopy } from '../features/core/copy';

describe('Dogly translation copy', () => {
  it('turns the likely intent into a short message from the dog', () => {
    expect(dogVoiceLine('PLAY_INTERACTION')).toBe('«Giochiamo insieme?»');
    expect(dogVoiceLine('DISCOMFORT_AVOIDANCE')).toContain('lasciami spazio');
  });

  it('does not invent a message when evidence is insufficient', () => {
    expect(dogVoiceLine(null)).toContain('Non voglio inventare');
    expect(dogVoiceLine('INSUFFICIENT')).toContain('fammi vedere meglio');
  });

  it('keeps historical results free of internal language', () => {
    expect(
      sanitizeOwnerCopy(
        'Ha fatto un play bow. Confidenza media; potrebbero esserci alternative.',
      ),
    ).toBe(
      'Ha fatto un inchino di gioco. Potrebbero esserci alternative.',
    );
  });
});
