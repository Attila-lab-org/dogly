import {
  combineLocalDateTime,
  dayDistance,
  formatDateKey,
  localDateKey,
  relativeCareDate,
} from '../features/care/date';

describe('care agenda dates', () => {
  it('prepara una data locale senza cambiare il giorno scelto', () => {
    const iso = combineLocalDateTime('2026-09-12', 10);
    const local = new Date(iso);
    expect(localDateKey(local)).toBe('2026-09-12');
    expect(local.getHours()).toBe(10);
  });

  it('mostra etichette relative semplici per gli appuntamenti vicini', () => {
    const now = new Date(2026, 8, 5, 12);
    expect(dayDistance(new Date(2026, 8, 6, 10).toISOString(), now)).toBe(1);
    expect(relativeCareDate(new Date(2026, 8, 6, 10).toISOString(), now)).toBe(
      'Domani',
    );
    expect(
      relativeCareDate(new Date(2026, 8, 9, 10).toISOString(), now),
    ).toBe('Tra 4 giorni');
  });

  it('formatta la data scelta in italiano', () => {
    expect(formatDateKey('2026-09-12')).toBe('12 settembre 2026');
  });
});
