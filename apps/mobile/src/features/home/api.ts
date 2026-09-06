/**
 * Dati reali della Home e del Diario (Amendment V1.1, sez. 9).
 * - Quota: GET /v1/usage (riusa il DTO di features/billing/api).
 * - Timeline: GET /v1/diary, cursor-paginata (cursor/limit/domain/dog_id).
 *
 * Gap backend documentato: NON esiste un endpoint "lista eventi behavior"
 * dedicato (solo GET /v1/behavior/events/{id} singolo). Ultima analisi,
 * evento in lavorazione e stato new-user della Home si derivano quindi
 * dalla timeline unificata /v1/diary. Se serve una lista behavior
 * specializzata (es. con confidence band), va aggiunta lato backend.
 */
import type { BehaviorEventStatus } from '../../contracts/types';
import type { DiaryDomain, DiaryEntry, LastInsight, UsageSummary } from '../core/types';

export type ApiDiaryDomain = 'BEHAVIOR' | 'DIGESTIVE' | 'FOOD_LABEL';

export interface ApiDiaryItem {
  id: string;
  domain: ApiDiaryDomain;
  dog_id: string;
  status: string;
  title: string;
  summary: string | null;
  retention_state?: 'TEMPORARY' | 'USER_KEPT' | 'RESEARCH_OPT_IN' | 'DELETE_PENDING' | 'DELETED';
  created_at: string;
}

export interface DiaryPage {
  next_cursor?: string | null;
  items: ApiDiaryItem[];
}

export interface FetchDiaryOptions {
  dogId?: string;
  domain?: DiaryDomain;
  cursor?: string | null;
  limit?: number;
}

/** GET /v1/diary con filtri opzionali (sez. 5.1 timeline unificata). */
export async function fetchDiaryPage(options: FetchDiaryOptions = {}): Promise<DiaryPage> {
  // Import dinamico: apiClient tocca expo/virtual/env, non caricabile in Jest
  const { api } = await import('../../lib/apiClient');
  const params: string[] = [];
  if (options.cursor) params.push(`cursor=${encodeURIComponent(options.cursor)}`);
  if (options.limit) params.push(`limit=${options.limit}`);
  if (options.domain) params.push(`domain=${options.domain}`);
  if (options.dogId) params.push(`dog_id=${encodeURIComponent(options.dogId)}`);
  const query = params.length > 0 ? `?${params.join('&')}` : '';
  return api.get<DiaryPage>(`/v1/diary${query}`);
}

/** GET /v1/usage → UsageSummary del dominio core (sez. 21). */
export async function fetchUsageSummary(): Promise<UsageSummary> {
  const { fetchUsage } = await import('../billing/api');
  const { ledger } = await fetchUsage();
  return {
    behaviorLimit: ledger.behavior.limit,
    behaviorUsed: ledger.behavior.used,
    digestiveLimit: ledger.digestive.limit,
    digestiveUsed: ledger.digestive.used,
    resetsAt: ledger.reset_at,
  };
}

/** Analisi server in corso. UPLOADING/DRAFT non sono analisi: se restano
 *  bloccati non devono tenere la Home sul banner “in corso”. */
const IN_PROGRESS_STATUSES = new Set<string>([
  'QUEUED',
  'OBSERVING',
  'INTERPRETING',
  'FAILED_RETRYABLE',
]);

const NON_COMPLETED_LABELS: Record<string, string> = {
  DRAFT: 'Bozza',
  UPLOADING: 'Caricamento in corso',
  QUEUED: 'In coda',
  OBSERVING: 'Analisi in corso',
  INTERPRETING: 'Analisi in corso',
  FAILED_RETRYABLE: 'Nuovo tentativo in corso',
  REJECTED_QUALITY: 'Video non adatto',
  FAILED_TERMINAL: 'Analisi non riuscita',
  CANCELLED: 'Annullata',
};

/**
 * DiaryItem API → DiaryEntry UI. FOOD_LABEL non è un dominio del Diario
 * (sez. 5.1: solo behavior + digestive) → restituisce null.
 */
export function mapDiaryItemToEntry(item: ApiDiaryItem): DiaryEntry | null {
  if (item.domain !== 'BEHAVIOR' && item.domain !== 'DIGESTIVE') return null;
  const mediaDeleted =
    item.retention_state === 'DELETED' || item.retention_state === 'DELETE_PENDING';
  const subtitle =
    item.status === 'COMPLETED'
      ? item.summary
      : (NON_COMPLETED_LABELS[item.status] ?? item.summary);
  return {
    id: item.id,
    domain: item.domain,
    title: item.title,
    subtitle,
    occurredAt: item.created_at,
    mediaDeleted,
    refId: item.id,
  };
}

export interface DerivedHomeState {
  lastInsight: LastInsight | null;
  processingEventId: string | null;
  isNewUser: boolean;
}

/** "Oggi, 09:30" / "Ieri, 18:12" / data completa — puro per i test. */
export function formatInsightTimestamp(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const dayMs = 24 * 60 * 60 * 1000;
  const startOf = (d: Date) =>
    Date.parse(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  const diffDays = Math.round((startOf(now) - startOf(date)) / dayMs);
  const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (diffDays <= 0) return `Oggi, ${time}`;
  if (diffDays === 1) return `Ieri, ${time}`;
  return date.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
  });
}

/**
 * Deriva lo stato Home dalla timeline reale (sez. 6):
 * - processingEventId: evento behavior più recente non terminale;
 * - lastInsight: ultimo evento behavior COMPLETED;
 * - isNewUser: nessun evento reale (cold-start, sez. 7.1.3).
 */
export function deriveHomeState(
  items: ApiDiaryItem[],
  now: Date = new Date(),
): DerivedHomeState {
  const behavior = items
    .filter((item) => item.domain === 'BEHAVIOR')
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

  const processing = behavior.find((item) => IN_PROGRESS_STATUSES.has(item.status));
  const lastCompleted = behavior.find((item) => item.status === 'COMPLETED');

  return {
    processingEventId: processing?.id ?? null,
    lastInsight: lastCompleted
      ? {
          eventId: lastCompleted.id,
          label: lastCompleted.title,
          timestampLabel: formatInsightTimestamp(lastCompleted.created_at, now),
        }
      : null,
    isNewUser: items.length === 0,
  };
}

export type { BehaviorEventStatus };
