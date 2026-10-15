/**
 * StoryHeader â€” header storie della pagina Social: cerchio grande con la
 * foto del cane, anello in gradiente (storia non vista), segni di moto,
 * bottone + blu per aggiungere. Predisposto per il futuro: accetta una
 * lista di storie (oggi "la tua"; domani le altre affiancate in scroll).
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Ellipse, LinearGradient as SvgLinearGradient, Path, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { CuteIcon } from '../../components/CuteIcon';
import { DogAvatar } from '../core/components';
import { hapticLight } from '../../lib/haptics';
import {
  getOrCreateStoriesAlbum,
  uploadAlbumPhoto,
} from '../photos/api';
import { pickAlbumPhoto, takeStoryPhoto } from '../photos/share';
import { pickWebImage } from '../photos/webPickImage';
import type { AlbumPhoto } from '../photos/types';

const RING = 116;
const AVATAR = 102;

/** Predisposto per storie future: oggi arriva solo "la tua". */
export interface StoryEntry {
  id: string;
  dogId: string;
  dogName: string;
  dogPhotoUri: string | null;
  unseen: boolean;
}

function GradientRing({ active }: { active: boolean }) {
  if (!active) {
    return (
      <View style={styles.ringFlat} pointerEvents="none" />
    );
  }
  return (
    <Svg
      pointerEvents="none"
      width={RING + 14}
      height={RING + 14}
      viewBox="0 0 130 130"
      style={styles.ringSvg}
    >
      <Defs>
        <SvgLinearGradient id="storyRing" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F58529" />
          <Stop offset="0.45" stopColor="#DD2A7B" />
          <Stop offset="0.75" stopColor="#8134AF" />
          <Stop offset="1" stopColor={colors.accent} />
        </SvgLinearGradient>
      </Defs>
      <Circle
        cx={65}
        cy={65}
        r={RING / 2 + 2}
        stroke="url(#storyRing)"
        strokeWidth={5}
        fill="none"
      />
      {/* segni di moto attorno all'anello */}
      <Path d="M8 42 a60 60 0 0 1 8 -16" stroke="#DD2A7B" strokeWidth={4} strokeLinecap="round" fill="none" />
      <Path d="M122 88 a60 60 0 0 1 -8 16" stroke={colors.accent} strokeWidth={4} strokeLinecap="round" fill="none" />
      <Path d="M112 22 a60 60 0 0 1 12 10" stroke="#8134AF" strokeWidth={4} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/** Zampine decorative sparse nell'area header (scenografia). */
function PawDecorations() {
  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      viewBox="0 0 360 150"
      preserveAspectRatio="xMaxYMin slice"
      accessible={false}
    >
      <g opacity={0.08}>
        <Ellipse cx={300} cy={26} rx={10} ry={8} fill={colors.accent} />
        <Circle cx={288} cy={16} r={3.4} fill={colors.accent} />
        <Circle cx={299} cy={12} r={3.4} fill={colors.accent} />
        <Circle cx={310} cy={16} r={3.4} fill={colors.accent} />
      </g>
      <g opacity={0.06}>
        <Ellipse cx={240} cy={120} rx={9} ry={7} fill={colors.primary} />
        <Circle cx={229} cy={110} r={3} fill={colors.primary} />
        <Circle cx={240} cy={106} r={3} fill={colors.primary} />
        <Circle cx={251} cy={110} r={3} fill={colors.primary} />
      </g>
    </Svg>
  );
}

export function StoryHeader({
  stories,
  uploading,
  onOpenStory,
  onUploaded,
}: {
  stories: StoryEntry[];
  uploading?: boolean;
  onOpenStory: (startIndex: number) => void;
  onUploaded: () => void;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const mine = stories[0];
  const isBusy = busy || uploading;

  const uploadUri = useCallback(
    async (uri: string) => {
      if (!mine) return;
      setBusy(true);
      try {
        const album = await getOrCreateStoriesAlbum(mine.dogId);
        await uploadAlbumPhoto(album.id, uri, {
          caption: `Storia di ${mine.dogName}`,
          visibility: 'PRIVATE',
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['social-stories', mine.dogId] }),
          queryClient.invalidateQueries({ queryKey: ['gallery-dog-photos', mine.dogId] }),
          queryClient.invalidateQueries({ queryKey: ['gallery-photos', album.id] }),
          queryClient.invalidateQueries({ queryKey: ['gallery-albums', mine.dogId] }),
        ]);
        onUploaded();
      } catch {
        Alert.alert(
          'Upload non riuscito',
          'Non sono riuscito a salvare questa storia. Riprova.',
        );
      } finally {
        setBusy(false);
      }
    },
    [mine, onUploaded, queryClient],
  );

  const runCamera = useCallback(() => {
    if (isBusy) return;
    void hapticLight();
    if (Platform.OS === 'web') {
      void pickWebImage({ capture: true }).then((picked) => {
        if (picked?.uri) void uploadUri(picked.uri);
      });
      return;
    }
    void takeStoryPhoto().then((uri) => {
      if (uri) void uploadUri(uri);
    });
  }, [isBusy, uploadUri]);

  const runGallery = useCallback(() => {
    if (isBusy) return;
    void hapticLight();
    if (Platform.OS === 'web') {
      void pickWebImage().then((picked) => {
        if (picked?.uri) void uploadUri(picked.uri);
      });
      return;
    }
    void pickAlbumPhoto().then((uri) => {
      if (uri) void uploadUri(uri);
    });
  }, [isBusy, uploadUri]);

  const openChooser = useCallback(() => {
    if (isBusy) return;
    if (Platform.OS === 'web') {
      runGallery();
      return;
    }
    Alert.alert('Aggiungi alla storia', undefined, [
      { text: 'Fotocamera', onPress: runCamera },
      { text: 'Galleria', onPress: runGallery },
      { text: 'Annulla', style: 'cancel' },
    ]);
  }, [isBusy, runCamera, runGallery]);

  if (!mine) return null;

  return (
    <View style={styles.wrap}>
      <PawDecorations />
      <View style={styles.ringArea}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            mine.unseen
              ? `Apri la storia di ${mine.dogName} (non vista)`
              : `Apri la storia di ${mine.dogName}`
          }
          onPress={() => {
            void hapticLight();
            onOpenStory(0);
          }}
          style={styles.ringPress}
        >
          <GradientRing active={mine.unseen} />
          <View style={styles.avatarInner} pointerEvents="none">
            <DogAvatar
              photoUri={mine.dogPhotoUri}
              dogName={mine.dogName}
              size={AVATAR}
            />
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Aggiungi una storia privata"
          onPress={openChooser}
          disabled={isBusy}
          hitSlop={10}
          style={styles.badgePlus}
        >
          {isBusy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="add" size={18} color="#FFFFFF" />
          )}
        </Pressable>
      </View>

      <View style={styles.copy}>
        <Text style={styles.name} numberOfLines={1}>
          {mine.dogName}
        </Text>
        <Text style={styles.label}>La tua storia · privata · 24 ore</Text>
        <View style={styles.moodChip}>
          <CuteIcon name="paw" size={12} color={colors.accent} secondary={colors.accent} />
          <Text style={styles.moodText}>Pronto per nuove avventure?</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  ringArea: {
    width: RING + 14,
    height: RING + 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPress: {
    width: RING + 14,
    height: RING + 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSvg: { position: 'absolute' },
  ringFlat: {
    position: 'absolute',
    width: RING + 4,
    height: RING + 4,
    borderRadius: (RING + 4) / 2,
    borderWidth: 2,
    borderColor: '#D1D5DB',
  },
  avatarInner: {
    width: AVATAR + 6,
    height: AVATAR + 6,
    borderRadius: (AVATAR + 6) / 2,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgePlus: {
    position: 'absolute',
    right: 2,
    bottom: 4,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  copy: { flex: 1, minWidth: 0, gap: spacing.xs },
  name: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
  },
  moodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    marginTop: spacing.xs,
  },
  moodText: {
    color: colors.text,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
});
