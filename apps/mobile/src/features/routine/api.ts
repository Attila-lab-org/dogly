import { api } from '@/lib/apiClient';

export type DailyActivityKind =
  | 'WALK'
  | 'MEAL'
  | 'PLAY'
  | 'REST'
  | 'TRAINING'
  | 'MEDS'
  | 'OTHER';

export type DailyActivity = {
  id: string;
  dog_id: string;
  title: string;
  activity_kind: DailyActivityKind;
  local_time_minutes: number;
  duration_minutes: number | null;
  weekday_mask: number;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type DailyActivityInput = {
  title: string;
  activity_kind: DailyActivityKind;
  local_time_minutes: number;
  duration_minutes?: number | null;
  weekday_mask?: number;
  notes?: string | null;
};

export function listDailyActivities(dogId: string, weekday?: number) {
  const params = new URLSearchParams();
  if (weekday !== undefined) params.set('weekday', String(weekday));
  const q = params.toString();
  return api.get<{ items: DailyActivity[] }>(
    `/v1/dogs/${dogId}/daily-activities${q ? `?${q}` : ''}`,
  );
}

export function createDailyActivity(dogId: string, body: DailyActivityInput) {
  return api.post<DailyActivity>(`/v1/dogs/${dogId}/daily-activities`, body);
}

export function updateDailyActivity(
  activityId: string,
  body: Partial<DailyActivityInput> & { active?: boolean },
) {
  return api.patch<DailyActivity>(`/v1/daily-activities/${activityId}`, body);
}

export function deleteDailyActivity(activityId: string) {
  return api.delete(`/v1/daily-activities/${activityId}`);
}

export function formatLocalTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseLocalTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export const ACTIVITY_META: Record<
  DailyActivityKind,
  { label: string; icon: 'walk-outline' | 'nutrition-outline' | 'football-outline' | 'moon-outline' | 'school-outline' | 'medkit-outline' | 'ellipsis-horizontal'; color: string; soft: string }
> = {
  WALK: { label: 'Passeggiata', icon: 'walk-outline', color: '#0077D8', soft: '#E1F1FF' },
  MEAL: { label: 'Pasto', icon: 'nutrition-outline', color: '#ED752B', soft: '#FFEBDD' },
  PLAY: { label: 'Gioco', icon: 'football-outline', color: '#079D78', soft: '#DDF6EA' },
  REST: { label: 'Riposo', icon: 'moon-outline', color: '#8650CC', soft: '#EEE5FF' },
  TRAINING: { label: 'Addestramento', icon: 'school-outline', color: '#0050D8', soft: '#DBEAFE' },
  MEDS: { label: 'Farmaco', icon: 'medkit-outline', color: '#DC2626', soft: '#FEE2E2' },
  OTHER: { label: 'Altro', icon: 'ellipsis-horizontal', color: '#64748B', soft: '#F1F5F9' },
};
