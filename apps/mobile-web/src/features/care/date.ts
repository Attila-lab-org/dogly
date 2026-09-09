import { MONTH_NAMES, parseIsoDate, toIsoDate } from '../dogs/profileDates';

export function tomorrowAt(hour = 10): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);
  return date;
}

export function localDateKey(date: Date): string {
  return toIsoDate(date.getFullYear(), date.getMonth(), date.getDate());
}

export function combineLocalDateTime(dateKey: string, hour: number): string {
  const parsed = parseIsoDate(dateKey);
  if (!parsed) throw new Error('Invalid care event date');
  return new Date(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    hour,
    0,
    0,
    0,
  ).toISOString();
}

export function formatCareDate(value: string, allDay = false): string {
  const date = new Date(value);
  return date.toLocaleDateString('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    ...(allDay ? {} : { hour: '2-digit', minute: '2-digit' }),
  });
}

export function formatDateKey(value: string): string {
  const parsed = parseIsoDate(value);
  if (!parsed) return '';
  return `${parsed.day} ${MONTH_NAMES[parsed.month - 1]} ${parsed.year}`;
}

export function dayDistance(value: string, now = new Date()): number {
  const target = new Date(value);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetStart = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  );
  return Math.round(
    (targetStart.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000),
  );
}

export function relativeCareDate(value: string, now = new Date()): string {
  const distance = dayDistance(value, now);
  if (distance === 0) return 'Oggi';
  if (distance === 1) return 'Domani';
  if (distance > 1 && distance <= 7) return `Tra ${distance} giorni`;
  if (distance === -1) return 'Ieri';
  if (distance < -1) return `${Math.abs(distance)} giorni fa`;
  return formatCareDate(value);
}
