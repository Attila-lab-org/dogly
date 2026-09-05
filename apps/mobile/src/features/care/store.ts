import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { api } from '../../lib/apiClient';
import { getAccessToken } from '../../lib/secureStore';
import type {
  CareEvent,
  CareEventStatus,
  CareEventType,
} from './types';
import {
  cancelCareReminder,
  scheduleCareReminder,
} from './notifications';

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

export function useCareEvents(dogId: string): CareEvent[] {
  const allEvents = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    void hydrateCareEvents(dogId);
  }, [dogId]);
  return useMemo(
    () =>
      allEvents
        .filter((event) => event.dogId === dogId)
        .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)),
    [allEvents, dogId],
  );
}

async function hydrateCareEvents(dogId: string): Promise<void> {
  if (hydratedDogs.has(dogId)) return;
  hydratedDogs.add(dogId);
  if (!(await getAccessToken())) return;

  try {
    const response = await api.get<ApiCareEventList>(
      `/v1/dogs/${dogId}/care-events?include_completed=true`,
    );
    events = [
      ...events.filter((event) => event.dogId !== dogId),
      ...response.items.map(fromApi),
    ];
    emit();
  } catch {
    hydratedDogs.delete(dogId);
  }
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
    reminderEnabled: input.reminderEnabled ?? true,
    reminderMinutesBefore: input.reminderMinutesBefore ?? 1440,
    status: 'SCHEDULED',
    completedAt: null,
    notificationId: null,
    createdAt: now,
    updatedAt: now,
  };

  const token = await getAccessToken();
  const event = token ? await createRemoteCareEvent(localEvent) : localEvent;
  const notificationId = await scheduleCareReminder(event, input.dogName);
  const saved = { ...event, notificationId };
  events = [...events, saved];
  emit();
  return { event: saved, reminderScheduled: Boolean(notificationId) };
}

export async function completeCareEvent(eventId: string): Promise<void> {
  const event = careEventById(eventId);
  if (!event) return;
  await cancelCareReminder(event.notificationId);
  const completedAt = new Date().toISOString();
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

  if (await getAccessToken()) {
    await api.patch(`/v1/care-events/${eventId}`, { status: 'COMPLETED' });
  }
}

export async function removeCareEvent(eventId: string): Promise<void> {
  const event = careEventById(eventId);
  if (!event) return;
  await cancelCareReminder(event.notificationId);
  events = events.filter((item) => item.id !== eventId);
  emit();

  if (await getAccessToken()) {
    await api.delete(`/v1/care-events/${eventId}`);
  }
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
    notificationId: null,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
  };
}
