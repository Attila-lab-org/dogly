import { Alert, Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { WalkPoint } from './tracking';
import { buildRoutePath } from './tracking';

export type WalkSharePayload = {
  dogName: string;
  duration: string;
  distance: string;
  steps: string;
  date: string;
  routePoints: WalkPoint[];
  includeRoute: boolean;
};

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function buildSvg(payload: WalkSharePayload): string {
  const route = payload.includeRoute ? buildRoutePath(payload.routePoints, 720, 300) : null;
  const line = route ?? 'M 42 224 C 130 150 184 258 282 188 S 472 84 548 170 S 642 230 678 104';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e7f8f2"/><stop offset="1" stop-color="#f7fbff"/></linearGradient><linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#18b998"/><stop offset="1" stop-color="#087f81"/></linearGradient></defs>
    <rect width="900" height="1200" rx="54" fill="url(#bg)"/>
    <circle cx="770" cy="110" r="125" fill="#ccefe4" opacity=".65"/><circle cx="120" cy="1050" r="180" fill="#e6f3ff" opacity=".8"/>
    <text x="78" y="110" fill="#087f81" font-family="Arial,sans-serif" font-size="24" font-weight="700" letter-spacing="5">DOGLY</text>
    <text x="78" y="180" fill="#19324a" font-family="Arial,sans-serif" font-size="54" font-weight="700">Passeggiata di</text>
    <text x="78" y="248" fill="#19324a" font-family="Arial,sans-serif" font-size="66" font-weight="800">${escapeXml(payload.dogName)}</text>
    <text x="78" y="298" fill="#63798b" font-family="Arial,sans-serif" font-size="24">${escapeXml(payload.date)} · un momento tutto vostro</text>
    <rect x="54" y="350" width="792" height="340" rx="38" fill="#d7eee8"/>
    <path d="${line}" fill="none" stroke="#fff" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${line}" fill="none" stroke="#16a88f" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="18 15"/>
    <circle cx="42" cy="224" r="17" fill="#fff" stroke="#2563eb" stroke-width="8"/><circle cx="678" cy="104" r="20" fill="#fff" stroke="#16a88f" stroke-width="9"/>
    <rect x="54" y="740" width="792" height="188" rx="34" fill="#fff" opacity=".92"/>
    <text x="102" y="808" fill="#687f91" font-family="Arial,sans-serif" font-size="22">TEMPO</text><text x="102" y="874" fill="#19324a" font-family="Arial,sans-serif" font-size="42" font-weight="800">${escapeXml(payload.duration)}</text>
    <text x="355" y="808" fill="#687f91" font-family="Arial,sans-serif" font-size="22">DISTANZA</text><text x="355" y="874" fill="#19324a" font-family="Arial,sans-serif" font-size="42" font-weight="800">${escapeXml(payload.distance)}</text>
    <text x="650" y="808" fill="#687f91" font-family="Arial,sans-serif" font-size="22">PASSI</text><text x="650" y="874" fill="#19324a" font-family="Arial,sans-serif" font-size="42" font-weight="800">${escapeXml(payload.steps)}</text>
    <rect x="54" y="982" width="792" height="106" rx="28" fill="url(#accent)"/><text x="450" y="1048" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="28" font-weight="700">Ogni passo è un ricordo.</text>
    <text x="450" y="1145" text-anchor="middle" fill="#6d8493" font-family="Arial,sans-serif" font-size="20">Condiviso con Dogly</text>
  </svg>`;
}

export async function shareWalkCard(payload: WalkSharePayload): Promise<'shared' | 'copied' | 'cancelled'> {
  const title = `Passeggiata di ${payload.dogName}`;
  const message = `${title}\n${payload.duration} · ${payload.distance} · ${payload.steps} passi\n${payload.date}`;
  try {
    const svg = buildSvg(payload);
    if (Platform.OS === 'web') {
      const webNavigator = globalThis.navigator as Navigator & { canShare?: (data: ShareData) => boolean; share?: (data: ShareData) => Promise<void> };
      if (webNavigator.share) {
        const file = new File([new Blob([svg], { type: 'image/svg+xml' })], `dogly-${payload.dogName.toLowerCase().replace(/\s+/g, '-')}.svg`, { type: 'image/svg+xml' });
        const data: ShareData = { title, text: message, files: [file] };
        if (!webNavigator.canShare || webNavigator.canShare(data)) {
          await webNavigator.share(data);
          return 'shared';
        }
        await webNavigator.share({ title, text: message });
        return 'shared';
      }
      await globalThis.navigator.clipboard?.writeText(message);
      Alert.alert('Riepilogo copiato', 'Puoi incollarlo dove vuoi.');
      return 'copied';
    }
    if (await Sharing.isAvailableAsync() && FileSystem.cacheDirectory) {
      const uri = `${FileSystem.cacheDirectory}dogly-walk-${Date.now()}.svg`;
      await FileSystem.writeAsStringAsync(uri, svg, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(uri, { mimeType: 'image/svg+xml', dialogTitle: title, UTI: 'public.svg-image' });
      return 'shared';
    }
    await Share.share({ title, message });
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    try {
      await Share.share({ title, message });
      return 'shared';
    } catch {
      Alert.alert('Condivisione non riuscita', 'Riprova tra poco.');
      return 'cancelled';
    }
  }
}
