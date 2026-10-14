import { api } from '@/lib/apiClient';

export type NearbyPlace = {
  id: string;
  name: string;
  kind: 'PARK' | 'VET';
  distance_m: number | null;
  lat: number;
  lng: number;
  maps_url: string;
};

export function fetchNearbyPlaces(options: {
  lat: number;
  lng: number;
  kind?: 'PARK' | 'VET';
}) {
  const params = new URLSearchParams({
    lat: String(options.lat),
    lng: String(options.lng),
  });
  if (options.kind) params.set('kind', options.kind);
  return api.get<{ items: NearbyPlace[]; location_label: string | null }>(
    `/v1/places/nearby?${params.toString()}`,
  );
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null) return 'Nelle vicinanze';
  if (meters < 1000) return `${Math.max(50, Math.round(meters / 50) * 50)} m`;
  const km = meters / 1000;
  return `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`;
}

export async function readDeviceLocation(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 120000,
        });
      });
      return {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
    } catch {
      return null;
    }
  }
  return null;
}
