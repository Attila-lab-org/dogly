// @ts-nocheck
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const resultScreen = readFileSync(
  resolve(__dirname, '../../app/digestive/result/[eventId].tsx'),
  'utf8',
);

describe('digestive result UX', () => {
  it('keeps nutrition as a quiet completion after the analysis', () => {
    expect(resultScreen).toContain('nutritionQuiet');
    expect(resultScreen).toContain('Alimentazione non impostata');
    expect(resultScreen).not.toContain('nutritionChip');
    expect(resultScreen).not.toMatch(
      /digestiveActionCardKind\(action\?\.key\) === 'nutrition' \? \(\s*<Card/,
    );
  });

  it('does not list uncertain anomalies as engine alarms', () => {
    expect(resultScreen).not.toContain('Possibile muco');
    expect(resultScreen).not.toContain('Da tenere d’occhio');
    expect(resultScreen).toContain('Perché te lo dico');
    expect(resultScreen).toContain('whyITellYou');
  });

  it('uses a discrete status and one next-step block', () => {
    expect(resultScreen).toContain('statusOrientation');
    expect(resultScreen).toContain('Da seguire');
    expect(resultScreen).toContain('Cosa fare ora');
    expect(resultScreen).toContain('👍');
    expect(resultScreen).toContain('👎');
    expect(resultScreen).not.toContain('Mi è stato utile');
  });
});
