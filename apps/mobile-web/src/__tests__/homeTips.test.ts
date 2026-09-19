import { nextHomeTip, pickHomeTip } from '../features/home/tips';
import { storyRailLabel } from '../features/stories/labels';

const rocky = {
  id: 'dog-1',
  name: 'Rocky',
  birthDate: '2022-04-10',
  ageLabel: '4 anni',
  breedLabel: 'Labrador',
  sex: 'MALE' as const,
};

describe('pickHomeTip', () => {
  it('inserisce il nome del cane e gira a un consiglio diverso', () => {
    const first = pickHomeTip(rocky, () => 0);
    expect(first.body).toContain('Rocky');
    expect(first.title.length).toBeGreaterThan(0);
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
    };
    const tip = pickHomeTip(puppy, () => 0.92);
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
