import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { tabBar } from '../../src/theme/tokens';
import { useSession } from '../../src/features/auth/SessionProvider';
import { useDogProfile } from '../../src/features/core/useDogProfile';

/**
 * Tab V5.1: Home / Diario / Profilo.
 * La Fotocamera Storie resta una route nascosta aperta dalla StoriesRail.
 * Protetto: senza sessione → welcome.
 */
export default function TabsLayout() {
  const { loading, sessionState, usingMockGate } = useSession();
  const { dog } = useDogProfile();

  if (loading) {
    return null;
  }

  if (!loading && !usingMockGate && sessionState === 'unauthenticated') {
    return <Redirect href="/(auth)/welcome" />;
  }
  if (!loading && !usingMockGate && sessionState === 'authenticated-no-dog') {
    return <Redirect href="/onboarding/dog" />;
  }
  if (
    !loading &&
    !usingMockGate &&
    sessionState === 'authenticated-dog-status-unknown'
  ) {
    return <Redirect href="/connection-error" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tabBar.activeTint,
        tabBarInactiveTintColor: tabBar.inactiveTint,
        tabBarStyle: { backgroundColor: tabBar.background },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={size}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="diary"
        options={{
          title: 'Diario',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'book' : 'book-outline'}
              size={size}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="rocky"
        options={{
          title: dog.name || 'Cane',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'paw' : 'paw-outline'}
              size={size}
              color={color as string}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          href: null,
          title: 'Fotocamera',
        }}
      />
    </Tabs>
  );
}
