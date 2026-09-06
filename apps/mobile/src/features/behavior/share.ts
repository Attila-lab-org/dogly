/**
 * Condivisione risultato behavior: card testuale sanitizzata (UX_REFERENCE).
 * MAI raw video, path o URL firmati: solo headline, band di confidenza in
 * parole (mai %, O-07) ed evidence già mostrate all'utente.
 */
import { Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { BehaviorEventResult } from '../../contracts/types';
import { CONFIDENCE_BAND_LABELS, intentHeadline } from '../core/copy';
import { buildBehaviorShareCard } from './shareCopy';
export { buildBehaviorShareCard } from './shareCopy';
export type { BehaviorShareCard } from './shareCopy';

/** Share sheet nativo testuale. Ritorna false se annullata/fallita. */
export async function shareBehaviorResult(
  result: BehaviorEventResult,
  dogName: string,
  photoUri?: string | null,
): Promise<boolean> {
  const card = buildBehaviorShareCard(result, dogName);
  try {
    if (await Sharing.isAvailableAsync()) {
      const svgUri = await buildGraphicShareCard(
        result,
        dogName,
        photoUri ?? null,
      );
      await Sharing.shareAsync(svgUri, {
        mimeType: 'image/svg+xml',
        dialogTitle: `Condividi cosa ha capito Dogly di ${dogName}`,
        UTI: 'public.svg-image',
      });
      return true;
    }
    await Share.share({ title: card.title, message: card.message });
    return true;
  } catch {
    try {
      await Share.share({ title: card.title, message: card.message });
      return true;
    } catch {
      return false;
    }
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapLines(value: string, maxLength = 34): string[] {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines[lines.length - 1];
    if (!current || current.length + word.length + 1 > maxLength) {
      lines.push(word);
    } else {
      lines[lines.length - 1] = `${current} ${word}`;
    }
  }
  return lines.slice(0, 4);
}

async function photoDataUri(photoUri: string | null): Promise<string | null> {
  if (!photoUri) return null;
  try {
    let localUri = photoUri;
    if (/^https?:\/\//i.test(photoUri)) {
      localUri = `${FileSystem.cacheDirectory}dogly-share-dog`;
      const downloaded = await FileSystem.downloadAsync(photoUri, localUri);
      localUri = downloaded.uri;
    }
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const mime = /\.png(?:$|\?)/i.test(photoUri)
      ? 'image/png'
      : /\.webp(?:$|\?)/i.test(photoUri)
        ? 'image/webp'
        : 'image/jpeg';
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

async function buildGraphicShareCard(
  result: BehaviorEventResult,
  dogName: string,
  photoUri: string | null,
): Promise<string> {
  const headline = intentHeadline(dogName, result.primary_intent);
  const lines = wrapLines(headline);
  const image = await photoDataUri(photoUri);
  const initial = escapeXml(dogName.trim().charAt(0).toUpperCase() || 'D');
  const headlineSvg = lines
    .map(
      (line, index) =>
        `<text x="540" y="${460 + index * 62}" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="700" fill="#14213D">${escapeXml(line)}</text>`,
    )
    .join('');
  const portrait = image
    ? `<image href="${image}" x="390" y="90" width="300" height="300" preserveAspectRatio="xMidYMid slice" clip-path="url(#portrait)" />`
    : `<circle cx="540" cy="240" r="150" fill="#DDF7F2"/><text x="540" y="275" text-anchor="middle" font-family="Arial, sans-serif" font-size="120" font-weight="700" fill="#168F83">${initial}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
<defs><clipPath id="portrait"><circle cx="540" cy="240" r="150"/></clipPath><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#F4FBFA"/><stop offset="1" stop-color="#EAF0FF"/></linearGradient></defs>
<rect width="1080" height="1350" rx="64" fill="url(#bg)"/>
<circle cx="900" cy="170" r="180" fill="#DDF7F2" opacity=".65"/>
<circle cx="130" cy="1130" r="220" fill="#DCE6FF" opacity=".65"/>
${portrait}
<circle cx="540" cy="240" r="154" fill="none" stroke="#FFFFFF" stroke-width="12"/>
<text x="540" y="405" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" letter-spacing="4" fill="#168F83">DOGLY HA OSSERVATO</text>
${headlineSvg}
<rect x="120" y="780" width="840" height="230" rx="36" fill="#FFFFFF" opacity=".94"/>
<text x="170" y="850" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#168F83">Una lettura prudente</text>
<text x="170" y="905" font-family="Arial, sans-serif" font-size="30" fill="#44516A">${escapeXml(CONFIDENCE_BAND_LABELS[result.confidence_band])}</text>
<text x="170" y="960" font-family="Arial, sans-serif" font-size="25" fill="#667085">Un&apos;osservazione, non una diagnosi.</text>
<text x="540" y="1170" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="#14213D">Guarda cosa ha capito Dogly</text>
<text x="540" y="1220" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#667085">del mio cane ${escapeXml(dogName)} 🐾</text>
</svg>`;
  const uri = `${FileSystem.cacheDirectory}dogly-${result.eventId}.svg`;
  await FileSystem.writeAsStringAsync(uri, svg);
  return uri;
}
