import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { hapticLight } from '../../src/lib/haptics';
import { useSession } from '../../src/features/auth/SessionProvider';
import { useDogProfile } from '../../src/features/core/useDogProfile';

/**
 * Tab ADR-017: Home / Diario / {cane} / Social (storie Momenti + luoghi).
 * Protetto: senza sessione → welcome. Icona attiva: pill teal-soft +
 * piccolo bounce; tap tab = haptic leggero (nativa).
 */
function TabIcon({
  name,
  outline,
  color,
  size,
  focused,
}: {
  name: keyof typeof Ionicons.glyphMap;
  outline: keyof typeof Ionicons.glyphMap;
  color: string;
  size: number;
  focused: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!focused || reducedMotion) return;
    scale.value = 0.82;
    scale.value = withSpring(1, { damping: 8, stiffness: 240 });
  }, [focused, reducedMotion, scale]);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const pillStyle = useAnimatedStyle(() => ({
    opacity: withTiming(focused ? 1 : 0, { duration: 160 }),
  }));
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            width: size + 22,
            height: size + 14,
            borderRadius: (size + 14) / 2,
            backgroundColor: 'rgba(20, 184, 166, 0.14)',
          },
          pillStyle,
        ]}
      />
      <Animated.View style={iconStyle}>
        <Ionicons name={focused ? name : outline} size={size} color={color} />
      </Animated.View>
    </View>
  );
}

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
      screenListeners={{
        tabPress: () => {
          void hapticLight();
        },
      }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0066FF',
        tabBarInactiveTintColor: '#8E9CAE',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginTop: -2,
        },
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2E8F0',
          borderTopWidth: 1,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarBackground: () => (
          <View
            style={{
              flex: 1,
              backgroundColor: '#FFFFFF',
              justifyContent: 'flex-end',
              alignItems: 'center',
              paddingBottom: 6,
            }}
          >
            <View
              style={{
                width: 134,
                height: 4.5,
                borderRadius: 3,
                backgroundColor: '#0E1726',
              }}
            />
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="home" outline="home-outline" color={color as string} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="diary"
        options={{
          title: 'Diario',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="calendar" outline="calendar-outline" color={color as string} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="rocky"
        options={{
          title: dog.name || 'Cane',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="paw" outline="paw-outline" color={color as string} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: 'Momenti',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="people" outline="people-outline" color={color as string} size={size} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
