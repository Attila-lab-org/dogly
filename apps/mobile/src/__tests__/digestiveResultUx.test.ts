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
  it('uses backend consumer copy without routine overrides', () => {
    expect(resultScreen).toContain('event.consumerHeadline');
    expect(resultScreen).toContain('event.consumerSummary');
    expect(resultScreen).not.toContain('digestiveHeadline');
    expect(resultScreen).not.toContain('isSimpleRoutine');
    expect(resultScreen).not.toContain('hasKnownBaseline');
  });

  it('always shows the general photo reading outside the accordion', () => {
    expect(resultScreen).toContain('Dalla foto');
    expect(resultScreen).toContain("layer.key === 'general'");
    expect(resultScreen).toContain('generalLayer?.summary ?? summary');
    expect(resultScreen.indexOf('Dalla foto')).toBeLessThan(
      resultScreen.indexOf('Perché te lo dico'),
    );
  });

  it('keeps vet contact and safety immediately visible and distinct', () => {
    expect(resultScreen).toContain("event.overallState === 'VET_CONTACT'");
    expect(resultScreen).toContain("label: 'Veterinario', kind: 'vet'");
    expect(resultScreen).toContain("label: 'Attenzione', kind: 'attention'");
    expect(resultScreen.indexOf('event.safetyFlags.map')).toBeLessThan(
      resultScreen.indexOf('Perché te lo dico'),
    );
  });

  it('renders only the single useful action selected by the backend', () => {
    expect(resultScreen).toContain("actionKind === 'vet'");
    expect(resultScreen).toContain("actionKind === 'nutrition'");
    expect(resultScreen).toContain("action?.key === 'ask_followup'");
    expect(resultScreen).toContain('actionKind === null');
  });

  it('shows a short watch list only outside routine results', () => {
    expect(resultScreen).toContain('Cosa osservare');
    expect(resultScreen).toContain("event.overallState !== 'ROUTINE'");
    expect(resultScreen).toContain('.slice(0, 3)');
  });

  it('keeps nutrition as a quiet completion after the analysis', () => {
    expect(resultScreen).toContain('nutritionQuiet');
    expect(resultScreen).toContain('Alimentazione non impostata');
    expect(resultScreen).not.toContain('nutritionChip');
    expect(resultScreen).not.toMatch(
      /digestiveActionCardKind\(action\?\.key\) === 'nutrition' \? \(\s*<Card/,
    );
  });

  it('uses a discrete status and local feedback', () => {
    expect(resultScreen).toContain('statusOrientation');
    expect(resultScreen).toContain('Da seguire');
    expect(resultScreen).toContain('Cosa fare ora');
    expect(resultScreen).toContain('👍');
    expect(resultScreen).toContain('👎');
    expect(resultScreen).not.toContain('Mi è stato utile');
  });

  it('keeps only explanatory evidence in the why accordion', () => {
    expect(resultScreen).toContain('interpretationLayers');
    expect(resultScreen).toContain("layer.key !== 'general'");
    expect(resultScreen).toContain('possibleAssociations');
    expect(resultScreen).toContain('observationReliability');
    expect(resultScreen).toContain('DIGESTIVE_DISCLAIMER');
    expect(resultScreen).not.toContain('uncertainVisualNotes');
    expect(resultScreen).not.toContain('Alimento registrato');
    expect(resultScreen).not.toContain('claim_ids');
    expect(resultScreen).not.toContain('DIG_');
    expect(mapSource).toContain('interpretation_layers');
    expect(mapSource).toContain('interpretationLayers');
  });
});
