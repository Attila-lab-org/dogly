import {
  ageFromBirthDate,
  ageLabelFromYears,
  ageYearsFromLabel,
  currentAgeLabel,
  formatBirthday,
  isBirthdayToday,
  parseIsoDate,
} from '../features/dogs/profileDates';

describe('età e compleanno', () => {
  const today = new Date(2026, 8, 5);

  it('calcola l’età rispetto al compleanno', () => {
    expect(ageFromBirthDate('2022-09-10', today)).toBe(3);
    expect(ageFromBirthDate('2022-09-05', today)).toBe(4);
  });

  it('formatta età e data per la UI', () => {
    expect(ageLabelFromYears(0)).toBe('Meno di 1 anno');
    expect(ageLabelFromYears(1)).toBe('1 anno');
    expect(ageYearsFromLabel('4 anni')).toBe(4);
    expect(formatBirthday('2022-05-18')).toBe('18 maggio 2022');
  });

  it('aggiorna l’età mostrata quando è presente la data di nascita', () => {
    expect(currentAgeLabel('2022-09-05', '3 anni', today)).toBe('4 anni');
  });

  it('riconosce il compleanno indipendentemente dall’anno', () => {
    expect(isBirthdayToday('2022-09-05', today)).toBe(true);
    expect(isBirthdayToday('2022-09-06', today)).toBe(false);
  });

  it('rifiuta date impossibili', () => {
    expect(parseIsoDate('2026-02-31')).toBeNull();
  });
});
