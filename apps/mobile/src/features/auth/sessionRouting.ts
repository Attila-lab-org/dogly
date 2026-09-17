export type SessionState =
  | 'unauthenticated'
  | 'authenticated-no-dog'
  | 'authenticated-with-dog'
  | 'authenticated-dog-status-unknown';

export type EntryRoute =
  | '/(auth)/welcome'
  | '/onboarding/dog'
  | '/(tabs)/home'
  | '/connection-error';

export function resolveEntryRoute(state: SessionState): EntryRoute {
  switch (state) {
    case 'unauthenticated':
      return '/(auth)/welcome';
    case 'authenticated-no-dog':
      return '/onboarding/dog';
    case 'authenticated-with-dog':
      return '/(tabs)/home';
    case 'authenticated-dog-status-unknown':
      return '/connection-error';
  }
}
