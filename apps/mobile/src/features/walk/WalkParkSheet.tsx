import React from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { AvatarActor } from '@/features/core/AvatarActor';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useSession } from '@/features/auth/SessionProvider';
import type { NearbyPlace } from '@/features/places/api';
import { formatDistance } from '@/features/places/api';
import { fetchWalkHistory } from './history';

export function WalkParkSheet({ park, onClose }: { park: NearbyPlace | null; onClose: () => void }) {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { userId } = useSession();
  const memories = useQuery({
    queryKey: ['walk-history', userId, dog.id, 'park', park?.id],
    queryFn: () => fetchWalkHistory(dog.id, 1, 0, park!.id),
    enabled: Boolean(park && dog.id && userId),
  });
  const last = memories.data?.[0];
  return <Modal visible={Boolean(park)} transparent animationType="slide" onRequestClose={onClose}>
    <View style={s.overlay}><View style={s.sheet} accessibilityViewIsModal>
      <View style={s.heading}><Text style={s.eyebrow}>LA PROSSIMA AVVENTURA</Text><Pressable accessibilityRole="button" accessibilityLabel="Chiudi parco" onPress={onClose} style={s.close}><Ionicons name="close" size={24} color="#16364A" /></Pressable></View>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.scene}><Ionicons name="leaf" size={38} color="#90C7A0" /><AvatarActor dogName={dog.name} photoUri={dog.photoUri} size={90} expression="happy" animate={false} /><Ionicons name="sunny-outline" size={34} color="#DEAF55" /></View>
        <Text style={s.title}>{park?.name}</Text><Text style={s.body}>{formatDistance(park?.distance_m)} · un po’ di verde per voi</Text>
        {last && <Text style={s.memory}>{last.park_visited ? 'Il vostro ultimo ricordo qui' : 'La vostra ultima uscita con questa meta'} · {new Date(last.started_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}</Text>}
        {memories.isError && <Text style={s.body}>I ricordi di questo parco non sono disponibili, per ora.</Text>}
        <Pressable accessibilityRole="button" onPress={() => {
          if (!park) return;
          const params = { parkId: park.id, parkName: park.name, parkLat: String(park.lat), parkLng: String(park.lng) };
          onClose(); router.push({ pathname: '/walk', params } as never);
        }} style={s.primary}><Ionicons name="walk" size={20} color="#FFF" /><Text style={s.primaryText}>Passeggiamo qui</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { if (park) void Linking.openURL(park.maps_url); }} style={s.close}><Text style={s.link}>Come arrivare</Text></Pressable>
      </ScrollView>
    </View></View>
  </Modal>;
}
const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', backgroundColor: 'rgba(10,35,45,.35)' },
  sheet: { width: '100%', maxWidth: 600, maxHeight: '90%', padding: 22, backgroundColor: '#F8FCFA', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, eyebrow: { color: '#087D6B', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  close: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }, content: { gap: 14, paddingBottom: 24 },
  scene: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', backgroundColor: '#E1F2E5', borderRadius: 24, paddingVertical: 25 },
  title: { fontSize: 25, color: '#16364A', fontWeight: '800' }, body: { color: '#59737D', fontSize: 14, lineHeight: 21 },
  memory: { padding: 14, color: '#087D6B', backgroundColor: '#EAF4EE', borderRadius: 16, fontSize: 13 },
  primary: { minHeight: 54, backgroundColor: '#099F8D', borderRadius: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { color: '#FFF', fontWeight: '700', fontSize: 16 }, link: { color: '#087D6B', fontSize: 14, fontWeight: '600' },
});
