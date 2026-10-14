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
  windSpeedKmh?: number | null;
  humidityPct?: number | null;
}

export type CoatType = 'double' | 'short' | 'long';

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
  /** Mantello stimato dall'archetipo di razza (breedTraits.coatTypeFor). */
  coatType?: CoatType | null;
  /** Ids delle carte già mostrate di recente (anti-ripetizione tra giorni). */
  recentTipIds?: readonly string[];
  /** Permesso posizione negato: una carta soft invita ad attivarlo. */
  locationDenied?: boolean;
  activeFoodName?: string | null;
  /** Mesi con lo stesso alimento attivo; null = appena cambiato. */
  activeFoodMonths?: number | null;
  /** true quando i dati nutrizione sono stati caricati (mai inventare). */
  foodDataKnown?: boolean;
}

const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const THUNDER_CODES = new Set([95, 96, 99]);

export const WEATHER_TORRID_C = 32;
export const WEATHER_HOT_C = 28;
export const WEATHER_COLD_C = 5;
export const WEATHER_WINDY_KMH = 30;
export const WEATHER_HUMID_PCT = 80;

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
    id: 'evergreen:weight',
    priority: 'normal',
    dogLine: 'La linea conta anche per noi quadrupedi.',
    adviceLine: 'Pesami una volta al mese: le piccole variazioni si notano solo così.',
  },
];

const NUTRITION_TIPS: readonly HeroTip[] = [
  {
    id: 'nutrition:protein',
    priority: 'normal',
    dogLine: 'Pollo, pesce, agnello… il mio naso sogna un menu vario.',
    adviceLine: 'Parla col veterinario di variare le proteine: la varietà aiuta la tolleranza.',
  },
  {
    id: 'nutrition:bowl',
    priority: 'normal',
    dogLine: 'La ciotola pulita rende tutto più buono.',
    adviceLine: 'Lava la mia ciotola ogni giorno: i residui attirano i batteri.',
  },
  {
    id: 'nutrition:shape',
    priority: 'normal',
    dogLine: 'La mia linea: costole che si sentono ma non si vedono.',
    adviceLine: 'Dall’alto si vede il mio punto vita? Se no, parliamone col veterinario.',
  },
  {
    id: 'nutrition:snacks',
    priority: 'normal',
    dogLine: 'Gli snack sono la mia felicità, ma pochi per volta!',
    adviceLine: 'Snack al massimo un decimo dei pasti: gli avanzi della tavola contano doppio.',
  },
  {
    id: 'nutrition:label',
    priority: 'normal',
    dogLine: 'Cosa c’è nella mia ciotola? Il mio naso vuole sapere.',
    adviceLine: 'Leggi l’etichetta: i primi ingredienti sono quelli che contano di più.',
  },
  {
    id: 'nutrition:transition',
    priority: 'normal',
    dogLine: 'Cambiare menu? Sì, ma con calma per favore.',
    adviceLine: 'Se cambi il mio alimento, fallo in 5-7 giorni mescolando poco alla volta.',
  },
];

const CARE_TIPS: readonly HeroTip[] = [
  {
    id: 'care:nails',
    priority: 'normal',
    dogLine: 'Le mie unghiette fanno tip-tap sul pavimento.',
    adviceLine: 'Se senti il tip-tap sul pavimento, è ora di un controllo alle unghie.',
  },
  {
    id: 'care:teeth',
    priority: 'normal',
    dogLine: 'Sorriso smagliante anche per me, per favore.',
    adviceLine: 'Un gioco da masticare al giorno aiuta denti e gengive (e salva i mobili).',
  },
  {
    id: 'care:ears',
    priority: 'normal',
    dogLine: 'Le mie orecchie sentono tutto, anche il frigorifero.',
    adviceLine: 'Controlla le orecchie una volta a settimana: pulite e senza odore sono ok.',
  },
  {
    id: 'care:paws',
    priority: 'normal',
    dogLine: 'I miei polpastrelli sono i miei scarponcini.',
    adviceLine: 'Controlla i polpastrelli dopo le passeggiate: tagli e sassi si nascondono lì.',
  },
];

const COAT_TIPS: Record<CoatType, HeroTip> = {
  double: {
    id: 'care:coat:double',
    priority: 'normal',
    dogLine: 'Il mio doppio pelo è un cappotto tecnico: mai tosarlo!',
    adviceLine: 'Spazzolami due volte a settimana: il sottopelo si annoda se lo trascuriamo.',
  },
  short: {
    id: 'care:coat:short',
    priority: 'normal',
    dogLine: 'Pelo corto, manutenzione facile: ma una spazzolata mi piace sempre.',
    adviceLine: 'Una spazzolata a settimana toglie il pelo morto e mi tiene lucido.',
  },
  long: {
    id: 'care:coat:long',
    priority: 'normal',
    dogLine: 'Il mio pelo lungo è bellissimo ma si annoda in un lampo.',
    adviceLine: 'Spazzolami un po’ ogni giorno, soprattutto dietro le orecchie e sotto le zampe.',
  },
};

const MIND_TIPS: readonly HeroTip[] = [
  {
    id: 'mind:sniff',
    priority: 'normal',
    dogLine: 'Dieci minuti di naso a terra valgono più di un’ora di corsa.',
    adviceLine: 'Nascondi qualche bocconcino in casa o in giardino: il fiuto mi rilassa.',
  },
  {
    id: 'mind:rotate',
    priority: 'normal',
    dogLine: 'I miei giochi spariti tornano magicamente nuovi!',
    adviceLine: 'Ruota i miei giochi uno alla volta ogni settimana: sembreranno appena comprati.',
  },
  {
    id: 'mind:training',
    priority: 'normal',
    dogLine: 'Cinque minuti di trucchetti e mi sento un genio.',
    adviceLine: 'Bastano 5 minuti di training al giorno: seduto, resta, vieni. Premi golosi!',
  },
  {
    id: 'mind:routes',
    priority: 'normal',
    dogLine: 'Sempre la stessa strada? Il mio naso vuole novità.',
    adviceLine: 'Cambia percorso una volta a settimana: odori nuovi, mente felice.',
  },
  {
    id: 'mind:social',
    priority: 'normal',
    dogLine: 'Incontrare amici a quattro zampe mi ricarica le pile.',
    adviceLine: 'Incontri brevi e positivi con cani tranquilli tengono allenata la mia socialità.',
  },
];

const SEASONAL_TIPS: Record<number, HeroTip> = {
  1: {
    id: 'season:01',
    priority: 'normal',
    dogLine: 'Aria gelida e passeggiate corte: poi tutti sul divano!',
    adviceLine: 'Il sale antigelo irrita i polpastrelli: sciacqua le zampe al rientro.',
  },
  2: {
    id: 'season:02',
    priority: 'normal',
    dogLine: 'Fine inverno: il mio naso già sente la primavera.',
    adviceLine: 'Attenzione a sale antigelo e pozzanghere gelate: zampe pulite al rientro.',
  },
  3: {
    id: 'season:03',
    priority: 'normal',
    dogLine: 'L’aria profuma di primavera e di mille nasi al lavoro!',
    adviceLine: 'Tornano i forasacchi: controlla orecchie e zampe dopo il prato.',
  },
  4: {
    id: 'season:04',
    priority: 'normal',
    dogLine: 'Starnuti di primavera? Anche il mio naso li conosce.',
    adviceLine: 'Pollini e prati fioriti: se mi gratto spesso, parliamone col veterinario.',
  },
  5: {
    id: 'season:05',
    priority: 'normal',
    dogLine: 'I prati alti sono un’avventura, ma nascondono spine.',
    adviceLine: 'Forasacchi in agguato: ispeziona zampe, orecchie e naso dopo ogni uscita.',
  },
  6: {
    id: 'season:06',
    priority: 'normal',
    dogLine: 'Estate in arrivo: io voto per l’ombra e la siesta.',
    adviceLine: 'Forasacchi e prime zecche: controlla il mantello dopo ogni passeggiata.',
  },
  7: {
    id: 'season:07',
    priority: 'normal',
    dogLine: 'Luglio: il sole è bello, ma la mia pancia preferisce il fresco.',
    adviceLine: 'Zecche e caldo: ispeziona il mantello e mai auto parcheggiata al sole.',
  },
  8: {
    id: 'season:08',
    priority: 'normal',
    dogLine: 'Agosto: scodinzolo solo nelle ore fresche.',
    adviceLine: 'Uscite all’alba o alla sera; di giorno ombra, acqua e riposo.',
  },
  9: {
    id: 'season:09',
    priority: 'normal',
    dogLine: 'L’aria cambia e i boschi profumano di funghi.',
    adviceLine: 'Funghi tentano il mio naso: occhio a cosa raccolgo da terra.',
  },
  10: {
    id: 'season:10',
    priority: 'normal',
    dogLine: 'Foglie croccanti e castagne: la mia stagione preferita!',
    adviceLine: 'Funghi e castagne non sono snack per me: vigila durante le raccolte.',
  },
  11: {
    id: 'season:11',
    priority: 'normal',
    dogLine: 'Le giornate si accorciano: il mio muso punta il tramonto.',
    adviceLine: 'Uscite con la luce quando puoi; al buio un gilet o una lucetta mi rendono visibile.',
  },
  12: {
    id: 'season:12',
    priority: 'normal',
    dogLine: 'Profumo di feste e di… piante proibite per me!',
    adviceLine: 'Stella di Natale, vischio e cioccolato sono tossici: tienili fuori dalla mia portata.',
  },
};

function seasonalTip(month: number): HeroTip {
  return SEASONAL_TIPS[month] ?? SEASONAL_TIPS[1];
}

/** Carta temperatura: 6 livelli, urgent solo per torrido/molto caldo/freddo. */
function weatherTemperatureTip(
  weather: HeroWeather,
  smallSize: boolean,
  shortCoat: boolean,
): HeroTip {
  const t = weather.temperatureC;
  if (t >= WEATHER_TORRID_C) {
    return {
      id: 'weather:torrid',
      priority: 'urgent',
      dogLine: 'Oggi il sole picchia davvero: la mia pancia vota per l’ombra!',
      adviceLine: 'Acqua sempre piena e uscite all’alba o dopo il tramonto: l’asfalto brucia i polpastrelli.',
    };
  }
  if (t >= WEATHER_HOT_C) {
    return {
      id: 'weather:hot',
      priority: 'urgent',
      dogLine: 'Che caldo oggi: scodinzolo solo all’ombra.',
      adviceLine: 'Acqua fresca sempre piena e passeggiate nelle ore fresche del giorno.',
    };
  }
  if (t >= 22) {
    return {
      id: 'weather:warm',
      priority: 'normal',
      dogLine: 'Che bel tiepido: si sta fuori volentieri!',
      adviceLine: 'Perfetta per una passeggiata lunga: il fiuto mi stanca più della corsa.',
    };
  }
  if (t >= 12) {
    return {
      id: 'weather:perfect',
      priority: 'normal',
      dogLine: 'Temperatura perfetta per le mie zampe: andiamo?',
      adviceLine: 'Le giornate miti sono ideali per esplorare un percorso nuovo insieme.',
    };
  }
  if (t > WEATHER_COLD_C) {
    return {
      id: 'weather:chilly',
      priority: 'normal',
      dogLine: 'Aria frizzante: il mio naso lavora meglio così!',
      adviceLine: 'Giornata ideale per giocare all’aperto senza surriscaldarmi.',
    };
  }
  return {
    id: 'weather:cold',
    priority: 'urgent',
    dogLine: 'Brr, che aria frizzante oggi!',
    adviceLine:
      smallSize || shortCoat
        ? 'Uscite più corte e un cappottino mi aiutano; al rientro asciuga bene le zampe.'
        : 'Uscite un po’ più corte e zampe asciutte al rientro: il freddo si fa sentire.',
  };
}

/** Carta condizione (pioggia/temporale/neve/vento/umidità); null se sereno. */
function weatherConditionTip(weather: HeroWeather): HeroTip | null {
  const code = weather.weatherCode;
  if (code !== null && THUNDER_CODES.has(code)) {
    return {
      id: 'weather:storm',
      priority: 'urgent',
      dogLine: 'I tuoni mi fanno venire i brividi: restami vicino?',
      adviceLine: 'Preparami un angolo tranquillo in casa e non forzarmi a uscire durante il temporale.',
    };
  }
  if (code !== null && SNOW_CODES.has(code)) {
    return {
      id: 'weather:snow',
      priority: 'urgent',
      dogLine: 'Neve! La neve! Potrei scodinzolare fino a domani!',
      adviceLine: 'Occhio alle palline di ghiaccio tra i polpastrelli: scioglile con acqua tiepida.',
    };
  }
  if (code !== null && RAIN_CODES.has(code)) {
    return {
      id: 'weather:rain',
      priority: 'urgent',
      dogLine: 'Piove! I salti nelle pozzanghere quasi mi tentano… quasi.',
      adviceLine: 'Al rientro asciuga bene zampe e pancia: la pelle umida si irrita in fretta.',
    };
  }
  if ((weather.humidityPct ?? 0) > WEATHER_HUMID_PCT && weather.temperatureC >= 26) {
    return {
      id: 'weather:humid',
      priority: 'urgent',
      dogLine: 'L’aria è pesante oggi: ansimo un po’ più del solito.',
      adviceLine: 'Caldo umido stanca anche senza sole: acqua, ombra e riposo; se ansimo troppo, fresco subito.',
    };
  }
  if ((weather.windSpeedKmh ?? 0) > WEATHER_WINDY_KMH) {
    return {
      id: 'weather:wind',
      priority: 'normal',
      dogLine: 'Che vento! Le orecchie mi volano all’indietro.',
      adviceLine: 'Con vento forte passeggiata più corta e al passo: attento a detriti e rametti.',
    };
  }
  return null;
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
      {
        id: 'age:puppy:social',
        priority: 'normal',
        dogLine: 'Ogni muso nuovo è un amico che non conosco ancora.',
        adviceLine: 'Incontri brevi e positivi ora valgono una vita di socialità serena.',
      },
      {
        id: 'age:puppy:potty',
        priority: 'normal',
        dogLine: 'La pipì giusta al posto giusto: ci sto lavorando, promesso.',
        adviceLine: 'Portami fuori spesso e festeggia quando azzecco: la routine fa il resto.',
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
      {
        id: 'age:senior:bed',
        priority: 'normal',
        dogLine: 'Il mio riposo è sacro: una cuccia morbida vale oro.',
        adviceLine: 'Un letto spesso e comodo sostiene le mie articolazioni durante la nanna.',
      },
      {
        id: 'age:senior:mind',
        priority: 'normal',
        dogLine: 'La mente resta giovane se la alleni con dolcezza.',
        adviceLine: 'Giochi di fiuto facili e trucchetti rivisti con calma mi tengono sveglio.',
      },
    ];
  }
  return [];
}

export const MIN_DECK_AFTER_EXCLUSION = 8;

export function buildHeroTips(input: HeroTipsInput): HeroTip[] {
  const urgent: HeroTip[] = [];
  const weatherNormal: HeroTip[] = [];
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
    // Max 2 carte meteo per mazzo (temperatura + condizione). Le normali
    // restano prominenti: subito dopo le urgent, prima dello shuffle.
    const temperature = weatherTemperatureTip(
      input.weather,
      input.smallSize ?? false,
      input.coatType === 'short',
    );
    const condition = weatherConditionTip(input.weather);
    for (const card of [temperature, condition]) {
      if (!card) continue;
      if (card.priority === 'urgent') urgent.push(card);
      else weatherNormal.push(card);
    }
  } else {
    normal.push(seasonalTip(input.month));
    if (input.locationDenied) {
      normal.push({
        id: 'weather:permission',
        priority: 'normal',
        dogLine: 'Con la posizione attiva leggerei il cielo per te!',
        adviceLine: 'Attiva la posizione: ti dirò se fa troppo caldo o freddo per le mie zampe.',
      });
    }
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

  if (input.coatType) {
    normal.push(COAT_TIPS[input.coatType]);
  }

  normal.push(...NUTRITION_TIPS, ...CARE_TIPS, ...MIND_TIPS, ...EVERGREEN_TIPS);
  normal.push({
    id: 'greeting',
    priority: 'normal',
    dogLine: GREETINGS[dayPartForHour(input.hour)],
  });

  // Anti-ripetizione tra giorni: escludi le carte mostrate di recente se
  // il mazzo resta abbastanza ricco; le urgent non si escludono mai.
  const recent = new Set(input.recentTipIds ?? []);
  const fresh = normal.filter((tip) => !recent.has(tip.id));
  const pool = fresh.length >= MIN_DECK_AFTER_EXCLUSION ? fresh : normal;

  return [
    ...urgent,
    ...weatherNormal,
    ...shuffleTips(pool, seededRandom(`${input.dayKey}:${input.dogId}`)),
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

/* ------------------------------------------------------------------ */
/* Ids delle carte consiglio già mostrate (anti-ripetizione tra giorni) */
/* ------------------------------------------------------------------ */

export const SHOWN_TIPS_LIMIT = 12;

function shownTipsKey(dogId?: string): string {
  return `home-hero:shown-tips:v1:${dogId?.trim() || 'default'}`;
}

export async function loadShownTipIds(dogId?: string): Promise<string[]> {
  const store = await storage();
  if (!store) return [];
  try {
    const raw = await store.getItem(shownTipsKey(dogId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

export async function saveShownTipIds(
  ids: readonly string[],
  dogId?: string,
): Promise<void> {
  const store = await storage();
  if (!store) return;
  try {
    await store.setItem(
      shownTipsKey(dogId),
      JSON.stringify([...new Set(ids)].slice(-SHOWN_TIPS_LIMIT)),
    );
  } catch {
    // persistenza best-effort: peggio che capita, domani si ripete una carta
  }
}
