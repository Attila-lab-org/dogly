/**
 * Mock tipizzati dei domini secondari (F2): pattern personali, baseline ed
 * eventi digestivi, prodotti alimentari, abbonamento e usage ledger, consensi.
 * Derivati dal mockup ufficiale (mockup-rocky.png) e dalla Spec V1.
 * Quando il backend sarà disponibile, questi mock saranno sostituiti dalle
 * read API (sez. 9) con la stessa shape.
 */
import type {
  ConsentState,
  DigestiveBaseline,
  FecalEventResult,
  FeedingPeriod,
  FoodProduct,
  PersonalPattern,
  SubscriptionState,
} from '../features/secondary/types';

export const DOG_ID = 'dog-rocky';

/** Knowledge Score allineato a Home (single source: mocks/core). */
export { homeKnowledgeScoreMock as knowledgeScoreMock } from './core';

/** Caption legacy per UI profilo (low knowledge). */
export const knowledgeScoreCaptions = {
  caption: 'Sto iniziando a conoscerlo...',
  captionLow: 'Sto iniziando a conoscerlo...',
} as const;

/**
 * Pattern appresi (sez. 17.2). I due ESTABLISHED vengono dal mockup;
 * il terzo è CONTESTED per coprire lo stato "Da verificare" (sez. 6).
 * In UI V1 restano nascosti finché PATTERNS_ENABLED = false.
 */
export const patternsMock: PersonalPattern[] = [
  {
    id: 'pattern-porta',
    dogId: DOG_ID,
    title: 'Guarda la porta prima di uscire',
    state: 'ESTABLISHED',
    supportCount: 9,
    confirmCount: 6,
    contradictCount: 1,
    reliabilityBand: 'HIGH',
    firstSeen: '2026-07-18T08:12:00Z',
    lastSeen: '2026-09-02T17:45:00Z',
    evidenceNotes: [
      'Osservato 9 volte in contesto "uscita di casa" negli ultimi 30 giorni',
      '6 tuoi feedback "Sì, è così" collegati a questo pattern',
      '1 evento sembra in contraddizione (21 agosto)',
    ],
  },
  {
    id: 'pattern-sera',
    dogId: DOG_ID,
    title: 'La sera è più attivo',
    state: 'ESTABLISHED',
    supportCount: 7,
    confirmCount: 4,
    contradictCount: 0,
    reliabilityBand: 'MEDIUM',
    firstSeen: '2026-07-25T19:05:00Z',
    lastSeen: '2026-09-03T20:31:00Z',
    evidenceNotes: [
      'Osservato 7 volte tra le 19:00 e le 22:00',
      '4 tuoi feedback "Sì, è così" collegati a questo pattern',
      'Nessuna evidenza in contraddizione finora',
    ],
  },
  {
    id: 'pattern-fattorino',
    dogId: DOG_ID,
    title: 'Si agita quando arriva il fattorino',
    state: 'CONTESTED',
    supportCount: 3,
    confirmCount: 1,
    contradictCount: 2,
    reliabilityBand: 'LOW',
    firstSeen: '2026-08-20T10:20:00Z',
    lastSeen: '2026-09-01T11:02:00Z',
    evidenceNotes: [
      'Osservato 3 volte in contesto "estraneo alla porta"',
      '1 tuo feedback di conferma',
      '2 eventi recenti sembrano in contraddizione: per questo è da verificare',
    ],
  },
];

/** Baseline digestiva di Rocky (sez. 19.2). */
export const digestiveBaselineMock: DigestiveBaseline = {
  dogId: DOG_ID,
  rollingScore: 3.4,
  observedEvents: 12,
  variability: 'bassa',
  dataSufficiency: 'sufficiente',
  trendSummary: 'Stabile rispetto alle ultime settimane',
};

/** Cibo attivo e prodotto verificato (sez. 20). */
export const foodProductsMock: FoodProduct[] = [
  {
    id: 'food-trainer',
    brand: 'Natural Trainer',
    name: 'Adult Medium Salmone e Riso',
    ingredientsRaw:
      'Salmone disidratato 22%, riso 20%, mais, proteine di mais, grasso animale, polpa di barbabietola, lieviti, sali minerali.',
    guaranteedAnalysis: {
      crudeProteinMin: 26,
      crudeFatMin: 14,
      crudeFiberMax: 2.8,
      moistureMax: 9,
    },
    calories: '365 kcal/100 g',
    fieldConfidence: {
      name: 'HIGH',
      brand: 'HIGH',
      ingredients: 'HIGH',
      protein: 'HIGH',
      fat: 'HIGH',
      fiber: 'MEDIUM',
      moisture: 'MEDIUM',
      calories: 'MEDIUM',
    },
    verifiedAt: '2026-08-10T09:15:00Z',
  },
  {
    id: 'food-farmina',
    brand: 'Farmina N&D',
    name: 'Pollo e Melograno Adult Medium',
    ingredientsRaw:
      'Pollo fresco disossato 24%, pollo disidratato 22%, patate, uova fresche, aringhe fresche, melograno disidratato 0,5%.',
    guaranteedAnalysis: {
      crudeProteinMin: 30,
      crudeFatMin: 18,
      crudeFiberMax: 2.9,
      moistureMax: null,
    },
    calories: '399 kcal/100 g',
    fieldConfidence: {
      name: 'MEDIUM',
      brand: 'HIGH',
      ingredients: 'LOW',
      protein: 'MEDIUM',
      fat: 'MEDIUM',
      fiber: 'LOW',
      moisture: 'LOW',
      calories: 'MEDIUM',
    },
    verifiedAt: null,
  },
];

export const feedingPeriodsMock: FeedingPeriod[] = [
  {
    id: 'feeding-trainer-1',
    dogId: DOG_ID,
    foodProductId: 'food-trainer',
    startedAt: '2026-08-10T09:20:00Z',
    endedAt: null,
    quantityPerDay: '280 g al giorno',
  },
];

/** Evento fecale normale (sez. 6: "normal observation"). */
export const fecalEventNormalMock: FecalEventResult = {
  eventId: 'fecal-ok-1',
  dogId: DOG_ID,
  status: 'COMPLETED',
  imageQuality: 'sufficient',
  qualityWarnings: [],
  fecalScoreEstimate: 3,
  consistency: 'formata',
  color: 'Marrone',
  mucusCandidate: 'none_observed',
  bloodCandidate: 'none_observed',
  melenaCandidate: 'none_observed',
  foreignMaterialCandidate: 'none_observed',
  confidenceBand: 'HIGH',
  safetyFlags: [],
  activeFoodName: 'Natural Trainer Adult Medium Salmone e Riso',
  baselineComparison: 'È simile alle osservazioni recenti di Rocky.',
  overallState: 'ROUTINE',
  consumerHeadline: 'Oggi sono simili al solito di Rocky',
  consumerSummary:
    'Forma, consistenza e colore apparente sono vicini alle sue osservazioni recenti.',
  relevantContext: [
    'Alimento registrato: Natural Trainer Adult Medium Salmone e Riso.',
  ],
  possibleAssociations: [],
  recommendedNextStep: 'Continua a osservare normalmente.',
  observationReliability:
    'La foto permette di valutare forma, consistenza e colore apparente.',
  reasoningVersion: 'digestive-reasoning/v1',
  baselineVersion: 'digestive-baseline/v1',
  createdAt: '2026-09-03T08:05:00Z',
};

/** Evento con safety flag candidato: copy deterministico (sez. 19.3). */
export const fecalEventFlaggedMock: FecalEventResult = {
  eventId: 'fecal-flag-1',
  dogId: DOG_ID,
  status: 'COMPLETED',
  imageQuality: 'sufficient',
  qualityWarnings: [],
  fecalScoreEstimate: 5,
  consistency: 'morbida',
  color: 'Marrone scuro',
  mucusCandidate: 'possible',
  bloodCandidate: 'possible',
  melenaCandidate: 'none_observed',
  foreignMaterialCandidate: 'unknown',
  confidenceBand: 'MEDIUM',
  safetyFlags: ['BLOOD_CANDIDATE'],
  activeFoodName: 'Natural Trainer Adult Medium Salmone e Riso',
  baselineComparison: 'È più morbida rispetto alle osservazioni recenti di Rocky.',
  overallState: 'ATTENTION',
  consumerHeadline: 'C’è qualcosa da tenere d’occhio',
  consumerSummary:
    'Questa osservazione merita più attenzione del solito.',
  relevantContext: [
    'Alimento registrato: Natural Trainer Adult Medium Salmone e Riso.',
  ],
  possibleAssociations: [],
  recommendedNextStep:
    'Controlla come sta Rocky e registra la prossima evacuazione.',
  followupKey: 'reduced_activity_today',
  followupQuestion: 'Rocky appare meno attivo del solito?',
  observationReliability:
    'La foto permette una lettura utile di consistenza e colore apparente.',
  reasoningVersion: 'digestive-reasoning/v1',
  baselineVersion: 'digestive-baseline/v1',
  createdAt: '2026-09-04T07:48:00Z',
};

/**
 * Evento con immagine insufficiente (sez. 6 Digestive result: "insufficient
 * image"; sez. 19.1: image_quality insufficient + warnings). Nessuna stima:
 * si chiede una foto nuova invece di mostrare numeri non affidabili.
 */
export const fecalEventInsufficientMock: FecalEventResult = {
  eventId: 'fecal-insufficient-1',
  dogId: DOG_ID,
  status: 'INSUFFICIENT_IMAGE',
  imageQuality: 'insufficient',
  qualityWarnings: [
    'Foto mossa o sfocata',
    'Soggetto inquadrato solo in parte',
    'Luce insufficiente',
  ],
  fecalScoreEstimate: null,
  consistency: 'sconosciuta',
  color: 'Non determinabile dalla foto',
  mucusCandidate: 'unknown',
  bloodCandidate: 'unknown',
  melenaCandidate: 'unknown',
  foreignMaterialCandidate: 'unknown',
  confidenceBand: 'LOW',
  safetyFlags: [],
  activeFoodName: 'Natural Trainer Adult Medium Salmone e Riso',
  baselineComparison:
    'Nessun confronto possibile: la foto non è abbastanza leggibile.',
  createdAt: '2026-09-04T19:22:00Z',
};

export const fecalEventsMock: Record<string, FecalEventResult> = {
  [fecalEventNormalMock.eventId]: fecalEventNormalMock,
  [fecalEventFlaggedMock.eventId]: fecalEventFlaggedMock,
  [fecalEventInsufficientMock.eventId]: fecalEventInsufficientMock,
};

/** Abbonamento FREE + usage ledger (sez. 21: 3+3/mese, no unlimited). */
export const subscriptionMock: SubscriptionState = {
  plan: 'FREE',
  renewsAt: null,
  usage: {
    behaviorLimit: 3,
    behaviorUsed: 2,
    digestiveLimit: 3,
    digestiveUsed: 1,
    resetsAt: '2026-10-01T00:00:00Z',
  },
};

/** Consensi separati (sez. 23.1): ricerca/training OFF di default. */
export const consentsMock: ConsentState = {
  service: true,
  researchTraining: false,
  notifications: true,
  keepClip: false,
};
