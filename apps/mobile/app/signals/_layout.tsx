import { Redirect } from 'expo-router';

/** Dogly Signals is intentionally suspended and has no public entry point. */
export default function SignalsDisabledLayout() {
  return <Redirect href="/(tabs)/home" />;
}
