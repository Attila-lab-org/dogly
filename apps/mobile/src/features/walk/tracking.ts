import { Platform } from 'react-native';
import { getSupabaseClient } from '../../lib/supabase';

export type WalkPoint = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

export type WalkSavePayload = {
  dogId: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  distanceMeters: number;
  stepsEstimate: number;
  routePoints: WalkPoint[];
  park?: { id: string; name: string; lat: number; lng: number } | null;
  parkVisited?: boolean;
};

export function distanceBetween(a: WalkPoint, b: WalkPoint): number {
  const earthRadius = 6371000;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function totalDistance(points: WalkPoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const segment = distanceBetween(points[index - 1], points[index]);
    // Ignore GPS jumps that would make a short walk look like a car ride.
    if (segment <= 150) total += segment;
  }
  return Math.round(total * 100) / 100;
}

export function estimatedSteps(distanceMeters: number): number {
  return distanceMeters > 0 ? Math.round(distanceMeters / 0.72) : 0;
}

export function projectRoutePoint(
  point: WalkPoint,
  points: WalkPoint[],
  width = 360,
  height = 190,
): { x: number; y: number } | null {
  if (!points.length) return null;
  const minLat = Math.min(...points.map((item) => item.latitude));
  const maxLat = Math.max(...points.map((item) => item.latitude));
  const minLng = Math.min(...points.map((item) => item.longitude));
  const maxLng = Math.max(...points.map((item) => item.longitude));
  const latSpan = Math.max(maxLat - minLat, 0.00001);
  const lngSpan = Math.max(maxLng - minLng, 0.00001);
  const padding = 26;
  return {
    x: padding + ((point.longitude - minLng) / lngSpan) * (width - padding * 2),
    y: height - padding - ((point.latitude - minLat) / latSpan) * (height - padding * 2),
  };
}

export function buildRoutePath(points: WalkPoint[], width = 360, height = 190): string | null {
  if (points.length < 2) return null;
  return points
    .map((point, index) => {
      const projected = projectRoutePoint(point, points, width, height);
      if (!projected) return '';
      const { x, y } = projected;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

export async function startLocationTracking(onPoint: (point: WalkPoint) => void): Promise<() => void> {
  if (Platform.OS === 'web') {
    if (!globalThis.navigator?.geolocation) throw new Error('LOCATION_UNAVAILABLE');
    const watchId = globalThis.navigator.geolocation.watchPosition(
      (position) =>
        onPoint({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: position.timestamp || Date.now(),
        }),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );
    return () => globalThis.navigator.geolocation.clearWatch(watchId);
  }
  const Location = await import('expo-location');
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('LOCATION_DENIED');
  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      distanceInterval: 5,
      timeInterval: 5000,
    },
    (position) =>
      onPoint({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        timestamp: position.timestamp || Date.now(),
      }),
  );
  return () => subscription.remove();
}

export async function saveWalk(payload: WalkSavePayload): Promise<boolean> {
  if (!payload.dogId) return false;
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return false;
    const { error } = await getSupabaseClient().from('walks').insert({
      user_id: userId,
      dog_id: payload.dogId,
      started_at: payload.startedAt,
      ended_at: payload.endedAt,
      duration_seconds: payload.durationSeconds,
      distance_meters: payload.distanceMeters,
      steps_estimate: payload.stepsEstimate,
      route_points: payload.routePoints,
      park: payload.park ?? null,
      park_visited: payload.parkVisited ?? false,
      status: 'COMPLETED',
    });
    return !error;
  } catch {
    return false;
  }
}
