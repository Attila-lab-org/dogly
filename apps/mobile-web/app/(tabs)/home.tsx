/**
 * Home Dogly: identità del cane, un unico invito a comprenderlo e l'ultimo
 * momento utile. La complessità dei servizi resta fuori dalla superficie.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors, radius, spacing } from '@/theme/tokens';
import { DogAvatar } from '@/features/core/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { currentAgeLabel } from '@/features/dogs/profileDates';
import { useHomeData } from '@/features/home/useHomeData';
import { useNetworkStatus } from '@/features/home/useNetworkStatus';
import { DoglyLogo } from '@/features/brand/DoglyLogo';
import { StoriesRail } from '@/features/stories/StoriesRail';
import { useStories } from '@/features/stories/data';

function CakeIcon() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 10h16v9a2 2 0 01-2 2H6a2 2 0 01-2-2v-9z"
        stroke="#06B6D4"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2 10h20M9 6v4M15 6v4"
        stroke="#06B6D4"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Circle cx="9" cy="4" r="1.2" fill="#06B6D4" />
      <Circle cx="15" cy="4" r="1.2" fill="#06B6D4" />
    </Svg>
  );
}

function DogSizeIcon() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 8.5C4 7.67 4.67 7 5.5 7H7l1.5-2.5 2 1-1 2.5h5l1.5-2 1.5 1-1 3.5h1.5a1.5 1.5 0 011.5 1.5V17h-2v-3h-2v3h-2v-4.5H9V17H7v-5.5H5.5A1.5 1.5 0 014 10V8.5z"
        fill="#06B6D4"
      />
    </Svg>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const {
    usage,
    lastInsight,
    processingEventId,
    loading,
    error,
    refetch,
  } = useHomeData(dog.id);

  const network = useNetworkStatus();
  const stories = useStories(dog.id, dog.name);
  const offline = network.offline;

  const behaviorRemaining = usage ? usage.behaviorLimit - usage.behaviorUsed : null;
  const quotaExhausted = behaviorRemaining !== null && behaviorRemaining <= 0;

  const ageLabel = currentAgeLabel(dog.birthDate, dog.ageLabel);
  const sizeLabel = dog.sizeLabel;
  const breedLabel = dog.breedLabel;

  const displayInsight = lastInsight;

  const startVideoCapture = () => {
    if (!dog.id || loading) return;
    if (processingEventId) {
      router.push(`/behavior/processing/${processingEventId}`);
      return;
    }
    if (quotaExhausted) {
      router.push('/paywall');
      return;
    }
    router.push('/behavior/capture');
  };

  const startAudioTell = () => {
    if (!dog.id) return;
    router.push('/realtime');
  };

  const openLastInsight = () => {
    if (!displayInsight) return;
    router.push(`/behavior/result/${displayInsight.eventId}`);
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Header Row: Logo Dogly centrato + campanella notifiche a destra */}
          <View style={styles.headerRow}>
            <View style={styles.headerSpacer} />
            <DoglyLogo width={120} style={styles.headerLogo} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Notifiche"
              onPress={() => router.push('/notifications')}
              hitSlop={12}
              style={styles.bellButton}
            >
              <Ionicons name="notifications-outline" size={26} color="#0E2A47" />
            </Pressable>
          </View>

          {/* Storie: rail orizzontale con anteprime (sez. 6 Home) */}
          <StoriesRail
            stories={stories}
            onAdd={() => router.push('/(tabs)/camera')}
            onOpen={(story) => router.push(`/stories/${story.id}` as never)}
          />

          {/* Profile Card: Rocky, Avatar, Heart, 3 meta rows (without "Quanto conosco Rocky") */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Apri il profilo di ${dog.name}`}
            onPress={() => router.push('/(tabs)/rocky')}
            style={styles.dogCard}
          >
            <DogAvatar
              size={112}
              photoUri={dog.photoUri}
              dogName={dog.name}
            />
            <View style={styles.dogCardBody}>
              <View style={styles.dogNameRow}>
                <Text style={styles.dogName}>{dog.name}</Text>
              </View>
              <View style={styles.dogMetaList}>
                {ageLabel ? (
                <View style={styles.dogMetaRow}>
                  <CakeIcon />
                  <Text style={styles.dogMetaText}>{ageLabel}</Text>
                </View>
                ) : null}
                {sizeLabel ? (
                <View style={styles.dogMetaRow}>
                  <DogSizeIcon />
                  <Text style={styles.dogMetaText}>{sizeLabel}</Text>
                </View>
                ) : null}
                {breedLabel ? (
                <View style={styles.dogMetaRow}>
                  <Ionicons name="paw" size={15} color="#06B6D4" />
                  <Text style={styles.dogMetaText}>{breedLabel}</Text>
                </View>
                ) : null}
              </View>
            </View>
          </Pressable>

          {offline && (
            <View style={styles.statusBanner} accessibilityLiveRegion="polite">
              <Ionicons name="cloud-offline-outline" size={16} color={colors.danger} />
              <Text style={styles.statusText}>Sei offline: ti mostro gli ultimi dati disponibili.</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Riprova connessione"
                onPress={() => { void network.refresh(); }}
                hitSlop={8}
              >
                <Text style={styles.statusRetry}>Riprova</Text>
              </Pressable>
            </View>
          )}

          {loading && !offline ? (
            <View style={styles.statusBanner} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.statusText}>Sto caricando i dati di {dog.name}.</Text>
            </View>
          ) : null}

          {error && !offline ? (
            <View style={styles.statusBanner} accessibilityLiveRegion="assertive">
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={styles.statusText}>Non sono riuscito ad aggiornare la Home.</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Riprova a caricare i dati"
                onPress={refetch}
                hitSlop={8}
              >
                <Text style={styles.statusRetry}>Riprova</Text>
              </Pressable>
            </View>
          ) : null}

          {processingEventId && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Apri l'analisi in corso di ${dog.name}`}
              onPress={() => router.push(`/behavior/processing/${processingEventId}`)}
              style={styles.processingBanner}
            >
              <Ionicons name="hourglass-outline" size={16} color={colors.primary} />
              <Text style={styles.processingText}>Sto osservando il video: ti avviso quando è pronto</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.primary} />
            </Pressable>
          )}

          {/* CTA dominante gradiente CAPISCI ROCKY */}
          <View style={styles.ctaWrap}>
            <LinearGradient
              colors={['#0050d8', '#01aec5']}
              start={{ x: 0, y: 0.2 }}
              end={{ x: 1, y: 0.8 }}
              style={styles.cta}
            >
              {/* Equalizzatore waveform audio a sinistra */}
              <View style={styles.waveformWrap} pointerEvents="none">
                <Svg width={72} height={60} viewBox="0 0 72 60" fill="none">
                  <Rect x="4" y="20" width="2.5" height="20" rx="1.25" fill="rgba(255,255,255,0.2)" />
                  <Rect x="11" y="14" width="2.5" height="32" rx="1.25" fill="rgba(255,255,255,0.25)" />
                  <Rect x="18" y="24" width="2.5" height="12" rx="1.25" fill="rgba(255,255,255,0.18)" />
                  <Rect x="25" y="8" width="2.5" height="44" rx="1.25" fill="rgba(255,255,255,0.28)" />
                  <Rect x="32" y="16" width="2.5" height="28" rx="1.25" fill="rgba(255,255,255,0.22)" />
                  <Rect x="39" y="10" width="2.5" height="40" rx="1.25" fill="rgba(255,255,255,0.25)" />
                  <Rect x="46" y="22" width="2.5" height="16" rx="1.25" fill="rgba(255,255,255,0.2)" />
                  <Rect x="53" y="15" width="2.5" height="30" rx="1.25" fill="rgba(255,255,255,0.22)" />
                  <Rect x="60" y="22" width="2.5" height="16" rx="1.25" fill="rgba(255,255,255,0.18)" />
                </Svg>
              </View>

              {/* Swoosh curva in basso a destra */}
              <View style={styles.swooshWrap} pointerEvents="none">
                <Svg width={140} height={80} viewBox="0 0 140 80" fill="none">
                  <Path
                    d="M0 80 C50 65, 80 35, 140 10 L140 80 Z"
                    fill="rgba(255, 255, 255, 0.08)"
                  />
                  <Path
                    d="M30 80 C70 70, 100 50, 140 30 L140 80 Z"
                    fill="rgba(255, 255, 255, 0.12)"
                  />
                </Svg>
              </View>

              <Text style={styles.ctaTitle}>CAPISCI {dog.name.toUpperCase()}</Text>
              <Text style={styles.ctaSubtitle}>
                Mostrami un momento oppure raccontami cosa hai notato
              </Text>

              <View style={styles.ctaButtons}>
                <View style={styles.ctaAction}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Parla di ${dog.name}`}
                    onPress={startAudioTell}
                    style={({ pressed }) => [
                      styles.ctaCircle,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Ionicons name="mic" size={30} color="#10B981" />
                  </Pressable>
                  <Text style={styles.ctaActionLabel}>Chiedi a DOGly</Text>
                </View>

                <View style={styles.ctaAction}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Registra un video di ${dog.name}`}
                    onPress={startVideoCapture}
                    disabled={!dog.id || loading}
                    style={({ pressed }) => [
                      styles.ctaCircle,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Ionicons name="videocam" size={30} color="#0284C7" />
                  </Pressable>
                  <Text style={styles.ctaActionLabel}>Video</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Riga "Ultima analisi": faccina sorridente verde in cerchio menta */}
          {displayInsight ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Apri l'ultima lettura: ${displayInsight.label}`}
              onPress={openLastInsight}
              style={styles.lastInsightRow}
            >
              <View style={styles.lastInsightIcon}>
                <Ionicons name="happy-outline" size={24} color="#10B981" />
              </View>
              <View style={styles.lastInsightText}>
                <Text style={styles.lastInsightLabel}>Ultima lettura</Text>
                <Text style={styles.lastInsightValue}>{displayInsight.label}</Text>
                <Text style={styles.lastInsightTime}>{displayInsight.timestampLabel}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </Pressable>
          ) : (
            <View style={styles.lastInsightRow}>
              <View style={styles.lastInsightIcon}>
                <Ionicons name="videocam-outline" size={24} color="#10B981" />
              </View>
              <View style={styles.lastInsightText}>
                <Text style={styles.lastInsightLabel}>Le vostre traduzioni</Text>
                <Text style={styles.lastInsightValue}>Ancora nessun momento</Text>
                <Text style={styles.lastInsightTime}>
                  Registra un video per iniziare a capire i suoi segnali.
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#EDF4F9',
  },
  safe: {
    flex: 1,
  },
  content: {
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    flexGrow: 1,
  },
  headerLogo: {
    marginBottom: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 12,
  },
  headerSpacer: {
    width: 40,
  },
  bellButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dogCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    shadowColor: '#0E2A47',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  dogCardBody: {
    flex: 1,
    marginLeft: 18,
  },
  dogNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dogName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0E2A47',
  },
  dogMetaList: {
    gap: 6,
  },
  dogMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dogMetaText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  statusText: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    lineHeight: 16,
  },
  statusRetry: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  processingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  processingText: {
    flex: 1,
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  ctaWrap: {
    marginBottom: 14,
    shadowColor: '#0050d8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 6,
  },
  cta: {
    borderRadius: 24,
    paddingTop: 36,
    paddingBottom: 38,
    paddingHorizontal: 20,
    alignItems: 'center',
    overflow: 'hidden',
  },
  waveformWrap: {
    position: 'absolute',
    left: 8,
    top: '32%',
    opacity: 0.85,
  },
  swooshWrap: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    opacity: 0.8,
  },
  ctaTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  ctaSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#FFFFFF',
    opacity: 0.92,
    marginTop: 6,
  },
  ctaButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
    marginTop: 32,
  },
  ctaAction: {
    alignItems: 'center',
    gap: 7,
  },
  ctaActionLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  ctaCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#002B75',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  lastInsightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    shadowColor: '#0E2A47',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    marginTop: 2,
  },
  lastInsightIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E6F8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastInsightText: {
    flex: 1,
    marginLeft: 14,
  },
  lastInsightLabel: {
    fontSize: 11,
    color: '#8295A8',
    fontWeight: '400',
  },
  lastInsightValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 2,
    marginBottom: 2,
  },
  lastInsightTime: {
    fontSize: 11,
    color: '#8295A8',
    fontWeight: '400',
  },
});
