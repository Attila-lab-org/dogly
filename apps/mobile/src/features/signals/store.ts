import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { api } from '../../lib/apiClient';
import { getAccessToken } from '../../lib/secureStore';
import { metaForCategory, SIGNAL_CATEGORIES, signalResultSummary } from './copy';
import type {
  SignalCategory,
  SignalCategoryMeta,
  SignalExperiment,
  SignalFeedback,
  SignalMapEntry,
  SignalMapState,
  SignalObservedBehavior,
} from './types';

export { SIGNAL_CATEGORIES } from './copy';

interface ApiSignalMapEntry {
  dog_id: string;
  category: SignalCategory;
  state: SignalMapState;
  attempt_count: number;
  confirm_count: number;
  contradict_count: number;
  unknown_count: number;
  last_summary: string | null;
  updated_at: string;
}

interface ApiSignalMapResponse {
  items: ApiSignalMapEntry[];
  next_category: SignalCategory;
}

interface ApiSignalExperiment {
  id: string;
  dog_id: string;
  category: SignalCategory;
  sound_key: string;
  observed_behaviors: SignalObservedBehavior[];
  reaction_latency_ms: number | null;
  result_summary: string;
  owner_feedback: SignalFeedback | null;
  created_at: string;
}

const now = new Date().toISOString();

let mapEntries: SignalMapEntry[] = SIGNAL_CATEGORIES.map((meta) => ({
  dogId: 'dog-rocky',
  category: meta.category,
  state: meta.category === 'CURIOSITY' ? 'DISCOVERING' : 'LEARNING',
  attemptCount: meta.category === 'CURIOSITY' ? 0 : 1,
  confirmCount: meta.category === 'CURIOSITY' ? 0 : 1,
  contradictCount: 0,
  unknownCount: 0,
  lastSummary: meta.category === 'CURIOSITY' ? null : meta.resultSummary,
  updatedAt: now,
}));

let experiments: SignalExperiment[] = [];
const hydratedDogs = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((listener) => listener());
}

function snapshot() {
  return mapEntries;
}

export function useSignalMap(dogId: string): SignalMapEntry[] {
  const allEntries = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    void hydrateSignalMap(dogId);
  }, [dogId]);
  return useMemo(
    () => allEntries.filter((entry) => entry.dogId === dogId),
    [allEntries, dogId],
  );
}

export function nextSignalExperiment(dogId: string): SignalCategoryMeta {
  const entries = mapEntries.filter((entry) => entry.dogId === dogId);
  const next = [...entries].sort((a, b) => a.attemptCount - b.attemptCount)[0];
  return metaForCategory(next?.category ?? 'ATTENTION');
}

export { metaForCategory } from './copy';

export function signalExperimentsForDog(dogId: string): SignalExperiment[] {
  return experiments.filter((experiment) => experiment.dogId === dogId);
}

export async function recordSignalExperiment(
  dogId: string,
  dogName: string,
  category: SignalCategory,
  observedBehaviors: SignalObservedBehavior[],
  reactionLatencyMs: number | null,
  ownerFeedback: SignalFeedback,
): Promise<SignalExperiment> {
  const meta = metaForCategory(category);
  const local: SignalExperiment = {
    id: `signal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dogId,
    category,
    soundKey: meta.soundKey,
    observedBehaviors,
    reactionLatencyMs,
    resultSummary: signalResultSummary(dogName, observedBehaviors),
    ownerFeedback,
    createdAt: new Date().toISOString(),
  };

  const token = await getAccessToken();
  const saved = token ? await createRemoteExperiment(local) : local;
  experiments = [saved, ...experiments.filter((item) => item.id !== saved.id)];
  upsertMapEntry(saved);
  emit();
  return saved;
}

async function hydrateSignalMap(dogId: string): Promise<void> {
  if (hydratedDogs.has(dogId)) return;
  hydratedDogs.add(dogId);
  if (!(await getAccessToken())) return;

  try {
    const response = await api.get<ApiSignalMapResponse>(`/v1/dogs/${dogId}/signals`);
    mapEntries = [
      ...mapEntries.filter((entry) => entry.dogId !== dogId),
      ...response.items.map(fromApiMapEntry),
    ];
    emit();
  } catch {
    hydratedDogs.delete(dogId);
  }
}

async function createRemoteExperiment(experiment: SignalExperiment): Promise<SignalExperiment> {
  const response = await api.post<ApiSignalExperiment>(
    `/v1/dogs/${experiment.dogId}/signals/experiments`,
    {
      client_request_id: experiment.id,
      category: experiment.category,
      sound_key: experiment.soundKey,
      observed_behaviors: experiment.observedBehaviors,
      reaction_latency_ms: experiment.reactionLatencyMs,
      owner_feedback: experiment.ownerFeedback,
    },
    {
      headers: {
        'X-Idempotency-Key': experiment.id,
      },
    },
  );
  return fromApiExperiment(response);
}

function upsertMapEntry(experiment: SignalExperiment) {
  const existing = mapEntries.find(
    (entry) => entry.dogId === experiment.dogId && entry.category === experiment.category,
  );
  const attemptCount = (existing?.attemptCount ?? 0) + 1;
  const confirmCount = (existing?.confirmCount ?? 0) + (experiment.ownerFeedback === 'YES' ? 1 : 0);
  const contradictCount =
    (existing?.contradictCount ?? 0) + (experiment.ownerFeedback === 'NO' ? 1 : 0);
  const unknownCount =
    (existing?.unknownCount ?? 0) + (experiment.ownerFeedback === 'UNKNOWN' ? 1 : 0);
  const state: SignalMapState =
    attemptCount >= 3 && confirmCount >= 2
      ? 'RECURRING'
      : attemptCount >= 2
        ? 'LEARNING'
        : 'DISCOVERING';
  const updated: SignalMapEntry = {
    dogId: experiment.dogId,
    category: experiment.category,
    state,
    attemptCount,
    confirmCount,
    contradictCount,
    unknownCount,
    lastSummary: experiment.resultSummary,
    updatedAt: new Date().toISOString(),
  };
  mapEntries = [
    ...mapEntries.filter(
      (entry) => !(entry.dogId === updated.dogId && entry.category === updated.category),
    ),
    updated,
  ];
}

function fromApiMapEntry(entry: ApiSignalMapEntry): SignalMapEntry {
  return {
    dogId: entry.dog_id,
    category: entry.category,
    state: entry.state,
    attemptCount: entry.attempt_count,
    confirmCount: entry.confirm_count,
    contradictCount: entry.contradict_count,
    unknownCount: entry.unknown_count,
    lastSummary: entry.last_summary,
    updatedAt: entry.updated_at,
  };
}

function fromApiExperiment(experiment: ApiSignalExperiment): SignalExperiment {
  return {
    id: experiment.id,
    dogId: experiment.dog_id,
    category: experiment.category,
    soundKey: experiment.sound_key,
    observedBehaviors: experiment.observed_behaviors,
    reactionLatencyMs: experiment.reaction_latency_ms,
    resultSummary: experiment.result_summary,
    ownerFeedback: experiment.owner_feedback,
    createdAt: experiment.created_at,
  };
}
