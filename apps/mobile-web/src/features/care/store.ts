import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { api } from '../../lib/apiClient';
import { isPersistedId } from '../../lib/persistedId';
import { getAccessToken } from '../../lib/secureStore';
import type {
  CareEvent,
  CareEventStatus,
  CareEventType,
} from './types';
import {
  cancelAllCareReminders,
  cancelCareReminder,
  rescheduleCareReminders,
  scheduleCareReminder,
} from './notifications';
import { getNotificationPreferences } from '../notifications/store';

export interface CreateCareEventInput {
  dogId: string;
  dogName: string;
  eventType: CareEventType;
  title: string;
  scheduledAt: string;
  allDay: boolean;
  timezone?: string;
  location?: string | null;
  notes?: string | null;
  reminderEnabled?: boolean;
  reminderMinutesBefore?: number;
}

interface ApiCareEvent {
  id: string;
  dog_id: string;
  event_type: CareEventType;
  title: string;
  scheduled_at: string;
  all_day: boolean;
  timezone: string;
  location: string | null;
  notes: string | null;
  reminder_enabled: boolean;
  reminder_minutes_before: number;
  status: CareEventStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ApiCareEventList {
  items: ApiCareEvent[];
}

const seedDate = new Date();
seedDate.setDate(seedDate.getDate() + 5);
seedDate.setHours(10, 0, 0, 0);

let events: CareEvent[] = [
  // Seed demo (dev/mock gate): sostituito dai dati reali dopo hydrateCareEvents.
  {
    id: 'care-demo-vaccine',
    dogId: 'dog-rocky',
    eventType: 'VACCINE',
    title: 'Richiamo vaccino annuale',
    scheduledAt: seedDate.toISOString(),
    allDay: false,
    timezone: 'Europe/Rome',
    location: 'Ambulatorio veterinario',
    notes: null,
    reminderEnabled: true,
    reminderMinutesBefore: 1440,
    status: 'SCHEDULED',
    completedAt: null,
    notificationId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const listeners = new Set<() => void>();
const hydratedDogs = new Set<string>();
const hydratingDogs = new Set<string>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((listener) => listener());
}

function snapshot() {
  return events;
}

/**
 * Hook agli eventi care. `dogName` serve per (re)schedulare i promemoria
 * locali (il corpo della notifica lo contiene): passarlo qui evita di
 * doverlo recuperare a posteriori su rollback/idratazione.
 */
export function useCareEvents(dogId: string, dogName: string): CareEvent[] {
  const allEvents = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    if (!isPersistedId(dogId)) return;
    void hydrateCareEvents(dogId, dogName);
  }, [dogId, dogName]);
  return useMemo(
    () =>
      allEvents
        .filter((event) => event.dogId === dogId)
        .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)),
    [allEvents, dogId],
  );
}

/**
 * True mentre gli eventi del cane stanno being idratati dal backend.
 * Usato per evitare il flash "Appuntamento non trovato" aprendo il
 * dettaglio da una notifica prima che l'idratazione sia completata.
 */
export function useCareEventsHydrating(dogId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hydratingDogs.has(dogId),
    () => false,
  );
}

/**
 * Idrata gli eventi dal backend e riconcilia i promemoria locali:
 * cancel-all (elimina eventuali "fantasmi" di eventi completati/eliminati
 * di cui non abbiamo più il notificationId) + reschedule per ogni evento
 * SCHEDULED con reminder attivo. In __DEV__/Expo Go è un no-op.
 */
async function hydrateCareEvents(dogId: string, dogName: string): Promise<void> {
  if (!isPersistedId(dogId)) return;
  if (hydratedDogs.has(dogId)) return;
  hydratedDogs.add(dogId);
  hydratingDogs.add(dogId);
  emit();
  if (!(await getAccessToken())) {
    // Auth may still be booting when the profile first mounts. Allow the
    // next authenticated render to retry hydration instead of pinning this
    // dog as already loaded forever.
    hydratedDogs.delete(dogId);
    hydratingDogs.delete(dogId);
    emit();
    return;
  }

  try {
    const response = await api.get<ApiCareEventList>(
      `/v1/dogs/${dogId}/care-events?include_completed=true`,
    );
    events = [
      ...events.filter((event) => event.dogId !== dogId),
      ...response.items.map(fromApi),
    ];
    emit();
    // Riconcilia i promemoria locali con la fonte remota.
    await cancelAllCareReminders();
    await syncCareReminders(dogId, dogName);
  } catch {
    hydratedDogs.delete(dogId);
  } finally {
    hydratingDogs.delete(dogId);
    emit();
  }
}

/** Reconciles local reminders with the global notification preference. */
export async function syncCareReminders(
  dogId: string,
  dogName: string,
): Promise<void> {
  await cancelAllCareReminders();
  if (!getNotificationPreferences().careReminders) return;
  await rescheduleCareReminders(
    events.filter((event) => event.dogId === dogId),
    dogName,
  );
}

export function careEventById(eventId: string): CareEvent | undefined {
  return events.find((event) => event.id === eventId);
}

export function nextCareEvent(dogId: string): CareEvent | undefined {
  const now = Date.now();
  return events
    .filter(
      (event) =>
        event.dogId === dogId &&
        event.status === 'SCHEDULED' &&
        Date.parse(event.scheduledAt) >= now,
    )
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0];
}

export async function addCareEvent(
  input: CreateCareEventInput,
): Promise<{ event: CareEvent; reminderScheduled: boolean }> {
  const now = new Date().toISOString();
  const localEvent: CareEvent = {
    id: `care-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dogId: input.dogId,
    eventType: input.eventType,
    title: input.title.trim(),
    scheduledAt: input.scheduledAt,
    allDay: input.allDay,
    timezone: input.timezone ?? 'Europe/Rome',
    location: input.location?.trim() || null,
    notes: input.notes?.trim() || null,
    reminderEnabled:
      (input.reminderEnabled ?? true) &&
      getNotificationPreferences().careReminders,
    reminderMinutesBefore: input.reminderMinutesBefore ?? 1440,
    status: 'SCHEDULED',
    completedAt: null,
    notificationId: null,
    createdAt: now,
    updatedAt: now,
  };

  const token = await getAccessToken();
  const event =
    token && isPersistedId(localEvent.dogId)
      ? await createRemoteCareEvent(localEvent)
      : localEvent;
  const notificationId = await scheduleCareReminder(event, input.dogName);
  const saved = { ...event, notificationId };
  events = [...events, saved];
  emit();
  return { event: saved, reminderScheduled: Boolean(notificationId) };
}

/**
 * Aggiorna ottimisticamente lo stato locale + cancella il promemoria,
 * poi sincronizza col backend. Se il remoto fallisce, fa rollback dello
 * stato locale e ri-schedula il promemoria, così l'utente non perde
 * il promemoria a causa di un transient di rete.
 */
export async function completeCareEvent(
  eventId: string,
  dogName: string,
): Promise<void> {
  const event = careEventById(eventId);
  if (!event) return;
  if (event.status === 'COMPLETED') return;

  const previousStatus = event.status;
  const previousNotificationId = event.notificationId;
  const completedAt = new Date().toISOString();

  // 1. Ottimistico: cancello promemoria + marco completato localmente.
  await cancelCareReminder(event.notificationId);
  events = events.map((item) =>
    item.id === eventId
      ? {
          ...item,
          status: 'COMPLETED',
          completedAt,
          notificationId: null,
          updatedAt: completedAt,
        }
      : item,
  );
  emit();

  // 2. Sync remoto (solo per eventi persistiti lato server).
  const shouldSync = (await getAccessToken()) && isPersistedId(eventId);
  if (!shouldSync) return;

  try {
    await api.patch(`/v1/care-events/${eventId}`, { status: 'COMPLETED' });
  } catch (err) {
    // 3. Rollback: ripristino stato + ri-schedulo il promemoria.
    events = events.map((item) =>
      item.id === eventId
        ? {
            ...item,
            status: previousStatus,
            completedAt: null,
            notificationId: previousNotificationId,
            updatedAt: new Date().toISOString(),
          }
        : item,
    );
    emit();
    if (
      previousStatus === 'SCHEDULED' &&
      event.reminderEnabled &&
      !previousNotificationId
    ) {
      // Il notificationId era già null (es. dopo riavvio): ri-schedulo.
      const id = await scheduleCareReminder(event, dogName);
      if (id) {
        events = events.map((item) =>
          item.id === eventId ? { ...item, notificationId: id } : item,
        );
        emit();
      }
    }
    throw err;
  }
}

/**
 * Rimuove ottimisticamente l'evento + cancella il promemoria, poi
 * sincronizza col backend. Se il remoto fallisce, fa rollback
 * (re-inserisce l'evento e ri-schedula il promemoria).
 */
export async function removeCareEvent(
  eventId: string,
  dogName: string,
): Promise<void> {
  const event = careEventById(eventId);
  if (!event) return;

  const removedEvents = events;
  // 1. Ottimistico: cancello promemoria + rimuovo localmente.
  await cancelCareReminder(event.notificationId);
  events = events.filter((item) => item.id !== eventId);
  emit();

  // 2. Sync remoto (solo per eventi persistiti lato server).
  const shouldSync = (await getAccessToken()) && isPersistedId(eventId);
  if (!shouldSync) return;

  try {
    await api.delete(`/v1/care-events/${eventId}`);
  } catch (err) {
    // 3. Rollback: ripristino l'evento + ri-schedulo il promemoria.
    events = removedEvents;
    emit();
    if (
      event.status === 'SCHEDULED' &&
      event.reminderEnabled &&
      !event.notificationId
    ) {
      const id = await scheduleCareReminder(event, dogName);
      if (id) {
        events = events.map((item) =>
          item.id === eventId ? { ...item, notificationId: id } : item,
        );
        emit();
      }
    }
    throw err;
  }
}

/** Pulisce lo stato care (logout): reset in-memory + cancella i promemoria. */
export async function clearCareState(): Promise<void> {
  await cancelAllCareReminders();
  events = [];
  hydratedDogs.clear();
  hydratingDogs.clear();
  emit();
}

async function createRemoteCareEvent(event: CareEvent): Promise<CareEvent> {
  const response = await api.post<ApiCareEvent>(
    `/v1/dogs/${event.dogId}/care-events`,
    {
      event_type: event.eventType,
      title: event.title,
      scheduled_at: event.scheduledAt,
      all_day: event.allDay,
      timezone: event.timezone,
      location: event.location,
      notes: event.notes,
      reminder_enabled: event.reminderEnabled,
      reminder_minutes_before: event.reminderMinutesBefore,
    },
    {
      headers: {
        'X-Idempotency-Key': event.id,
      },
    },
  );
  return fromApi(response);
}

function fromApi(event: ApiCareEvent): CareEvent {
  return {
    id: event.id,
    dogId: event.dog_id,
    eventType: event.event_type,
    title: event.title,
    scheduledAt: event.scheduled_at,
    allDay: event.all_day,
    timezone: event.timezone,
    location: event.location,
    notes: event.notes,
    reminderEnabled: event.reminder_enabled,
    reminderMinutesBefore: event.reminder_minutes_before,
    status: event.status,
    completedAt: event.completed_at,
    // notificationId non è persistito lato server: viene riconciliato
    // da rescheduleCareReminders all'idratazione.
    notificationId: null,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
  };
}
