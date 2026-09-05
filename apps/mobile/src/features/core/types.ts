/**
 * Tipi dei domini core (F1): profilo cane, usage/quota, insight Home,
 * timeline del Diario. Derivati dalla Spec V1 (sez. 5–7, 18, 21) e dal
 * mockup ufficiale. Quando il backend sarà disponibile, queste shape
 * arriveranno dalle read API (sez. 9) senza cambiare le schermate.
 */
import type { BehaviorEventResult } from '../../contracts/types';

/** Profilo cane (sez. 7.1: nome obbligatorio; età/taglia; razza opzionale). */
export interface DogProfile {
  id: string;
  name: string;
  /** Meta già formattati per la UI (es. "4 anni") */
  ageLabel: string;
  /** Data di nascita ISO YYYY-MM-DD, facoltativa ma utile per il compleanno. */
  birthDate: string | null;
  sizeLabel: string;
  /** Peso corrente in chilogrammi, facoltativo. */
  weightKg: number | null;
  /** Razza, "Mix" o null se sconosciuta (unknown breed ammesso, sez. 6) */
  breedLabel: string | null;
  isMix: boolean;
  /** Foto opzionale: null → placeholder zampa */
  photoUri: string | null;
  /** Profilo pubblico: privato di default, opt-in esplicito */
  profileVisibility: 'private' | 'public';
  /** Versione consenso profilo pubblico (null se privato) */
  publicConsentVersion: string | null;
}

/** Usage mensile del piano (sez. 21: FREE 3+3/mese, niente unlimited). */
export interface UsageSummary {
  behaviorLimit: number;
  behaviorUsed: number;
  digestiveLimit: number;
  digestiveUsed: number;
  resetsAt: string;
}

/** "Quanto conosco {nome}" nel profilo: product-score, numero ammesso in UI. */
export interface KnowledgeScore {
  /** 0–100 */
  score: number;
  caption: string;
}

/** Ultima analisi mostrata in Home (mockup-home: "sembra rilassato"). */
export interface LastInsight {
  eventId: string;
  /** Wording probabilistico (sez. 6.1) */
  label: string;
  /** Timestamp già formattato (es. "Oggi, 09:30") */
  timestampLabel: string;
}

/** Domini rappresentati nella timeline unificata del Diario (sez. 5.1). */
export type DiaryDomain = 'BEHAVIOR' | 'DIGESTIVE';

export interface DiaryEntry {
  id: string;
  domain: DiaryDomain;
  /** Titolo breve della riga (wording probabilistico per behavior) */
  title: string;
  /** Sottotitolo (es. band, safety flag, stato) */
  subtitle: string | null;
  /** ISO timestamp dell'evento */
  occurredAt: string;
  /** Media cancellato dalla retention (sez. 6 Diario: "deleted media") */
  mediaDeleted: boolean;
  /** Per behavior: id del risultato; per digestive: id evento fecale */
  refId: string;
}

/** Vista aggregata usata dalla Home (mock-driven finché non c'è l'API). */
export interface HomeData {
  dog: DogProfile;
  knowledgeScore: KnowledgeScore;
  usage: UsageSummary;
  lastInsight: LastInsight | null;
  /** Evento attualmente in lavorazione (sez. 6 Home: "processing existing event") */
  processingEventId: string | null;
  /** true → stato cold-start (sez. 7.1.3) */
  isNewUser: boolean;
}

/** Mappa id → risultato comportamentale completo (contratto sez. 6.1). */
export type BehaviorResultMap = Record<string, BehaviorEventResult>;
