/**
 * Hero Home ("il cane ti parla"): selezione del messaggio del fumetto —
 * agenda entro 7 giorni vince sempre, poi rotazione giornaliera deterministica
 * (seed = data + cane) tra pattern, consiglio razza/contesto e promemoria
 * digestione, infine saluto per fascia oraria. Solo dati reali, mai inventati.
 * Qui anche le battute affettuose del tap e il flag "ingresso teatrale già
 * mostrato oggi" su AsyncStorage (backend iniettabile per i test, come in
 * features/checkin/persistence).
 */
import type { CareEventType } from '../care/types';
import { localDayKey, type KeyValueStorage } from '../checkin/persistence';

export type DayPart = 'morning' | 'afternoon' | 'evening';

export function dayPartForHour(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

export const HERO_CARE_WINDOW_DAYS = 7;
export const DIGESTIVE_REMINDER_DAYS = 4;

export interface HeroCareHint {
  eventType: CareEventType;
  /** Giorni di calendario all'evento (0 = oggi, 1 = domani). */
  daysUntil: number;
}

export interface HeroMessageInput {
  hour: number;
  careHint?: HeroCareHint | null;
  /** Titolo reale del pattern più recente; undefined = dato non disponibile. */
  patternTitle?: string | null;
  /**
   * Giorni dall'ultimo controllo digestione; null = mai fatto;
   * undefined = dato non disponibile (mock gate, errore API).
   */
  daysSinceDigestive?: number | null;
  /** Consiglio razza/contesto già composto (breedTraits); undefined = assente. */
  breedTip?: string | null;
  /** Seed della rotazione giornaliera (data locale + cane). */
  dayKey?: string;
  dogId?: string;
}

export type HeroMessageKind =
  | 'care'
  | 'pattern'
  | 'breed'
  | 'digestive'
  | 'greeting';

export interface HeroMessage {
  kind: HeroMessageKind;
  text: string;
}

const CARE_THINGS: Record<CareEventType, string> = {
  VACCINE: 'il richiamo del vaccino',
  VET_VISIT: 'la visita dal veterinario',
  PARASITE_TREATMENT: 'l’antiparassitario',
  EXAM: 'un controllo',
  THERAPY: 'la mia terapia',
  OTHER: 'un impegno che mi riguarda',
};

function whenLabel(daysUntil: number): string {
  if (daysUntil <= 0) return 'oggi';
  if (daysUntil === 1) return 'domani';
  return `tra ${daysUntil} giorni`;
}

const GREETINGS: Record<DayPart, string> = {
  morning: 'Buongiorno! Ho già scodinzolato: come mi vedi oggi?',
  afternoon: 'Ciao! Sono qui con te: come sto andando, secondo te?',
  evening: 'Buonasera! Che giornata insieme… come ti sembro stasera?',
};

/**
 * Indice stabile nel giorno per la rotazione dei candidati: stesso giorno
 * e stesso cane → stesso messaggio; giorni diversi → candidati diversi.
 */
export function dailySeedIndex(
  dayKey: string,
  dogId: string,
  count: number,
): number {
  if (count <= 0) return 0;
  let hash = 0;
  const key = `${dayKey}:${dogId}`;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % count;
}

export function selectHeroMessage(input: HeroMessageInput): HeroMessage {
  const hint = input.careHint;
  if (
    hint &&
    hint.daysUntil >= 0 &&
    hint.daysUntil <= HERO_CARE_WINDOW_DAYS
  ) {
    return {
      kind: 'care',
      text: `Psst… ${whenLabel(hint.daysUntil)} ho ${CARE_THINGS[hint.eventType]}. Mi tieni la zampa?`,
    };
  }
  // Rotazione giornaliera deterministica tra i candidati disponibili.
  const candidates: HeroMessage[] = [];
  const patternTitle = input.patternTitle?.trim();
  if (patternTitle) {
    candidates.push({
      kind: 'pattern',
      text: `Ho scoperto una cosa di me: “${patternTitle}”. Ti incuriosisce?`,
    });
  }
  const breedTip = input.breedTip?.trim();
  if (breedTip) {
    candidates.push({ kind: 'breed', text: breedTip });
  }
  const days = input.daysSinceDigestive;
  if (days !== undefined && (days === null || days >= DIGESTIVE_REMINDER_DAYS)) {
    candidates.push({
      kind: 'digestive',
      text: 'È da un po’ che non controlliamo la mia pupù… per il resto tutto a posto!',
    });
  }
  if (candidates.length > 0) {
    return candidates[
      dailySeedIndex(input.dayKey ?? '', input.dogId ?? '', candidates.length)
    ];
  }
  return { kind: 'greeting', text: GREETINGS[dayPartForHour(input.hour)] };
}

export const AFFECTIONATE_LINES: readonly string[] = [
  'Ti voglio un mondo di bene!',
  'Sei il mio umano preferito, lo sai?',
  'Un grattino qui, per favore?',
  'Con te ogni giorno è una festa!',
  'Pancia all’aria: fiducia massima!',
];

export const JOYFUL_LINE = 'Urrà! Scodinzolo dalla gioia!';

export function randomAffectionateLine(
  random: () => number = Math.random,
): string {
  const index = Math.min(
    AFFECTIONATE_LINES.length - 1,
    Math.floor(random() * AFFECTIONATE_LINES.length),
  );
  return AFFECTIONATE_LINES[index];
}

export function splitWords(text: string): string[] {
  return text.split(' ').filter((word) => word.length > 0);
}

/* ------------------------------------------------------------------ */
/* Flag "ingresso teatrale mostrato oggi" — scoped per cane.           */
/* ------------------------------------------------------------------ */

let injectedBackend: KeyValueStorage | null = null;

/** Test/dev: inietta uno storage in-memory invece di AsyncStorage. */
export function setHeroStorageBackend(backend: KeyValueStorage | null): void {
  injectedBackend = backend;
}

async function storage(): Promise<KeyValueStorage | null> {
  if (injectedBackend) return injectedBackend;
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    return mod.default;
  } catch {
    return null;
  }
}

function heroKey(dogId?: string): string {
  return `home-hero:shown-day:v1:${dogId?.trim() || 'default'}`;
}

/** Giorno locale (localDayKey) dell'ultimo ingresso teatrale mostrato. */
export async function loadHeroShownDay(dogId?: string): Promise<string | null> {
  const store = await storage();
  if (!store) return null;
  try {
    return await store.getItem(heroKey(dogId));
  } catch {
    return null;
  }
}

export async function saveHeroShownDay(
  dayKey: string = localDayKey(),
  dogId?: string,
): Promise<void> {
  const store = await storage();
  if (!store) return;
  try {
    await store.setItem(heroKey(dogId), dayKey);
  } catch {
    // persistenza best-effort: al prossimo avvio l'animazione può ripartire
  }
}
