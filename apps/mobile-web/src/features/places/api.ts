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

export type LocationFailureReason = 'denied' | 'timeout' | 'unavailable';

export type DeviceLocationResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: LocationFailureReason };

const LOCATION_TIMEOUT_MS = 8_000;
const PLACES_TIMEOUT_MS = 18_000;

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(onTimeout()), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(onTimeout());
      });
  });
}

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
    { timeoutMs: PLACES_TIMEOUT_MS },
  );
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null) return 'Nelle vicinanze';
  if (meters < 1000) return `${Math.max(50, Math.round(meters / 50) * 50)} m`;
  const km = meters / 1000;
  return `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`;
}

async function readExpoLocation(): Promise<DeviceLocationResult> {
  if (Platform.OS === 'web') return { ok: false, reason: 'unavailable' };
  try {
    const Location = await import('expo-location');
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return { ok: false, reason: 'denied' };
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      ok: true,
      lat: current.coords.latitude,
      lng: current.coords.longitude,
    };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

async function readBrowserLocation(): Promise<DeviceLocationResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { ok: false, reason: 'unavailable' };
  }
  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: LOCATION_TIMEOUT_MS,
        maximumAge: 120000,
      });
    });
    return {
      ok: true,
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? Number((error as GeolocationPositionError).code)
        : null;
    if (code === 1) return { ok: false, reason: 'denied' };
    if (code === 3) return { ok: false, reason: 'timeout' };
    return { ok: false, reason: 'unavailable' };
  }
}

export async function readDeviceLocationResult(): Promise<DeviceLocationResult> {
  const timedOut: DeviceLocationResult = { ok: false, reason: 'timeout' };
  if (Platform.OS === 'web') {
    return withTimeout(readBrowserLocation(), LOCATION_TIMEOUT_MS + 500, () => timedOut);
  }
  const native = await withTimeout(
    readExpoLocation(),
    LOCATION_TIMEOUT_MS + 500,
    () => timedOut,
  );
  if (native.ok || native.reason === 'denied') return native;
  return withTimeout(readBrowserLocation(), LOCATION_TIMEOUT_MS + 500, () => timedOut);
}

/** Best-effort coords for Ask weather; never hangs the chat. */
export async function readDeviceLocation(): Promise<{ lat: number; lng: number } | null> {
  const result = await readDeviceLocationResult();
  return result.ok ? { lat: result.lat, lng: result.lng } : null;
}

export function locationFailureCopy(reason: LocationFailureReason): string {
  if (reason === 'denied') {
    return 'Serve il permesso di posizione per i posti vicini. Attivalo nelle impostazioni del browser o del telefono, poi riprova.';
  }
  if (reason === 'timeout') {
    return 'La posizione sta impiegando troppo. Riprova, oppure apri la mappa senza GPS.';
  }
  return 'Non riesco a leggere la posizione su questo dispositivo. Puoi comunque aprire la mappa.';
}
