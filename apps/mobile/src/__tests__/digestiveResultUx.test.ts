// @ts-nocheck
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const resultScreen = readFileSync(
  resolve(__dirname, '../../app/digestive/result/[eventId].tsx'),
  'utf8',
);

describe('digestive result UX', () => {
  it('keeps nutrition missing as a compact secondary chip', () => {
    expect(resultScreen).toContain('nutritionChip');
    expect(resultScreen).toContain("digestiveActionCardKind(action?.key) === 'nutrition'");
    expect(resultScreen).not.toMatch(
      /digestiveActionCardKind\(action\?\.key\) === 'nutrition' \? \(\s*<Card/,
    );
  });

  it('uses discreet thumbs and a quiet done action', () => {
    expect(resultScreen).toContain('👍');
    expect(resultScreen).toContain('👎');
    expect(resultScreen).toContain('styles.doneText');
    expect(resultScreen).not.toContain('Mi è stato utile');
    expect(resultScreen).not.toContain('Non mi aiuta');
    expect(resultScreen).not.toMatch(/title=["']Fatto["']/);
  });

  it('shows one observational advice line in the hero', () => {
    expect(resultScreen).toContain('resultAdvice');
    expect(resultScreen).toContain('recommendedNextStep');
  });
});
