import type { ReactNode } from 'react';
import type { CheckInFrequency } from '../features/checkin/types';

type FrequencyControl = {
  accessibilityLabel: string;
  accessibilityState: { selected: boolean };
  children: ReactNode;
  onPress: () => void;
};
type ReminderControl = {
  accessibilityLabel: string;
  value: boolean;
  onValueChange: (value: boolean) => Promise<void>;
};

const mockFrequencies = new Map<string, FrequencyControl>();
const mockReminders = new Map<string, ReminderControl>();
const mockAlert = jest.fn();
const mockApiPatch = jest.fn();
const mockSyncCareReminders = jest.fn();
const mockRequestPermission = jest.fn();
const mockScheduleNotification = jest.fn();

// Render the real screen and exercise its handlers against the real stores.
// Only native presentation, the dog identity and external services are replaced.
jest.mock('react-native', () => {
  const React = require('react') as typeof import('react');
  const host = (tag: string) => ({ children }: { children: ReactNode }) =>
    React.createElement(tag, null, children);
  return {
    View: host('div'),
    Text: host('span'),
    StyleSheet: { create: (styles: unknown) => styles },
    Alert: { alert: mockAlert },
    Switch: (props: ReminderControl) => {
      mockReminders.set(props.accessibilityLabel, props);
      return React.createElement('input', {
        type: 'checkbox',
        checked: props.value,
        readOnly: true,
        'aria-label': props.accessibilityLabel,
      });
    },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../components', () => {
  const React = require('react') as typeof import('react');
  const Container = ({ children }: { children: ReactNode }) =>
    React.createElement('div', null, children);
  return { Card: Container, ScreenContainer: Container };
});
jest.mock('../components/pressSpring', () => {
  const React = require('react') as typeof import('react');
  return {
    SpringPress: (props: FrequencyControl) => {
      mockFrequencies.set(props.accessibilityLabel, props);
      return React.createElement('button', {
        'aria-label': props.accessibilityLabel,
        'aria-pressed': props.accessibilityState.selected,
      }, props.children);
    },
  };
});
jest.mock('../features/secondary/components', () => {
  const React = require('react') as typeof import('react');
  return {
    StackScreenHeader: ({ title }: { title: string }) =>
      React.createElement('h1', null, title),
  };
});
jest.mock('../features/core/useDogProfile', () => ({
  useDogProfile: () => ({ dog: { id: 'dog-oreo', name: 'Oreo' } }),
}));
jest.mock('../features/care/store', () => ({ syncCareReminders: mockSyncCareReminders }));
jest.mock('../lib/apiClient', () => ({ api: { patch: mockApiPatch } }));
jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: mockRequestPermission,
  scheduleNotificationAsync: mockScheduleNotification,
}));

const FREQUENCIES: Array<{
  id: CheckInFrequency;
  label: string;
  description: string;
}> = [
  { id: 'light', label: 'Ogni 3 giorni', description: 'Un breve saluto ogni pochi giorni.' },
  { id: 'normal', label: 'Ogni giorno', description: 'Un breve check-in una volta al giorno.' },
  { id: 'monitoring', label: 'A ogni apertura', description: 'Un check-in ogni volta che apri DOGly.' },
];

let savedData: Map<string, string>;
const testEnv = process.env;
const originalApiUrl = testEnv.EXPO_PUBLIC_API_URL;

async function openApp() {
  // A fresh module registry simulates a cold restart, retaining only disk data.
  jest.resetModules();
  const storage = {
    getItem: async (key: string) => savedData.get(key) ?? null,
    setItem: async (key: string, value: string) => { savedData.set(key, value); },
  };
  const persistence = require('../features/checkin/persistence') as typeof import('../features/checkin/persistence');
  const notificationPersistence = require('../features/notifications/persistence') as typeof import('../features/notifications/persistence');
  persistence.setCheckInStorageBackend(storage);
  notificationPersistence.setKeyValueStorageForTests(storage);
  const checkIn = require('../features/checkin/store') as typeof import('../features/checkin/store');
  const notifications = require('../features/notifications/store') as typeof import('../features/notifications/store');
  await checkIn.hydrateCheckIn('dog-oreo');
  await notifications.hydrateNotificationPreferences();

  const React = require('react') as typeof import('react');
  const { renderToStaticMarkup } = require('react-dom/server') as {
    renderToStaticMarkup: (element: ReactNode) => string;
  };
  const Screen = require('../../app/settings/notifications').default;
  const render = () => {
    mockFrequencies.clear();
    mockReminders.clear();
    return renderToStaticMarkup(React.createElement(Screen));
  };
  render();
  return { checkIn, notifications, persistence, render };
}

beforeEach(() => {
  savedData = new Map();
  jest.clearAllMocks();
  mockApiPatch.mockReset().mockResolvedValue({});
  // Exercise the existing consent-saving branch without any real network calls.
  testEnv.EXPO_PUBLIC_API_URL = 'https://dogly-api.example.invalid';
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 16, 12));
});

afterEach(() => {
  jest.useRealTimers();
  if (originalApiUrl === undefined) delete testEnv.EXPO_PUBLIC_API_URL;
  else testEnv.EXPO_PUBLIC_API_URL = originalApiUrl;
});

it('explains the in-app check-in without health-level or push wording', async () => {
  const app = await openApp();
  const html = app.render();
  expect(html).toContain('Frequenza del check-in');
  expect(html).toContain('Promemoria check-in');
  expect(html).toContain('Chiedimi occasionalmente come sta il mio cane.');
  expect(html).toContain('Il check-in compare dentro DOGly.');
  expect(html).not.toMatch(/Come sta oggi|Leggero|Normale|Monitoraggio/);
  expect(mockReminders.get('Promemoria check-in')?.value).toBe(true);
});

it.each(FREQUENCIES)('selects $label and restores the same ID after restart', async ({ id, label, description }) => {
  let app = await openApp();
  mockFrequencies.get(label)!.onPress();
  expect(app.render()).toContain(description);
  expect(app.checkIn.getCheckInSnapshot().prefs.frequency).toBe(id);
  expect([...mockFrequencies.values()].filter((option) => option.accessibilityState.selected)
    .map((option) => option.accessibilityLabel)).toEqual([label]);
  await expect(app.persistence.loadCheckInPrefs('dog-oreo')).resolves.toEqual({
    frequency: id, smartReminders: true,
  });

  app = await openApp();
  expect(app.checkIn.getCheckInSnapshot().prefs.frequency).toBe(id);
  expect(mockFrequencies.get(label)?.accessibilityState.selected).toBe(true);
  expect(app.render()).toContain(description);
  expect(mockSyncCareReminders).not.toHaveBeenCalled();
  expect(mockRequestPermission).not.toHaveBeenCalled();
  expect(mockScheduleNotification).not.toHaveBeenCalled();
});

it.each([
  ['light', 0, false], ['light', 1, false], ['light', 2, false], ['light', 3, true],
  ['normal', 0, false], ['normal', 1, true], ['normal', 2, true],
  ['monitoring', 0, true], ['monitoring', 1, true],
] as const)('%s: after an answer and restart at +%i days, pending is %s', async (id, days, expected) => {
  let app = await openApp();
  mockFrequencies.get(FREQUENCIES.find((option) => option.id === id)!.label)!.onPress();
  app.checkIn.markCheckInSoftOk('dog-oreo');
  await expect(app.persistence.loadLastCheckInAnswer('dog-oreo')).resolves.toEqual({
    dayKey: '2026-10-16', concern: 'soft',
  });
  jest.setSystemTime(new Date(2026, 9, 16 + days, 12));
  app = await openApp();
  expect(app.checkIn.getCheckInSnapshot().welcomePending).toBe(expected);
});

it.each(FREQUENCIES)('$label: reminder off survives restart; re-enabling restores the next check-in', async ({ label, id }) => {
  let app = await openApp();
  mockFrequencies.get(label)!.onPress();
  await mockReminders.get('Promemoria check-in')!.onValueChange(false);
  app.render();
  expect(mockReminders.get('Promemoria check-in')?.value).toBe(false);
  expect(app.checkIn.getCheckInSnapshot().welcomePending).toBe(false);
  expect(app.notifications.getNotificationPreferences().checkIn).toBe(false);
  await expect(app.persistence.loadCheckInPrefs('dog-oreo')).resolves.toEqual({
    frequency: id, smartReminders: false,
  });

  jest.setSystemTime(new Date(2026, 9, 20, 12));
  app = await openApp();
  expect(mockReminders.get('Promemoria check-in')?.value).toBe(false);
  expect(app.checkIn.getCheckInSnapshot().welcomePending).toBe(false);
  expect(app.notifications.getNotificationPreferences().checkIn).toBe(false);
  await mockReminders.get('Promemoria check-in')!.onValueChange(true);
  app.render();
  expect(mockReminders.get('Promemoria check-in')?.value).toBe(true);
  await expect(app.persistence.loadCheckInPrefs('dog-oreo')).resolves.toEqual({
    frequency: id, smartReminders: true,
  });

  app = await openApp();
  expect(mockReminders.get('Promemoria check-in')?.value).toBe(true);
  expect(app.checkIn.getCheckInSnapshot().welcomePending).toBe(true);
  expect(app.notifications.getNotificationPreferences().checkIn).toBe(true);
  expect(mockSyncCareReminders).not.toHaveBeenCalled();
  expect(mockRequestPermission).not.toHaveBeenCalled();
  expect(mockScheduleNotification).not.toHaveBeenCalled();
});

it('keeps the reminder enabled and reports a failed preference save', async () => {
  const app = await openApp();
  mockApiPatch.mockRejectedValueOnce(new Error('offline'));
  await mockReminders.get('Promemoria check-in')!.onValueChange(false);
  app.render();
  expect(mockReminders.get('Promemoria check-in')?.value).toBe(true);
  expect(app.checkIn.getCheckInSnapshot().prefs.smartReminders).toBe(true);
  expect(app.notifications.getNotificationPreferences().checkIn).toBe(true);
  expect(mockAlert).toHaveBeenCalledWith('Preferenza non salvata', expect.any(String));
  expect(mockSyncCareReminders).not.toHaveBeenCalled();
  expect(mockRequestPermission).not.toHaveBeenCalled();
  expect(mockScheduleNotification).not.toHaveBeenCalled();
});

it('still synchronizes agenda reminders only for the agenda switch', async () => {
  await openApp();
  await mockReminders.get('Agenda e appuntamenti')!.onValueChange(false);
  expect(mockSyncCareReminders).toHaveBeenCalledWith('dog-oreo', 'Oreo');
});
