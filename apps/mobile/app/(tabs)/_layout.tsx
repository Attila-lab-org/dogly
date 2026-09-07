import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { tabBar } from '../../src/theme/tokens';
import { useSession } from '../../src/features/auth/SessionProvider';

/**
 * Tab V5.1: Home / Diario / Profilo.
 * La Fotocamera Storie resta una route nascosta aperta dalla StoriesRail.
 * Protetto: senza sessione → welcome.
 */
export default function TabsLayout() {
  const { loading, sessionState, usingMockGate } = useSession();

  if (loading) {
    return null;
  }

  if (!loading && !usingMockGate && sessionState === 'unauthenticated') {
    return <Redirect href="/(auth)/welcome" />;
  }
  if (!loading && !usingMockGate && sessionState === 'authenticated-no-dog') {
    return <Redirect href="/onboarding/dog" />;
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
          title: 'Profilo',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
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
