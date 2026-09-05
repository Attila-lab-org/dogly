import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

export const CARE_EVENT_TYPES = [
  'VACCINE',
  'VET_VISIT',
  'PARASITE_TREATMENT',
  'EXAM',
  'THERAPY',
  'OTHER',
] as const;

export type CareEventType = (typeof CARE_EVENT_TYPES)[number];
export type CareEventStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export interface CareEvent {
  id: string;
  dogId: string;
  eventType: CareEventType;
  title: string;
  scheduledAt: string;
  allDay: boolean;
  timezone: string;
  location: string | null;
  notes: string | null;
  reminderEnabled: boolean;
  reminderMinutesBefore: number;
  status: CareEventStatus;
  completedAt: string | null;
  notificationId: string | null;
  createdAt: string;
  updatedAt: string;
}

type IconName = ComponentProps<typeof Ionicons>['name'];

export const CARE_TYPE_META: Record<
  CareEventType,
  { label: string; defaultTitle: string; icon: IconName }
> = {
  VACCINE: {
    label: 'Vaccino',
    defaultTitle: 'Richiamo vaccino',
    icon: 'shield-checkmark-outline',
  },
  VET_VISIT: {
    label: 'Visita',
    defaultTitle: 'Visita veterinaria',
    icon: 'medkit-outline',
  },
  PARASITE_TREATMENT: {
    label: 'Antiparassitario',
    defaultTitle: 'Antiparassitario',
    icon: 'bug-outline',
  },
  EXAM: {
    label: 'Controllo',
    defaultTitle: 'Esame o controllo',
    icon: 'clipboard-outline',
  },
  THERAPY: {
    label: 'Terapia',
    defaultTitle: 'Terapia',
    icon: 'medical-outline',
  },
  OTHER: {
    label: 'Altro',
    defaultTitle: 'Promemoria',
    icon: 'calendar-outline',
  },
};
