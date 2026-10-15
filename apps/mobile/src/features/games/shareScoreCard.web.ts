/**
 * Condivisione risultato "Scoiattolo!" nelle storie (web): genera una card
 * PNG del risultato (SVG → canvas, niente dipendenze nuove) e la carica
 * nell'album Momenti — così diventa una storia vera nella rail Social.
 */
import {
  getOrCreateMomentsAlbum,
  uploadAlbumPhoto,
} from '../photos/api';

const CARD_W = 1080;
const CARD_H = 1350;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function resultCardSvg(dogName: string, score: number, isRecord: boolean, gameLabel: string): string {
  const name = escapeXml(dogName);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0E2A47"/>
      <stop offset="0.55" stop-color="#14385E"/>
      <stop offset="1" stop-color="#14B8A6"/>
    </linearGradient>
  </defs>
  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#bg)"/>
  <g fill="#FFFFFF" opacity="0.12">
    <ellipse cx="140" cy="180" rx="34" ry="26"/><circle cx="112" cy="146" r="10"/><circle cx="140" cy="136" r="10"/><circle cx="168" cy="146" r="10"/>
    <ellipse cx="930" cy="330" rx="34" ry="26"/><circle cx="902" cy="296" r="10"/><circle cx="930" cy="286" r="10"/><circle cx="958" cy="296" r="10"/>
    <ellipse cx="160" cy="1180" rx="34" ry="26"/><circle cx="132" cy="1146" r="10"/><circle cx="160" cy="1136" r="10"/><circle cx="188" cy="1146" r="10"/>
    <ellipse cx="920" cy="1120" rx="34" ry="26"/><circle cx="892" cy="1086" r="10"/><circle cx="920" cy="1076" r="10"/><circle cx="948" cy="1086" r="10"/>
  </g>
  <text x="540" y="330" font-family="sans-serif" font-size="86" font-weight="700" fill="#FFFFFF" text-anchor="middle">${escapeXml(gameLabel)}</text>
  <g>
    <ellipse cx="540" cy="640" rx="150" ry="140" fill="#FFF9F0" stroke="#0E2A47" stroke-width="10"/>
    <path d="M660 760 C760 740 780 640 730 580 C700 545 660 545 650 575 C640 600 665 615 685 600 C670 640 675 690 640 720 Z" fill="#CCFBF1" stroke="#0E2A47" stroke-width="10" stroke-linejoin="round"/>
    <circle cx="470" cy="610" r="16" fill="#0E2A47"/><circle cx="610" cy="610" r="16" fill="#0E2A47"/>
    <ellipse cx="540" cy="650" rx="18" ry="13" fill="#14B8A6"/>
    <path d="M505 685 Q540 715 575 685" stroke="#0E2A47" stroke-width="10" fill="none" stroke-linecap="round"/>
    <circle cx="450" cy="660" r="18" fill="#14B8A6" opacity="0.35"/><circle cx="630" cy="660" r="18" fill="#14B8A6" opacity="0.35"/>
  </g>
  <text x="540" y="990" font-family="sans-serif" font-size="190" font-weight="800" fill="#FFFFFF" text-anchor="middle">${score}</text>
  <text x="540" y="1075" font-family="sans-serif" font-size="54" font-weight="600" fill="#CCFBF1" text-anchor="middle">punti per ${name}</text>
  ${isRecord ? '<text x="540" y="1150" font-family="sans-serif" font-size="48" font-weight="700" fill="#F6C94C" text-anchor="middle">Nuovo record personale!</text>' : ''}
  <text x="540" y="1290" font-family="sans-serif" font-size="38" font-weight="600" fill="#FFFFFF" opacity="0.85" text-anchor="middle">Dogly · Giochi del quartiere</text>
</svg>`;
}

async function rasterize(svgMarkup: string): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const svgUrl = URL.createObjectURL(new Blob([svgMarkup], { type: 'image/svg+xml' }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('svg load failed'));
      img.src = svgUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, CARD_W, CARD_H);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function shareSquirrelResult({
  dogId,
  dogName,
  score,
  best,
  gameLabel = 'Scoiattolo!',
}: {
  dogId: string;
  dogName: string;
  score: number;
  best: number;
  gameLabel?: string;
}): Promise<boolean> {
  try {
    const cardUrl = await rasterize(
      resultCardSvg(dogName, score, best > 0 && score >= best, gameLabel),
    );
    if (!cardUrl) return false;
    const album = await getOrCreateMomentsAlbum(dogId);
    await uploadAlbumPhoto(album.id, cardUrl, {
      caption: `${dogName}: ${score} punti a ${gameLabel}`,
      visibility: 'PRIVATE',
    });
    return true;
  } catch {
    return false;
  }
}
