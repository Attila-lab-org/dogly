export const DOG_AGE_OPTIONS = Array.from({ length: 26 }, (_, years) => years);

export function ageLabelFromYears(years: number): string {
  if (years <= 0) return 'Meno di 1 anno';
  return years === 1 ? '1 anno' : `${years} anni`;
}

export function ageYearsFromLabel(label: string): number | null {
  if (label.toLocaleLowerCase('it').includes('meno di 1')) return 0;
  const match = /(\d+)/.exec(label);
  return match ? Number(match[1]) : null;
}

export function ageFromBirthDate(
  birthDate: string,
  today = new Date(),
): number {
  const parsed = parseIsoDate(birthDate);
  if (!parsed) return 0;

  let age = today.getFullYear() - parsed.year;
  const birthdayPassed =
    today.getMonth() + 1 > parsed.month ||
    (today.getMonth() + 1 === parsed.month && today.getDate() >= parsed.day);
  if (!birthdayPassed) age -= 1;
  return Math.max(0, age);
}

export function currentAgeLabel(
  birthDate: string | null,
  fallback: string,
  today = new Date(),
): string {
  return birthDate
    ? ageLabelFromYears(ageFromBirthDate(birthDate, today))
    : fallback;
}

export function formatBirthday(birthDate: string): string {
  const parsed = parseIsoDate(birthDate);
  if (!parsed) return '';
  return `${parsed.day} ${MONTH_NAMES[parsed.month - 1]} ${parsed.year}`;
}

export function isBirthdayToday(
  birthDate: string | null,
  today = new Date(),
): boolean {
  if (!birthDate) return false;
  const parsed = parseIsoDate(birthDate);
  return Boolean(
    parsed &&
      parsed.month === today.getMonth() + 1 &&
      parsed.day === today.getDate(),
  );
}

export function toIsoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseIsoDate(
  value: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export const MONTH_NAMES = [
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
] as const;
