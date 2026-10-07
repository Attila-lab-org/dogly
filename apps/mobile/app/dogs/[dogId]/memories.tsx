import { Redirect } from 'expo-router';

/** Internal memory is intentionally not a customer-facing screen. */
export default function DogMemoriesScreen() {
  return <Redirect href="/(tabs)/rocky" />;
}
