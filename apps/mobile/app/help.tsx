/**
 * Alias di /aiuto — stesso hub assistenza (evita due schermate diverse).
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function HelpRedirect() {
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const value = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  return (
    <Redirect
      href={
        value
          ? ({ pathname: '/aiuto', params: { returnTo: value } } as never)
          : ('/aiuto' as never)
      }
    />
  );
}
