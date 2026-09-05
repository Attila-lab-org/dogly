import { useSyncExternalStore } from 'react';

export interface NotificationPreferences {
  careReminders: boolean;
  resultReady: boolean;
  newPattern: boolean;
  digestiveTrend: boolean;
  weeklySummary: boolean;
  checkIn: boolean;
}

let preferences: NotificationPreferences = {
  careReminders: true,
  resultReady: true,
  newPattern: true,
  digestiveTrend: true,
  weeklySummary: false,
  checkIn: true,
};

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return preferences;
}

export function useNotificationPreferences() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function setNotificationPreference(
  key: keyof NotificationPreferences,
  value: boolean,
) {
  preferences = { ...preferences, [key]: value };
  listeners.forEach((listener) => listener());
}

export function getNotificationPreferences() {
  return preferences;
}
