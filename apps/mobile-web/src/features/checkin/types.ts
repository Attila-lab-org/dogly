export type CheckInFrequency = 'light' | 'normal' | 'monitoring';

export interface CheckInPreferences {
  frequency: CheckInFrequency;
  smartReminders: boolean;
}
