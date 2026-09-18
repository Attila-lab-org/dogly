// @ts-nocheck
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const resultScreen = readFileSync(
  resolve(__dirname, '../../app/digestive/result/[eventId].tsx'),
  'utf8',
);
const mapSource = readFileSync(
  resolve(__dirname, '../features/digestive/map.ts'),
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

  it('keeps a regular formed result short and action-free', () => {
    expect(resultScreen).toContain('isSimpleRoutine');
    expect(resultScreen).toContain('Tutto regolare per');
    expect(resultScreen).toContain(
      'Non vedo segnali che richiedano attenzione.',
    );
    expect(resultScreen).toContain("event.overallState !== 'ROUTINE'");
    expect(resultScreen).toContain("layer.key !== 'general'");
    expect(resultScreen).not.toContain('photoDetailCopy');
    expect(resultScreen).not.toContain('possibili residui di alimento');
  });

  it('shows interpretation layers under the why section without claim ids', () => {
    expect(resultScreen).toContain('interpretationLayers');
    expect(resultScreen).toContain('layer.title');
    expect(resultScreen).toContain('layer.summary');
    expect(resultScreen).not.toContain('claim_ids');
    expect(resultScreen).not.toContain('DIG_');
    expect(mapSource).toContain('interpretation_layers');
    expect(mapSource).toContain('interpretationLayers');
  });
});
