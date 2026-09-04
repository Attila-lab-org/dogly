import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { tabBar } from '../../src/theme/tokens';

/**
 * UX LOCK (Spec V1 sez. 5.1): MASSIMO 3 tab primarie — Home / Diario / Rocky.
 * Non aggiungere altre tab: le altre route vivono fuori dal tab group.
 */
export default function TabsLayout() {
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
        name="diary"
        options={{
          title: 'Diario',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color as string} />
          ),
        }}
      />
      <Tabs.Screen
        name="rocky"
        options={{
          title: 'Rocky',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="paw" size={size} color={color as string} />
          ),
        }}
      />
    </Tabs>
  );
}
