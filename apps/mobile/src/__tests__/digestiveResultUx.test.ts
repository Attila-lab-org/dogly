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

  it('puts practical advice in the accordion, not a repeat of the analysis', () => {
    expect(resultScreen).toContain('Consigli');
    expect(resultScreen).toContain('Cosa ti consiglio');
    expect(resultScreen).toContain('ownerAdvice');
    expect(resultScreen).not.toContain('Cosa ha considerato DOGly');
    expect(resultScreen).not.toContain('Se vuoi, osserva anche');
    expect(resultScreen).not.toContain('generalLayer?.summary');
  });

  it('keeps vet contact and safety immediately visible and distinct', () => {
    expect(resultScreen).toContain("event.overallState === 'VET_CONTACT'");
    expect(resultScreen).toContain("label: 'Veterinario', kind: 'vet'");
    expect(resultScreen).toContain("label: 'Attenzione', kind: 'attention'");
    expect(resultScreen.indexOf('event.safetyFlags.map')).toBeLessThan(
      resultScreen.indexOf('Consigli'),
    );
  });

  it('renders only the single useful action selected by the backend', () => {
    expect(resultScreen).toContain("actionKind === 'vet'");
    expect(resultScreen).toContain("actionKind === 'nutrition'");
    expect(resultScreen).toContain("action?.key === 'ask_followup'");
    expect(resultScreen).toContain("actionKind !== 'vet'");
  });

  it('keeps nutrition as a quiet completion after the analysis', () => {
    expect(resultScreen).toContain('nutritionQuiet');
    expect(resultScreen).toContain('Cosa mangia?');
    expect(resultScreen).not.toContain('nutritionChip');
    expect(resultScreen).not.toMatch(
      /digestiveActionCardKind\(action\?\.key\) === 'nutrition' \? \(\s*<Card/,
    );
  });

  it('uses a discrete status and persisted correctness feedback', () => {
    expect(resultScreen).toContain('statusOrientation');
    expect(resultScreen).toContain('Da seguire');
    expect(resultScreen).toContain('Cosa fare ora');
    expect(resultScreen).toContain('Ti ritrovi in questo risultato?');
    expect(resultScreen).toContain('Sì, è così');
    expect(resultScreen).toContain('Non proprio');
    expect(resultScreen).toContain('Non so');
    expect(resultScreen).toContain('postDigestiveFeedback');
  });

  it('keeps engine dump out of the advice accordion', () => {
    expect(resultScreen).not.toContain('observationReliability');
    expect(resultScreen).not.toContain('possibleAssociations');
    expect(resultScreen).toContain('DIGESTIVE_DISCLAIMER');
    expect(resultScreen).not.toContain('uncertainVisualNotes');
    expect(resultScreen).not.toContain('Alimento registrato');
    expect(resultScreen).not.toContain('claim_ids');
    expect(resultScreen).not.toContain('DIG_');
    expect(mapSource).toContain('owner_advice');
    expect(mapSource).toContain('ownerAdvice');
  });
});
