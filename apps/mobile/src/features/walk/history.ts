import { getSupabaseClient } from '../../lib/supabase';
import type { WalkPoint } from './tracking';
import { parsePark, type ProgressWalk } from './progress';

export type WalkHistoryItem = ProgressWalk & {
  dog_id: string; ended_at: string | null; steps_estimate: number; route_points: WalkPoint[];
};
export function parseRoute(value: unknown): WalkPoint[] {
  if (!Array.isArray(value)) return [];
  return value.filter((p): p is WalkPoint => p && typeof p === 'object' &&
    Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 &&
    Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180 && Number.isFinite(p.timestamp));
}
export async function fetchWalkHistory(dogId: string, limit = 8, offset = 0, parkId?: string): Promise<WalkHistoryItem[]> {
  if (!dogId) return [];
  let query = getSupabaseClient().from('walks')
    .select('id,dog_id,started_at,ended_at,duration_seconds,distance_meters,steps_estimate,route_points,park,park_visited')
    .eq('dog_id', dogId).eq('status', 'COMPLETED')
    .order('started_at', { ascending: false }).order('id', { ascending: false })
    .range(offset, offset + limit - 1);
  if (parkId) query = query.eq('park->>id', parkId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(item => ({
    ...item, park: parsePark(item.park), park_visited: item.park_visited === true,
    distance_meters: Number(item.distance_meters), route_points: parseRoute(item.route_points),
  }));
}
// Lightweight history for lifetime badges: no GPS routes transferred here.
export async function fetchWalkProgress(dogId: string): Promise<ProgressWalk[]> {
  const result: ProgressWalk[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await getSupabaseClient().from('walks')
      .select('id,started_at,duration_seconds,distance_meters,park,park_visited')
      .eq('dog_id', dogId).eq('status', 'COMPLETED')
      .order('started_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 499);
    if (error) throw error;
    result.push(...(data ?? []).map(item => ({ ...item, park: parsePark(item.park), distance_meters: Number(item.distance_meters) })));
    if (!data || data.length < 500) return result;
  }
}
