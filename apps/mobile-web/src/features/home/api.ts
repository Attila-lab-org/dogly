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
import { BEHAVIOR_INTENT_LABELS } from '../../contracts/types';
import { simplifyDigestiveOwnerCopy } from '../core/conversationCopy';
import { directResultHeadline, sanitizeOwnerCopy } from '../core/copy';
import type {
  DiaryDomain,
  DiaryEntry,
  InsightTone,
  LastInsight,
  UsageSummary,
} from '../core/types';

export type ApiDiaryDomain = 'BEHAVIOR' | 'DIGESTIVE' | 'FOOD_LABEL';

export interface ApiDiaryItem {
  id: string;
  domain: ApiDiaryDomain;
  dog_id: string;
  status: string;
  title: string;
  summary: string | null;
  retention_state?: 'TEMPORARY' | 'USER_KEPT' | 'RESEARCH_OPT_IN' | 'DELETE_PENDING' | 'DELETED';
  media_url?: string | null;
  media_kind?: 'PHOTO' | 'VIDEO' | null;
  digestive_score?: number | null;
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
  q?: string;
  status?: string;
  /** When false, backend skips signed media URLs (Home strip). */
  includeMedia?: boolean;
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
  if (options.q?.trim()) params.push(`q=${encodeURIComponent(options.q.trim())}`);
  if (options.status) params.push(`status=${encodeURIComponent(options.status)}`);
  if (options.includeMedia === false) params.push('include_media=false');
  const query = params.length > 0 ? `?${params.join('&')}` : '';
  return api.get<DiaryPage>(`/v1/diary${query}`);
}

/**
 * Home “ultime osservazioni”: metadata only — no behavior-raw signed URLs.
 * The strip uses a play affordance; Diario loads media when visible.
 */
export async function fetchHomeBehaviorPage(dogId: string): Promise<DiaryPage> {
  return fetchDiaryPage({
    dogId,
    domain: 'BEHAVIOR',
    status: 'COMPLETED',
    limit: 8,
    includeMedia: false,
  });
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
  'PROCESSING',
]);

const NON_COMPLETED_LABELS: Record<string, string> = {
  DRAFT: 'In preparazione',
  UPLOADING: 'Caricamento in corso',
  QUEUED: 'In attesa un attimo',
  OBSERVING: 'Sto osservando il video',
  INTERPRETING: 'Sto osservando il video',
  FAILED_RETRYABLE: 'Nuovo tentativo in corso',
  PROCESSING: 'Sto osservando la foto',
  REJECTED_QUALITY: 'Questo video non si legge bene',
  INSUFFICIENT_IMAGE: 'Foto non abbastanza chiara',
  FAILED_TERMINAL: 'Non sono riuscito a leggere il momento',
  CANCELLED: 'Annullata',
};

/** Riassunto diario: una frase corta, tono app, niente pappardella. */
function diaryWowSnippet(value: string, maxChars = 110): string {
  const cleaned = value.trim();
  if (!cleaned) return cleaned;
  const first = cleaned.split(/(?<=[.!?])\s+/).find(Boolean) ?? cleaned;
  if (first.length <= maxChars) return first;
  return `${first.slice(0, maxChars - 1).replace(/\s+\S*$/, '').replace(/[,;:]+$/, '')}…`;
}

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
        ? diaryWowSnippet(
            item.domain === 'DIGESTIVE'
              ? simplifyDigestiveOwnerCopy(item.summary, {
                  maxChars: 110,
                  maxSentences: 1,
                })
              : sanitizeOwnerCopy(item.summary),
          )
        : null
      : (NON_COMPLETED_LABELS[item.status] ?? item.summary);
  const title =
    item.domain === 'BEHAVIOR'
      ? item.status === 'COMPLETED'
        ? probabilisticInsightLabel(item.title)
        : 'Momento in lettura'
      : item.title === 'Controllo digestione'
        ? 'Osservazione digestiva'
        : simplifyDigestiveOwnerCopy(item.title, {
            maxChars: 88,
            maxSentences: 1,
          });
  return {
    id: item.id,
    domain: item.domain,
    title,
    subtitle,
    status: item.status,
    occurredAt: item.created_at,
    mediaDeleted,
    mediaUri: item.media_url ?? null,
    mediaKind: item.media_kind ?? null,
    digestiveScore: item.digestive_score ?? null,
    refId: item.id,
  };
}

export interface DerivedHomeState {
  lastInsight: LastInsight | null;
  recentInsights: LastInsight[];
  processingEventId: string | null;
  isNewUser: boolean;
}

const POSITIVE_INTENTS = new Set([
  'PLAY_INTERACTION',
  'RELAX_REST',
  'ATTENTION_REQUEST',
]);
const WATCH_INTENTS = new Set([
  'DISCOMFORT_AVOIDANCE',
  'FEAR_INSECURITY',
  'FRUSTRATION',
  'RESOURCE_TENSION',
]);

/** Tono della card Home da tassonomia o wording già consumer. */
export function insightToneFromTitle(title: string): InsightTone {
  const key = title.trim().toUpperCase();
  if (POSITIVE_INTENTS.has(key)) return 'positive';
  if (WATCH_INTENTS.has(key)) return 'watch';
  const lower = title.toLowerCase();
  if (
    /gioc|rilass|calma|pappa|affetto|cerca la tua attenzione|vuole uscire/.test(
      lower,
    )
  ) {
    return 'positive';
  }
  if (/disagio|paura|frustrat|tensione|insicur|spazio/.test(lower)) {
    return 'watch';
  }
  return 'neutral';
}

export function insightToneLabel(tone: InsightTone): string {
  if (tone === 'positive') return 'Bello';
  if (tone === 'watch') return 'Da tenere d’occhio';
  return 'Calmo';
}

function toLastInsight(item: ApiDiaryItem, now: Date): LastInsight {
  const kind = item.media_kind ?? null;
  // Never attach VIDEO signed URLs to Home cards (egress storm if reminted).
  const mediaUri =
    kind === 'VIDEO' ? null : (item.media_url ?? null);
  return {
    eventId: item.id,
    label: probabilisticInsightLabel(item.title),
    timestampLabel: formatInsightTimestamp(item.created_at, now),
    tone: insightToneFromTitle(item.title),
    mediaUri,
    mediaKind: kind,
  };
}

/** Porta anche i titoli storici della Home nello stesso tono diretto dei risultati. */
export function probabilisticInsightLabel(title: string): string {
  const normalized = title.trim();
  const taxonomyLabel =
    BEHAVIOR_INTENT_LABELS[
      normalized.toUpperCase() as keyof typeof BEHAVIOR_INTENT_LABELS
    ] ?? normalized;
  if (!taxonomyLabel || taxonomyLabel === 'Analisi comportamento') {
    return 'C’è un comportamento da approfondire';
  }
  return directResultHeadline(
    taxonomyLabel.charAt(0).toUpperCase() + taxonomyLabel.slice(1),
  );
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
  const completed = behavior.filter((item) => item.status === 'COMPLETED');
  const recentInsights = completed.slice(0, 8).map((item) => toLastInsight(item, now));

  return {
    processingEventId: processing?.id ?? null,
    lastInsight: recentInsights[0] ?? null,
    recentInsights,
    isNewUser: items.length === 0,
  };
}

export type { BehaviorEventStatus };
