import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { tabBar } from '../../src/theme/tokens';
import { useDogProfile } from '../../src/features/core/useDogProfile';

/**
 * Tab V1: Home / Fotocamera (storie) / {Nome cane}.
 * Diario resta in stack, link dalla Home (max 3 tab).
 */
export default function TabsLayout() {
  const { dog } = useDogProfile();
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
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          title: 'Fotocamera',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="camera" size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="rocky"
        options={{
          title: dog.name,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="paw" size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="diary"
        options={{
          href: null,
          title: 'Diario',
        }}
      />
    </Tabs>
  );
}
