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
  phone?: string | null;
};

export type LocationFailureReason = 'denied' | 'timeout' | 'unavailable';

export type DeviceLocationResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: LocationFailureReason };

const LOCATION_TIMEOUT_MS = 6_000;
/** Chat only needs weather optionally — never block the turn for GPS. */
const CHAT_LOCATION_TIMEOUT_MS = 1_500;
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
  /** Default backend 8km; alza per zone sparse. */
  radius_m?: number;
  /** Pronto soccorso / cliniche 24h (forza ricerca vet urgente). */
  purpose?: 'default' | 'emergency';
}) {
  const params = new URLSearchParams({
    lat: String(options.lat),
    lng: String(options.lng),
    radius_m: String(options.radius_m ?? 12_000),
  });
  if (options.kind) params.set('kind', options.kind);
  if (options.purpose && options.purpose !== 'default') {
    params.set('purpose', options.purpose);
  }
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
    try {
      const last = await Location.getLastKnownPositionAsync();
      if (last && Date.now() - last.timestamp < 10 * 60_000) {
        return {
          ok: true,
          lat: last.coords.latitude,
          lng: last.coords.longitude,
        };
      }
    } catch {
      // fall through
    }
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

/** GPS aggressivo per schermate di emergenza (timeout corto). */
export async function readDeviceLocationFast(): Promise<DeviceLocationResult> {
  const timedOut: DeviceLocationResult = { ok: false, reason: 'timeout' };
  return withTimeout(readDeviceLocationResult(), 3_500, () => timedOut);
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
  const timedOut: DeviceLocationResult = { ok: false, reason: 'timeout' };
  const result = await withTimeout(
    readDeviceLocationResult(),
    CHAT_LOCATION_TIMEOUT_MS,
    () => timedOut,
  );
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
