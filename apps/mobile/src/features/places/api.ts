import { Platform } from 'react-native';
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

async function readExpoLocation(): Promise<{ lat: number; lng: number } | null> {
  if (Platform.OS === 'web') return null;
  try {
    // Dynamic import keeps web bundles free of native location code.
    // Dependency is declared in package.json; local installs may lag CI.
    // @ts-ignore — types appear after local `pnpm add expo-location`
    const Location = (await import('expo-location')) as {
      Accuracy: { Balanced: number };
      requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
      getCurrentPositionAsync: (options?: {
        accuracy?: number;
      }) => Promise<{ coords: { latitude: number; longitude: number } }>;
    };
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return null;
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      lat: current.coords.latitude,
      lng: current.coords.longitude,
    };
  } catch {
    return null;
  }
}

async function readBrowserLocation(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 12000,
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

export async function readDeviceLocation(): Promise<{ lat: number; lng: number } | null> {
  if (Platform.OS === 'web') {
    return readBrowserLocation();
  }
  return (await readExpoLocation()) ?? (await readBrowserLocation());
}
