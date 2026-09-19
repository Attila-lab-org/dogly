import { nextHomeTip, pickHomeTip } from '../features/home/tips';
import { storyRailLabel } from '../features/stories/labels';

const rocky = {
  id: 'dog-1',
  name: 'Rocky',
  birthDate: '2022-04-10',
  ageLabel: '4 anni',
  breedLabel: 'Labrador',
  sex: 'MALE' as const,
  photoUri: 'https://example.com/rocky.jpg',
};

describe('pickHomeTip', () => {
  it('inserisce il nome del cane e può aprire un flusso reale', () => {
    const first = pickHomeTip(rocky, () => 0);
    expect(`${first.title} ${first.body}`).toContain('Rocky');
    expect(first.kind).toBe('use');
    expect(first.action).toBe('analyze');
    expect(first.ctaLabel).toBe('Analizza');
    const next = nextHomeTip(rocky, first.id, () => 0);
    expect(next.id).not.toBe(first.id);
    expect(`${next.title} ${next.body}`).toContain('Rocky');
  });

  it('per un cucciolo può scegliere un consiglio di età', () => {
    const puppy = {
      ...rocky,
      birthDate: '2025-08-01',
      ageLabel: 'Meno di 1 anno',
      breedLabel: null,
      photoUri: null,
    };
    const tip = pickHomeTip(puppy, () => 0.92);
    expect(tip.kind).toBe('advice');
    expect(tip.body).toContain('Rocky');
  });
});

describe('storyRailLabel', () => {
  const now = new Date(2026, 8, 18, 12, 0);

  it('usa la didascalia, altrimenti Oggi/Ieri', () => {
    expect(
      storyRailLabel(
        { caption: 'Parco con gli amici', createdAt: '2026-09-18T10:00:00' },
        now,
      ),
    ).toBe('Parco');
    expect(
      storyRailLabel({ caption: undefined, createdAt: '2026-09-18T10:00:00' }, now),
    ).toBe('Oggi');
    expect(
      storyRailLabel({ caption: undefined, createdAt: '2026-09-17T10:00:00' }, now),
    ).toBe('Ieri');
  });
});
