/**
 * Store links are intentionally configuration-driven. Placeholder URLs make a
 * published landing page look clickable while sending visitors to a 404 page.
 * Keep the CTA disabled until the real public listing URL is configured.
 */
function publicUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export const APP_STORE_URL = publicUrl(process.env.NEXT_PUBLIC_APP_STORE_URL);
export const PLAY_STORE_URL = publicUrl(process.env.NEXT_PUBLIC_PLAY_STORE_URL);
