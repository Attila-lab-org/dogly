import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SpringPress } from '@/components/pressSpring';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { AvatarActor } from '@/features/core/AvatarActor';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useSession } from '@/features/auth/SessionProvider';
import { fetchWalkHistory, fetchWalkProgress, type WalkHistoryItem } from './history';
import { walkProgress, type ProgressWalk } from './progress';
import { WalkRouteArt, WalkRouteMini } from './WalkRouteArt';
import { shareWalkCard } from './share';

const duration = (seconds: number) => seconds < 60 ? `${seconds} sec` : `${Math.round(seconds / 60)} min`;
const distance = (meters: number) => `${(meters / 1000).toFixed(2).replace('.', ',')} km`;
const date = (iso: string) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
const warmDate = (iso: string) => {
  const at = new Date(iso);
  const today = new Date(); today.setHours(0,0,0,0);
  const day = new Date(at); day.setHours(0,0,0,0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diff <= 0) return 'Oggi';
  if (diff === 1) return 'Ieri';
  if (diff < 7) return at.toLocaleDateString('it-IT', { weekday: 'long' });
  return at.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
};
const dayKey = (iso: string) => { const d = new Date(iso); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); };
type Badge = ReturnType<typeof walkProgress>['badges'][number];

export function WalkHistorySection({ dogId, dogName, enabled, variant = 'default' }: { dogId: string; dogName: string; enabled: boolean; variant?: 'default' | 'activity' }) {
  const { dog } = useDogProfile();
  const { userId, session } = useSession();
  const client = useQueryClient();
  const [selected, setSelected] = useState<WalkHistoryItem | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [badge, setBadge] = useState<Badge | null>(null);
  const [sharing, setSharing] = useState(false);
  const history = useInfiniteQuery({
    queryKey: ['walk-history', userId, dogId],
    queryFn: ({ pageParam }) => fetchWalkHistory(dogId, 8, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => last.length === 8 ? pages.length * 8 : undefined,
    enabled: enabled && Boolean(dogId), staleTime: 20000,
  });
  const progress = useQuery({
    queryKey: ['walk-progress', userId, dogId],
    queryFn: () => fetchWalkProgress(dogId),
    enabled: enabled && Boolean(dogId), staleTime: 20000,
  });
  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    void client.invalidateQueries({ queryKey: ['walk-history', userId, dogId] });
    void client.invalidateQueries({ queryKey: ['walk-progress', userId, dogId] });
  }, [client, enabled, userId, dogId]));
  const walks = useMemo(() => history.data?.pages.flat() ?? [], [history.data]);
  const demoRewards = session?.user?.email?.toLowerCase() === process.env.EXPO_PUBLIC_DEMO_REWARDS_EMAIL?.toLowerCase();
  const simulatedProgress = useMemo<ProgressWalk[]>(() => {
    if (!demoRewards) return progress.data ?? [];
    const monday = new Date();
    monday.setHours(12, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) - 7);
    const day = (offset: number) => new Date(monday.getTime() + offset * 86400000).toISOString();
    return [
      { id: 'demo-first', started_at: day(0), duration_seconds: 420, distance_meters: 760, park: null, park_visited: false },
      { id: 'demo-park', started_at: day(1), duration_seconds: 540, distance_meters: 1200, park: { id: 'demo-park', name: 'Parco della mascotte', lat: 45.07, lng: 7.68 }, park_visited: true },
    ];
  }, [demoRewards, progress.data]);
  const stats = useMemo(() => walkProgress(simulatedProgress), [simulatedProgress]);
  const latest = walks[0];
  const earnedCount = stats.badges.filter((item) => item.current >= item.goal).length;
  const share = async () => {
    if (!selected || sharing) return;
    setSharing(true);
    try {
      const result = await shareWalkCard({ dogName, duration: duration(selected.duration_seconds), distance: distance(selected.distance_meters), steps: String(selected.steps_estimate), date: date(selected.started_at), routePoints: selected.route_points, includeRoute: true });
      if (result === 'copied') Alert.alert('Ricordo pronto', 'Puoi condividerlo dove vuoi.');
    } catch { Alert.alert('Riproviamo?', 'Non sono riuscito a preparare il ricordo.'); }
    finally { setSharing(false); }
  };
  return <View style={s.section}>
    {variant !== 'activity' ? <View style={s.heading}><View><Text style={s.eyebrow}>LE VOSTRE AVVENTURE</Text><Text style={s.title}>Fuori, insieme.</Text></View><Ionicons name="paw-outline" size={21} color="#087D6B" /></View> : null}
    {!enabled ? <View style={s.empty}><AvatarActor dogName={dogName} photoUri={dog.photoUri} size={74} expression="happy" animate={false} /><Text style={s.cardTitle}>I vostri ricordi vi aspettano</Text><Text style={s.body}>Le passeggiate completate e i premi conquistati appariranno qui.</Text></View>
      : history.isPending ? <ActivityIndicator accessibilityLabel="Carico le passeggiate" color="#087D6B" style={s.loading} />
      : history.isError ? <View style={s.empty}><Text style={s.body}>I ricordi non si caricano, per ora.</Text><Pressable accessibilityRole="button" onPress={() => void history.refetch()} style={s.smallButton}><Text style={s.link}>Riprova</Text></Pressable></View>
      : <>
        {latest ? <SpringPress accessibilityRole="button" accessibilityLabel={'Apri il ricordo del ' + date(latest.started_at)} onPress={() => setSelected(latest)} pressableStyle={s.latestCard}>
          <View style={s.latestTop}><View style={s.latestCopy}><Text style={s.eyebrow}>ULTIMA USCITA</Text><Text style={s.latestTitle} numberOfLines={1}>{latest.park?.name ?? `A spasso con ${dogName}`}</Text><Text style={s.date}>{date(latest.started_at)} · un ricordo da rivivere</Text></View><View style={s.avatar}><AvatarActor dogName={dogName} photoUri={dog.photoUri} size={62} expression={latest.duration_seconds >= 300 ? 'celebrate' : 'happy'} animate={false} /></View></View>
          <WalkRouteArt points={latest.route_points} compact />
          <View style={s.latestFooter}><Text style={s.metrics}>{duration(latest.duration_seconds)} · {distance(latest.distance_meters)}</Text><View style={s.memoryPill}><Ionicons name={latest.park_visited ? 'leaf' : 'paw'} size={12} color="#087D6B" /><Text style={s.memoryPillText}>{latest.park_visited ? 'Meta conquistata' : 'Ricordo salvato'}</Text></View></View>
        </SpringPress> : <View style={s.empty}><AvatarActor dogName={dogName} photoUri={dog.photoUri} size={78} expression="happy" animate={false} /><Text style={s.cardTitle}>La prima impronta è tutta vostra.</Text><Text style={s.body}>Partite dalla Home. Al ritorno, il vostro momento apparirà qui con il primo premio.</Text></View>}
        {progress.isPending && !demoRewards ? <ActivityIndicator color="#087D6B" /> : progress.isError && !demoRewards ? <Pressable accessibilityRole="button" onPress={() => void progress.refetch()} style={s.smallButton}><Text style={s.link}>Riprova a caricare i premi</Text></Pressable> : <>
          {stats.weekCount > 0 && <View style={s.week}><Ionicons name="sparkles-outline" size={15} color="#087D6B" /><Text style={s.weekText}>{stats.weekCount} {stats.weekCount === 1 ? 'uscita' : 'uscite'} · {stats.weekMinutes} minuti insieme questa settimana</Text></View>}
          <SpringPress accessibilityRole="button" accessibilityLabel={`Apri i premi della passeggiata, ${earnedCount} su 3 sbloccati`} onPress={() => setBadge(stats.badges.find((item) => item.current < item.goal) ?? stats.badges[0])} pressableStyle={s.rewardBar}><View style={s.rewardOrb}><Ionicons name="sparkles" size={18} color="#087D6B" /></View><View style={s.rewardCopy}><Text style={s.rewardEyebrow}>{earnedCount} / 3 PREMI SBLOCCATI</Text><Text style={s.rewardTitle}>{earnedCount === 3 ? 'Avete completato tutto' : `Prossimo premio: ${stats.badges.find((item) => item.current < item.goal)?.title ?? 'tutto completato'}`}</Text></View><Ionicons name="chevron-forward" size={18} color="#087D6B" /></SpringPress>
        </>}
        {(() => {
      const rest = walks.slice(1);
      if (!rest.length) return null;
      // Righe degne: raggruppate per giorno, max 5 recenti + "Vedi tutte".
      const groups: { key: string; label: string; items: typeof rest }[] = [];
      rest.forEach((item) => {
        const key = dayKey(item.started_at);
        const existing = groups.find((g) => g.key === key);
        if (existing) existing.items.push(item);
        else groups.push({ key, label: warmDate(item.started_at), items: [item] });
      });
      const visible = expanded ? groups : groups.reduce<{ key: string; label: string; items: typeof rest }[]>((acc, g) => {
        const used = acc.reduce((n, x) => n + x.items.length, 0);
        if (used >= 5) return acc;
        acc.push({ ...g, items: g.items.slice(0, 5 - used) });
        return acc;
      }, []);
      const hidden = rest.length - visible.reduce((n, g) => n + g.items.length, 0);
      return <>
        <Text style={s.subtitle}>Da rivivere</Text>
        {visible.map((group) => (
          <View key={group.key} style={s.dayGroup}>
            {group.items.length > 1 ? <Text style={s.dayHeader}>{group.label} · {group.items.length} uscite</Text> : null}
            {group.items.map((item) => (
              <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={'Apri il ricordo del ' + date(item.started_at)} onPress={() => setSelected(item)} style={({ pressed }) => [s.memory, pressed && s.pressed]}>
                <WalkRouteMini points={item.route_points} />
                <View style={s.grow}>
                  <Text style={s.memoryTitle} numberOfLines={1}>{item.park?.name ?? `A spasso con ${dogName}`}</Text>
                  <Text style={s.date}>{group.items.length > 1 ? `${warmDate(item.started_at)} · ` : ''}{warmDate(item.started_at)} · {duration(item.duration_seconds)} · {distance(item.distance_meters)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#788C87" />
              </Pressable>
            ))}
          </View>
        ))}
        {hidden > 0 && <Pressable accessibilityRole="button" onPress={() => setExpanded(true)} style={s.smallButton}><Text style={s.link}>Vedi tutte ({rest.length} uscite)</Text></Pressable>}
      </>;
    })()}
        {history.hasNextPage && <Pressable accessibilityRole="button" disabled={history.isFetchingNextPage} onPress={() => void history.fetchNextPage()} style={s.smallButton}><Text style={s.link}>{history.isFetchingNextPage ? 'Un attimo…' : history.isFetchNextPageError ? 'Riprova' : 'Altri ricordi'}</Text></Pressable>}
      </>}
    <Modal visible={Boolean(selected || badge)} transparent animationType="slide" onRequestClose={() => { setSelected(null); setBadge(null); }}><View style={s.overlay}><View style={s.sheet} accessibilityViewIsModal><View style={s.sheetHeader}><Text style={s.eyebrow}>{badge ? 'PREMIO DELLA VOSTRA STORIA' : 'IL VOSTRO RICORDO'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Chiudi ricordo" onPress={() => { setSelected(null); setBadge(null); }} style={s.close}><Ionicons name="close" size={24} color="#16364A" /></Pressable></View><ScrollView contentContainerStyle={s.sheetContent}>
      {badge ? <View style={s.rewardSheet}><AvatarActor dogName={dogName} photoUri={dog.photoUri} size={88} expression={badge.current >= badge.goal ? 'celebrate' : 'focused'} animate={false} /><Text style={s.sheetTitle}>{badge.title}</Text><Text style={s.body}>{badge.description}</Text><View style={s.rewardCard}><Ionicons name={badge.current >= badge.goal ? 'sparkles' : 'lock-open-outline'} size={20} color="#087D6B" /><Text style={s.rewardText}>{badge.current >= badge.goal ? `Premio sbloccato: ${badge.reward}` : `Prossimo premio: ${badge.reward}`}</Text></View></View> : selected ? <><Text style={s.sheetTitle}>{selected.park?.name ?? `A spasso con ${dogName}`}</Text><Text style={s.body}>{date(selected.started_at)} · {duration(selected.duration_seconds)} insieme</Text><WalkRouteArt points={selected.route_points} /><Text style={s.metrics}>{distance(selected.distance_meters)} · {selected.steps_estimate} passi stimati</Text><Pressable accessibilityRole="button" disabled={sharing} onPress={() => void share()} style={[s.primary, sharing && s.pressed]}><Ionicons name="share-outline" size={19} color="#FFF" /><Text style={s.primaryText}>{sharing ? 'Preparo il ricordo…' : 'Condividi il ricordo'}</Text></Pressable></> : null}
    </ScrollView></View></View></Modal>
  </View>;
}
const s = StyleSheet.create({
  section: { marginHorizontal: 14, gap: 12 }, dayGroup: { gap: 0 }, dayHeader: { color: '#446D61', fontSize: 11, fontWeight: '700', paddingTop: 8, paddingBottom: 2 }, rewardBar: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 18, backgroundColor: '#E8F7EF', borderWidth: 1, borderColor: '#C9ECDD' }, rewardOrb: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, rewardCopy: { flex: 1, gap: 3 }, rewardEyebrow: { color: '#087D6B', fontSize: 9, fontWeight: '800', letterSpacing: 1.1 }, rewardTitle: { color: '#16364A', fontSize: 13, fontWeight: '800' },  heading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }, eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: '#087D6B' }, title: { fontSize: 25, fontWeight: '800', color: '#16364A', letterSpacing: -.6, marginTop: 3 }, subtitle: { fontSize: 16, fontWeight: '800', color: '#16364A', marginTop: 3, flex: 1 }, counter: { color: '#6E8780', fontSize: 12, fontWeight: '700' }, latestCard: { padding: 12, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DCEDE5', gap: 10 }, latestTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, latestCopy: { flex: 1, gap: 4 }, latestTitle: { color: '#16364A', fontWeight: '800', fontSize: 18 }, avatar: { padding: 3, borderRadius: 999, backgroundColor: '#F0F9F4' }, latestFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, metrics: { color: '#16364A', fontSize: 13, fontWeight: '800' }, memoryPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: '#E8F7EF', borderRadius: 999 }, memoryPillText: { color: '#087D6B', fontSize: 11, fontWeight: '800' }, date: { fontSize: 11, color: '#6E8780' }, body: { color: '#59737D', fontSize: 13, lineHeight: 19 }, cardTitle: { color: '#16364A', fontWeight: '800', fontSize: 17, textAlign: 'center' }, empty: { borderRadius: 20, padding: 20, gap: 10, alignItems: 'center', backgroundColor: '#EEF7F2' }, loading: { padding: 36 }, week: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 }, weekText: { color: '#446D61', fontSize: 12, lineHeight: 17 }, badges: { flexDirection: 'row', gap: 7 }, badge: { flex: 1, minHeight: 152, alignItems: 'center', gap: 7, paddingVertical: 13, paddingHorizontal: 5, borderRadius: 18, borderWidth: 1 }, badgeFirst: { backgroundColor: '#FFF8E7', borderColor: '#F2E1AD' }, badgeExplorer: { backgroundColor: '#EAF8F0', borderColor: '#C8E8D5' }, badgeRitual: { backgroundColor: '#F4EEFF', borderColor: '#E0D2F6' }, badgeEarned: { shadowColor: '#087D6B', shadowOpacity: .12, shadowRadius: 10, elevation: 2 }, medal: { height: 48, width: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,.7)', borderWidth: 2, borderColor: 'rgba(255,255,255,.9)', alignItems: 'center', justifyContent: 'center' }, medalEarned: { backgroundColor: '#DBF3DE', borderColor: '#A8D9B4' }, check: { position: 'absolute', right: -4, bottom: -3, borderRadius: 9, backgroundColor: '#087D6B', padding: 3 }, badgeTitle: { color: '#24485A', fontSize: 11, lineHeight: 14, fontWeight: '800', textAlign: 'center' }, progressTrack: { width: '86%', height: 5, borderRadius: 3, backgroundColor: 'rgba(80,110,100,.16)', overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 3, backgroundColor: '#087D6B' }, badgeReward: { color: '#71857D', fontSize: 10, textAlign: 'center' }, badgeRewardEarned: { color: '#087D6B', fontWeight: '800' }, memory: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#E3ECE8' }, miniIcon: { padding: 10, backgroundColor: '#E5F3EB', borderRadius: 14 }, grow: { flex: 1, gap: 3 }, memoryTitle: { color: '#24485A', fontSize: 13, fontWeight: '700' }, smallButton: { minHeight: 40, justifyContent: 'center', alignItems: 'center' }, link: { color: '#087D6B', fontWeight: '800', fontSize: 13 }, pressed: { opacity: .66 }, overlay: { flex: 1, backgroundColor: 'rgba(10,35,45,.35)', justifyContent: 'flex-end', alignItems: 'center' }, sheet: { width: '100%', maxWidth: 600, maxHeight: '90%', backgroundColor: '#F8FCFA', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20 }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, sheetContent: { gap: 15, paddingBottom: 24 }, rewardSheet: { alignItems: 'center', gap: 13, paddingVertical: 8 }, sheetTitle: { color: '#16364A', fontSize: 23, lineHeight: 29, fontWeight: '800', textAlign: 'center' }, rewardCard: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: '#E8F7EF' }, rewardText: { flex: 1, color: '#087D6B', fontSize: 14, fontWeight: '800' }, primary: { backgroundColor: '#099F8D', minHeight: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14 }, primaryText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
});
