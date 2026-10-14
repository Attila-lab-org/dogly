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

function careDogLine(hint: HeroCareHint): string {
  return `Psst… ${whenLabel(hint.daysUntil)} ho ${CARE_THINGS[hint.eventType]}. Mi tieni la zampa?`;
}

function patternDogLine(title: string): string {
  return `Ho scoperto una cosa di me: “${title}”. Ti incuriosisce?`;
}

const DIGESTIVE_DOG_LINE =
  'È da un po’ che non controlliamo la mia pupù… per il resto tutto a posto!';

export function selectHeroMessage(input: HeroMessageInput): HeroMessage {
  const hint = input.careHint;
  if (
    hint &&
    hint.daysUntil >= 0 &&
    hint.daysUntil <= HERO_CARE_WINDOW_DAYS
  ) {
    return { kind: 'care', text: careDogLine(hint) };
  }
  // Rotazione giornaliera deterministica tra i candidati disponibili.
  const candidates: HeroMessage[] = [];
  const patternTitle = input.patternTitle?.trim();
  if (patternTitle) {
    candidates.push({ kind: 'pattern', text: patternDogLine(patternTitle) });
  }
  const breedTip = input.breedTip?.trim();
  if (breedTip) {
    candidates.push({ kind: 'breed', text: breedTip });
  }
  const days = input.daysSinceDigestive;
  if (days !== undefined && (days === null || days >= DIGESTIVE_REMINDER_DAYS)) {
    candidates.push({ kind: 'digestive', text: DIGESTIVE_DOG_LINE });
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
];export const JOYFUL_LINE = 'Urrà! Scodinzolo dalla gioia!';

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
/* Mazzo di consigli contestuali ("consulente quotidiano del cane").   */
/* Ogni carta: voce del cane (dogLine) + consiglio pratico (adviceLine).*/
/* Urgent prima (agenda, poi meteo estremo), il resto mescolato con    */
/* seed data+cane: stesso giorno stesso mazzo, giorni diversi ordine   */
/* diverso. Solo dati reali; input assenti → carte mai inventate.      */
/* ------------------------------------------------------------------ */

export interface HeroWeather {
  temperatureC: number;
  weatherCode: number | null;
}

export interface HeroTip {
  /** Stabile nel giorno (es. 'weather:hot', 'care:VACCINE:3'). */
  id: string;
  priority: 'urgent' | 'normal';
  /** Prima persona del cane, emotiva. */
  dogLine: string;
  /** Consiglio pratico per l'umano (seconda voce del fumetto). */
  adviceLine?: string;
  /** Destinazione al tap sul fumetto; undefined = non-button. */
  route?: string;
}

export interface HeroTipsInput {
  dogId: string;
  dayKey: string;
  hour: number;
  /** Mese 1-12 per il consiglio stagionale (fallback senza meteo). */
  month: number;
  careHint?: HeroCareHint | null;
  patternTitle?: string | null;
  daysSinceDigestive?: number | null;
  breedTip?: string | null;
  weather?: HeroWeather | null;
  /** Età in anni (da birthDate o ageLabel); null/undefined = salta. */
  ageYears?: number | null;
  /** Taglia piccola: guida la variante freddo (cappottino). */
  smallSize?: boolean;
  activeFoodName?: string | null;
  /** Mesi con lo stesso alimento attivo; null = appena cambiato. */
  activeFoodMonths?: number | null;
  /** true quando i dati nutrizione sono stati caricati (mai inventare). */
  foodDataKnown?: boolean;
}

const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

export const WEATHER_HOT_C = 30;
export const WEATHER_COLD_C = 5;

/** Età in anni da birthDate ISO, altrimenti da ageLabel ("5 anni", "8 mesi"). */
export function ageYearsFrom(
  birthDate: string | null | undefined,
  ageLabel: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (birthDate) {
    const parsed = Date.parse(birthDate);
    if (!Number.isNaN(parsed)) {
      const years =
        (now.getTime() - parsed) / (365.25 * 24 * 60 * 60 * 1000);
      if (years >= 0) return Math.floor(years * 10) / 10;
    }
  }
  const label = ageLabel?.toLocaleLowerCase('it') ?? '';
  const yearsMatch = label.match(/(\d+)\s*ann/);
  if (yearsMatch) return Number(yearsMatch[1]);
  const monthsMatch = label.match(/(\d+)\s*mes/);
  if (monthsMatch) return Number(monthsMatch[1]) / 12;
  return null;
}

/** PRNG deterministico dal seed (FNV-1a + mulberry-ish). */
function seededRandom(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Shuffle Fisher-Yates; con seed stringa è deterministico nel giorno. */
export function shuffleTips(
  tips: readonly HeroTip[],
  random: () => number,
): HeroTip[] {
  const deck = [...tips];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const EVERGREEN_TIPS: readonly HeroTip[] = [
  {
    id: 'evergreen:water',
    priority: 'normal',
    dogLine: 'Regola numero uno: la ciotola dell’acqua è sacra.',
    adviceLine: 'Acqua fresca e pulita ogni giorno; d’estate cambiala due volte.',
  },
  {
    id: 'evergreen:nails',
    priority: 'normal',
    dogLine: 'Le mie unghiette fanno tip-tap sul pavimento.',
    adviceLine: 'Se senti il tip-tap sul pavimento, è ora di un controllo alle unghie.',
  },
  {
    id: 'evergreen:teeth',
    priority: 'normal',
    dogLine: 'Sorriso smagliante anche per me, per favore.',
    adviceLine: 'Un gioco da masticare al giorno aiuta denti e gengive (e salva i mobili).',
  },
  {
    id: 'evergreen:sniff',
    priority: 'normal',
    dogLine: 'Dieci minuti di naso a terra valgono più di un’ora di corsa.',
    adviceLine: 'Nascondi qualche bocconcino in casa o in giardino: il fiuto mi rilassa.',
  },
  {
    id: 'evergreen:weight',
    priority: 'normal',
    dogLine: 'La linea conta anche per noi quadrupedi.',
    adviceLine: 'Pesami una volta al mese: le piccole variazioni si notano solo così.',
  },
];

function seasonalTip(month: number): HeroTip {
  if (month >= 3 && month <= 5) {
    return {
      id: 'season:spring',
      priority: 'normal',
      dogLine: 'L’aria profuma di primavera e di mille nasi al lavoro!',
      adviceLine: 'Attenzione a forasacchi e pollini: controlla orecchie e zampe dopo il prato.',
    };
  }
  if (month >= 6 && month <= 8) {
    return {
      id: 'season:summer',
      priority: 'normal',
      dogLine: 'Estate! Io voto per l’ombra e una bella siesta.',
      adviceLine: 'Zecche e caldo: ispeziona il mantello dopo le uscite, mai auto sotto il sole.',
    };
  }
  if (month >= 9 && month <= 11) {
    return {
      id: 'season:autumn',
      priority: 'normal',
      dogLine: 'Foglie croccanti e odori nuovi: la mia stagione preferita!',
      adviceLine: 'Funghi e castagne tentano il mio naso: occhio a cosa raccolgo da terra.',
    };
  }
  return {
    id: 'season:winter',
    priority: 'normal',
    dogLine: 'Aria frizzante e passeggiate corte: poi tutti sul divano!',
    adviceLine: 'Il sale antigelo irrita i polpastrelli: sciacqua le zampe al rientro.',
  };
}

function weatherTip(
  weather: HeroWeather,
  smallSize: boolean,
): { urgent: HeroTip | null; mild: HeroTip | null } {
  const code = weather.weatherCode;
  if (code !== null && SNOW_CODES.has(code)) {
    return {
      urgent: {
        id: 'weather:snow',
        priority: 'urgent',
        dogLine: 'Neve! La neve! Potrei scodinzolare fino a domani!',
        adviceLine: 'Occhio alle palline di ghiaccio tra i polpastrelli: scioglile con acqua tiepida.',
      },
      mild: null,
    };
  }
  if (code !== null && RAIN_CODES.has(code)) {
    return {
      urgent: {
        id: 'weather:rain',
        priority: 'urgent',
        dogLine: 'Piove! I salti nelle pozzanghere quasi mi tentano… quasi.',
        adviceLine: 'Al rientro asciuga bene zampe e pancia: la pelle umida si irrita in fretta.',
      },
      mild: null,
    };
  }
  if (weather.temperatureC >= WEATHER_HOT_C) {
    return {
      urgent: {
        id: 'weather:hot',
        priority: 'urgent',
        dogLine: 'Oggi il sole picchia forte: la mia pancia vota per l’ombra!',
        adviceLine: 'Acqua sempre piena e uscite al mattino presto o alla sera: l’asfalto caldo brucia i polpastrelli.',
      },
      mild: null,
    };
  }
  if (weather.temperatureC <= WEATHER_COLD_C) {
    return {
      urgent: {
        id: 'weather:cold',
        priority: 'urgent',
        dogLine: 'Brr, che aria frizzante oggi!',
        adviceLine: smallSize
          ? 'Uscite più corte e un cappottino mi aiutano; al rientro asciuga bene le zampe.'
          : 'Uscite un po’ più corte e zampe asciutte al rientro: il freddo si fa sentire.',
      },
      mild: null,
    };
  }
  return {
    urgent: null,
    mild: {
      id: 'weather:mild',
      priority: 'normal',
      dogLine: 'Che giornata ideale per annusare il mondo!',
      adviceLine: 'Perfetta per una passeggiata lunga: il fiuto mi stanca più della corsa.',
    },
  };
}

function ageTips(ageYears: number): HeroTip[] {
  if (ageYears < 1) {
    return [
      {
        id: 'age:puppy:explore',
        priority: 'normal',
        dogLine: 'Sono piccolo e il mondo è enorme: ogni cosa è una scoperta!',
        adviceLine: 'Giochi brevi e tanti pisolini: noi cuccioli impariamo poco alla volta.',
      },
      {
        id: 'age:puppy:teeth',
        priority: 'normal',
        dogLine: 'I dentini mi prudono: rosicchierei anche il divano.',
        adviceLine: 'Offrimi giochi da mordere adatti ai cuccioli e metti le scarpe al sicuro.',
      },
    ];
  }
  if (ageYears >= 8) {
    return [
      {
        id: 'age:senior:joints',
        priority: 'normal',
        dogLine: 'Zampe sagge e naso ancora curioso: ecco il mio segreto.',
        adviceLine: 'Passeggiate più corte ma più frequenti: le articolazioni ringraziano.',
      },
      {
        id: 'age:senior:checks',
        priority: 'normal',
        dogLine: 'Amo la quiete, ma non dico mai no a una bella annusata.',
        adviceLine: 'Un controllo dal veterinario due volte l’anno ci tiene sereni.',
      },
    ];
  }
  return [];
}

export function buildHeroTips(input: HeroTipsInput): HeroTip[] {
  const urgent: HeroTip[] = [];
  const normal: HeroTip[] = [];

  const hint = input.careHint;
  if (hint && hint.daysUntil >= 0 && hint.daysUntil <= HERO_CARE_WINDOW_DAYS) {
    urgent.push({
      id: `care:${hint.eventType}:${hint.daysUntil}`,
      priority: 'urgent',
      dogLine: careDogLine(hint),
      adviceLine: 'È segnato nella nostra agenda: andiamo insieme, vero?',
      route: '/care',
    });
  }

  if (input.weather) {
    const { urgent: weatherUrgent, mild } = weatherTip(
      input.weather,
      input.smallSize ?? false,
    );
    if (weatherUrgent) urgent.push(weatherUrgent);
    if (mild) normal.push(mild);
  } else {
    normal.push(seasonalTip(input.month));
  }

  const breedTip = input.breedTip?.trim();
  if (breedTip) {
    normal.push({ id: 'breed:tip', priority: 'normal', dogLine: breedTip });
  }

  const patternTitle = input.patternTitle?.trim();
  if (patternTitle) {
    normal.push({
      id: `pattern:${patternTitle}`,
      priority: 'normal',
      dogLine: patternDogLine(patternTitle),
      adviceLine: 'Dai un’occhiata alle mie abitudini e dimmi se ci ho azzeccato.',
      route: '/patterns',
    });
  }

  const days = input.daysSinceDigestive;
  if (days !== undefined && (days === null || days >= DIGESTIVE_REMINDER_DAYS)) {
    normal.push({
      id: 'digestive:reminder',
      priority: 'normal',
      dogLine: DIGESTIVE_DOG_LINE,
      adviceLine: 'Una foto ogni tanto ci aiuta a seguire la mia salute con calma.',
      route: '/digestive',
    });
  }

  if (input.ageYears != null) {
    normal.push(...ageTips(input.ageYears));
  }

  if (input.foodDataKnown) {
    const months = input.activeFoodMonths;
    const foodName = input.activeFoodName?.trim();
    if (foodName && months != null && months >= 3) {
      normal.push({
        id: `food:same:${Math.floor(months)}`,
        priority: 'normal',
        dogLine: `Il mio ${foodName} è buono, ma è da un po’ che mangio sempre quello…`,
        adviceLine: 'Al prossimo controllo chiedi al veterinario se variare mi farebbe bene.',
        route: '/nutrition/foods',
      });
    } else if (!foodName) {
      normal.push({
        id: 'food:missing',
        priority: 'normal',
        dogLine: 'La mia ciotola è un mistero: cosa mi prepari di buono?',
        adviceLine: 'Aggiungi il mio alimento nell’app: i consigli diventano più precisi.',
        route: '/nutrition/foods',
      });
    }
  }

  normal.push(...EVERGREEN_TIPS);
  normal.push({
    id: 'greeting',
    priority: 'normal',
    dogLine: GREETINGS[dayPartForHour(input.hour)],
  });

  return [
    ...urgent,
    ...shuffleTips(normal, seededRandom(`${input.dayKey}:${input.dogId}`)),
  ];
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
