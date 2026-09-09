/**
 * Mock tipizzati dei domini core (F1): profilo di Rocky, Knowledge Score,
 * quota residua, ultima analisi, risultati comportamentali e timeline Diario.
 * Derivati dal mockup ufficiale (mockup-home/result.png) e dalla Spec V1
 * (sez. 5–7, 6.1, 16.2, 21). Regola 29.2: i mock nascono dagli stessi
 * contratti consumer (src/contracts/types.ts, src/features/core/types.ts).
 */
import type { BehaviorEventResult } from '../contracts/types';
import type {
  BehaviorResultMap,
  DiaryEntry,
  DogProfile,
  HomeData,
  KnowledgeScore,
  UsageSummary,
} from '../features/core/types';

export const DOG_ID = 'dog-rocky';

/** Identità di Rocky come da mockup (home + profilo). */
export const dogMock: DogProfile = {
  id: DOG_ID,
  name: 'Rocky',
  ageLabel: '4 anni',
  birthDate: '2022-05-18',
  sizeLabel: 'Taglia media',
  weightKg: 28.5,
  breedLabel: 'Golden Retriever',
  isMix: false,
  photoUri:
    'https://images.unsplash.com/photo-1552053831-71594a27632d?w=800&q=80',
  profileVisibility: 'private',
  publicConsentVersion: null,
};

/**
 * Knowledge Score in Home: 38% come da mockup-home.png.
 * (Il tab Rocky usa il mock del workstream F2: proiezione diversa dello
 * stesso product-score versionato, sez. 18.)
 */
export const homeKnowledgeScoreMock: KnowledgeScore = {
  score: 38,
  caption: 'Sto iniziando a conoscerlo...',
};

/** Quota FREE (sez. 21: 3 analisi comportamentali + 3 digestive al mese). */
export const usageMock: UsageSummary = {
  behaviorLimit: 3,
  behaviorUsed: 2,
  digestiveLimit: 3,
  digestiveUsed: 1,
  resetsAt: '2026-10-01T00:00:00Z',
};

/** Versioni contratto obbligatorie per audit/replay (sez. 16.3). */
const CONTRACT_VERSIONS = {
  schema_version: 'behavior-result/1.0',
  policy_version: 'canine-interpretation/v0',
  taxonomy_version: 'intent-taxonomy/v0',
} as const;

/** Risultato "gioco" — replica fedele di mockup-result.png (band, non %). */
const resultPlay: BehaviorEventResult = {
  eventId: 'evt-play',
  dogId: DOG_ID,
  status: 'COMPLETED',
  primary_intent: 'PLAY_INTERACTION',
  confidence_band: 'HIGH',
  consumer_summary:
    'Rocky sembra voler giocare: postura di gioco e movimento verso di te. Probabilmente ti sta invitando a partecipare.',
  evidence: [
    { source: 'OBSERVATION', label: 'Postura di gioco' },
    { source: 'OBSERVATION', label: 'Coda rilassata' },
    { source: 'OBSERVATION', label: 'Vocalizzazione breve' },
    { source: 'OBSERVATION', label: 'Movimento verso di te' },
  ],
  alternatives: [
    {
      intent: 'ATTENTION_REQUEST',
      rationale:
        'Possibile anche una richiesta di attenzione: il gioco potrebbe essere il modo di Rocky per coinvolgerti.',
    },
  ],
  feedback: null,
  ...CONTRACT_VERSIONS,
  created_at: '2026-09-04T18:12:00Z',
  completed_at: '2026-09-04T18:12:21Z',
};

/** "Ultima analisi" della Home (mockup-home: "sembra rilassato", 09:30). */
const resultRelax: BehaviorEventResult = {
  eventId: 'evt-relax',
  dogId: DOG_ID,
  status: 'COMPLETED',
  primary_intent: 'RELAX_REST',
  confidence_band: 'MEDIUM',
  consumer_summary:
    'Rocky sembra rilassato: corpo disteso e respiro regolare. Probabilmente si sta godendo un momento di calma.',
  evidence: [
    { source: 'OBSERVATION', label: 'Corpo disteso' },
    { source: 'OBSERVATION', label: 'Respiro regolare' },
    { source: 'CONTEXT', label: 'Ambiente di casa, orario di riposo' },
  ],
  alternatives: [],
  feedback: 'YES',
  ...CONTRACT_VERSIONS,
  created_at: '2026-09-04T09:30:00Z',
  completed_at: '2026-09-04T09:30:19Z',
};

/** Risultato ambiguo: completato valido, consuma quota (sez. 6.1 / 7.3). */
const resultAmbiguous: BehaviorEventResult = {
  eventId: 'evt-ambiguous',
  dogId: DOG_ID,
  status: 'COMPLETED',
  primary_intent: 'AMBIGUOUS',
  confidence_band: 'LOW',
  consumer_summary:
    'Due ipotesi restano vicine: Rocky potrebbe voler uscire, ma è possibile anche che qualcosa fuori lo abbia messo in allerta.',
  evidence: [
    { source: 'OBSERVATION', label: 'Sguardo verso la porta' },
    { source: 'OBSERVATION', label: 'Orecchie orientate in avanti' },
    { source: 'CONTEXT', label: 'Orario abituale della passeggiata' },
    {
      source: 'PERSONAL_PATTERN',
      label: 'Pattern: guarda la porta prima di uscire',
      ref: 'pattern-porta',
    },
  ],
  alternatives: [
    {
      intent: 'OUTSIDE_REQUEST',
      rationale: 'Possibile richiesta di uscire, compatibile con il suo pattern abituale.',
    },
    {
      intent: 'ALERT_VIGILANCE',
      rationale: 'È possibile che abbia sentito un rumore fuori e stia monitorando.',
    },
  ],
  feedback: null,
  ...CONTRACT_VERSIONS,
  created_at: '2026-09-03T17:40:00Z',
  completed_at: '2026-09-03T17:40:24Z',
};

/** Risultato "insufficient": completato valido, wording prudente (sez. 6.1). */
const resultInsufficient: BehaviorEventResult = {
  eventId: 'evt-insufficient',
  dogId: DOG_ID,
  status: 'COMPLETED',
  primary_intent: null,
  confidence_band: 'LOW',
  consumer_summary:
    'Non ci sono abbastanza segnali in questo video per capire cosa sta comunicando Rocky. È possibile che la clip sia troppo corta: prova a registrare qualche secondo in più, inquadrandolo interamente.',
  evidence: [
    { source: 'OBSERVATION', label: 'Rocky visibile solo in parte' },
    { source: 'OBSERVATION', label: 'Audio quasi assente' },
    { source: 'OBSERVATION', label: 'Clip molto breve' },
  ],
  alternatives: [],
  feedback: null,
  ...CONTRACT_VERSIONS,
  created_at: '2026-09-02T08:05:00Z',
  completed_at: '2026-09-02T08:05:17Z',
};

/** Evento in lavorazione (stato Home "processing existing event", sez. 6). */
const resultProcessing: BehaviorEventResult = {
  eventId: 'evt-processing',
  dogId: DOG_ID,
  status: 'OBSERVING',
  primary_intent: null,
  confidence_band: 'LOW',
  consumer_summary: '',
  evidence: [],
  alternatives: [],
  feedback: null,
  ...CONTRACT_VERSIONS,
  created_at: '2026-09-04T18:30:00Z',
  completed_at: null,
};

/** Quality rejected: rimborso quota secondo policy (sez. 7.2 / 7.3). */
const resultRejectedQuality: BehaviorEventResult = {
  eventId: 'evt-rejected',
  dogId: DOG_ID,
  status: 'REJECTED_QUALITY',
  primary_intent: null,
  confidence_band: 'LOW',
  consumer_summary: '',
  evidence: [],
  alternatives: [],
  feedback: null,
  ...CONTRACT_VERSIONS,
  created_at: '2026-09-01T19:02:00Z',
  completed_at: null,
};

/** Errore provider transitorio: retry automatico idempotente (sez. 22). */
const resultRetrying: BehaviorEventResult = {
  eventId: 'evt-retrying',
  dogId: DOG_ID,
  status: 'FAILED_RETRYABLE',
  primary_intent: null,
  confidence_band: 'LOW',
  consumer_summary: '',
  evidence: [],
  alternatives: [],
  feedback: null,
  ...CONTRACT_VERSIONS,
  created_at: '2026-09-01T18:20:00Z',
  completed_at: null,
};

/** Errore terminale: rimborso + telemetria supporto (sez. 7.2). */
const resultFailedTerminal: BehaviorEventResult = {
  eventId: 'evt-failed',
  dogId: DOG_ID,
  status: 'FAILED_TERMINAL',
  primary_intent: null,
  confidence_band: 'LOW',
  consumer_summary: '',
  evidence: [],
  alternatives: [],
  feedback: null,
  ...CONTRACT_VERSIONS,
  created_at: '2026-08-30T11:10:00Z',
  completed_at: null,
};

export const behaviorResultsMock: BehaviorResultMap = {
  [resultPlay.eventId]: resultPlay,
  [resultRelax.eventId]: resultRelax,
  [resultAmbiguous.eventId]: resultAmbiguous,
  [resultInsufficient.eventId]: resultInsufficient,
  [resultProcessing.eventId]: resultProcessing,
  [resultRejectedQuality.eventId]: resultRejectedQuality,
  [resultRetrying.eventId]: resultRetrying,
  [resultFailedTerminal.eventId]: resultFailedTerminal,
};

/** Dati aggregati della Home (mockup-home.png + stati obbligatori sez. 6). */
export const homeDataMock: HomeData = {
  dog: dogMock,
  knowledgeScore: homeKnowledgeScoreMock,
  usage: usageMock,
  lastInsight: {
    eventId: resultRelax.eventId,
    label: 'sembra rilassato',
    timestampLabel: 'Oggi, 09:30',
  },
  processingEventId: null,
  isNewUser: false,
};

/**
 * Timeline unificata del Diario (sez. 5.1): behavior + digestivo,
 * ordinata per data discendente. Include un evento con media cancellato
 * dalla retention (stato "deleted media", sez. 6).
 */
export const diaryEntriesMock: DiaryEntry[] = [
  {
    id: 'diary-play',
    domain: 'BEHAVIOR',
    title: 'Rocky sembra voler giocare',
    subtitle: 'Si avvicina e cerca interazione',
    occurredAt: '2026-09-04T18:12:00Z',
    mediaDeleted: false,
    refId: resultPlay.eventId,
  },
  {
    id: 'diary-relax',
    domain: 'BEHAVIOR',
    title: 'Sembra rilassato',
    subtitle: 'Segnali compatibili con il riposo · Confermato da te',
    occurredAt: '2026-09-04T09:30:00Z',
    mediaDeleted: false,
    refId: resultRelax.eventId,
  },
  {
    id: 'diary-fecal-flag',
    domain: 'DIGESTIVE',
    title: 'Feci più morbide del solito',
    subtitle: 'Una variazione da controllare',
    occurredAt: '2026-09-04T07:48:00Z',
    mediaDeleted: false,
    refId: 'fecal-flag-1',
  },
  {
    id: 'diary-ambiguous',
    domain: 'BEHAVIOR',
    title: 'Due o più ipotesi vicine',
    subtitle: 'Serve un po’ più di contesto',
    occurredAt: '2026-09-03T17:40:00Z',
    mediaDeleted: false,
    refId: resultAmbiguous.eventId,
  },
  {
    id: 'diary-fecal-ok',
    domain: 'DIGESTIVE',
    title: 'Simile al suo solito',
    subtitle: 'Nessun cambiamento rilevante',
    occurredAt: '2026-09-03T08:05:00Z',
    mediaDeleted: false,
    refId: 'fecal-ok-1',
  },
  {
    id: 'diary-insufficient',
    domain: 'BEHAVIOR',
    title: 'Non ci sono abbastanza segnali',
    subtitle: 'Il video non mostra abbastanza dettagli',
    occurredAt: '2026-09-02T08:05:00Z',
    mediaDeleted: true,
    refId: resultInsufficient.eventId,
  },
];
