export type WalkPark = { id: string; name: string; lat: number; lng: number };
export type ProgressWalk = {
  id: string; started_at: string; duration_seconds: number; distance_meters: number;
  park: WalkPark | null; park_visited: boolean;
};
type Point = { latitude: number; longitude: number; timestamp: number };

export function parsePark(value: unknown): WalkPark | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  if (typeof p.id !== 'string' || !p.id || typeof p.name !== 'string' || !p.name ||
    typeof p.lat !== 'number' || !Number.isFinite(p.lat) || Math.abs(p.lat) > 90 ||
    typeof p.lng !== 'number' || !Number.isFinite(p.lng) || Math.abs(p.lng) > 180) return null;
  return { id: p.id.slice(0, 200), name: p.name.slice(0, 150), lat: p.lat, lng: p.lng };
}

// A selected destination is not a visit. Require at least a minute of fixes nearby.
export function visitedPark(park: WalkPark | null, points: Point[]): boolean {
  if (!park) return false;
  const nearby = points.filter(p => {
    const lat = (p.latitude - park.lat) * Math.PI / 180;
    const lng = (p.longitude - park.lng) * Math.PI / 180;
    const a = Math.sin(lat / 2) ** 2 + Math.cos(park.lat * Math.PI / 180) *
      Math.cos(p.latitude * Math.PI / 180) * Math.sin(lng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= 150;
  });
  return nearby.length >= 2 &&
    Math.max(...nearby.map(p => p.timestamp)) - Math.min(...nearby.map(p => p.timestamp)) >= 60000;
}

function dayKey(date: Date): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join('-');
}
function weekKey(date: Date): string {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return dayKey(monday);
}
export function walkProgress(walks: ProgressWalk[], now = new Date()) {
  const completed = walks.filter(w => w.duration_seconds >= 60 && Number.isFinite(Date.parse(w.started_at)) && Date.parse(w.started_at) <= now.getTime());
  const weeks = new Map<string, Set<string>>();
  const parks = new Set<string>();
  let weekMinutes = 0;
  let weekCount = 0;
  for (const w of completed) {
    const date = new Date(w.started_at);
    const week = weekKey(date);
    const days = weeks.get(week) ?? new Set<string>();
    days.add(dayKey(date)); weeks.set(week, days);
    if (w.park_visited && w.park) parks.add(w.park.id);
    if (week === weekKey(now)) { weekMinutes += w.duration_seconds / 60; weekCount++; }
  }
  const ritualDays = Math.max(0, ...Array.from(weeks.values(), days => days.size));
  const badges = [
    { id: 'first', title: 'Prima impronta', description: 'Completa la vostra prima passeggiata di almeno un minuto.', reward: 'La mascotte festeggia con voi', current: Math.min(completed.length, 1), goal: 1, icon: 'paw' as const },
    { id: 'explorer', title: 'Nuovo posto', description: 'Raggiungi un parco e resta lì almeno un minuto: la meta diventa un ricordo.', reward: 'Distintivo Esploratore', current: Math.min(parks.size, 1), goal: 1, icon: 'leaf' as const },
    { id: 'ritual', title: 'Tre giorni insieme', description: 'Fate una passeggiata in tre giorni della stessa settimana, anche non consecutivi.', reward: 'Cuore del rituale', current: Math.min(ritualDays, 3), goal: 3, icon: 'heart' as const },
  ];
  return { badges, weekCount, weekMinutes: Math.round(weekMinutes), count: completed.length };
}
