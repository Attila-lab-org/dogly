/**
 * Copertina 16:9 delle card Diario ("la timeline è emotiva, il dettaglio
 * è clinico").
 * - DIGESTIVE: mai la foto in lista — cover illustrata "La sua pancia
 *   oggi": mascotte + punteggio in zampe da digestive_score (scala 1-7,
 *   3-4 ideale). Senza score (mock/vecchi eventi) solo mascotte e stato.
 * - VIDEO: anteprima reale per-piattaforma (DiaryVideoPreview), fallback
 *   teal se la signed URL è scaduta o il fotogramma non si genera.
 * - PHOTO: <Image> con fallback onError allo stesso placeholder.
 */
import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import { CuteIcon } from '../../components/CuteIcon';
import { DogIllustration } from '../../components/DogIllustration';
import type { DiaryEntry } from '../core/types';
import { DiaryVideoPreview } from './DiaryVideoPreview';

type DigestiveMood = {
  label: string;
  bg: string;
  fg: string;
  illustration: 'welcome' | 'thinking' | 'resting';
};

const MOOD_SERENA: DigestiveMood = {
  label: 'Pancia serena',
  bg: colors.accentSoft,
  fg: colors.accentPressed,
  illustration: 'welcome',
};
const MOOD_PENSIEROSA: DigestiveMood = {
  label: 'Pancia pensierosa',
  bg: colors.warningSoft,
  fg: '#B45309',
  illustration: 'thinking',
};
const MOOD_DA_TENERE_D_OCCHIO: DigestiveMood = {
  label: 'Pancia da tenere d’occhio',
  bg: '#FFF1EE',
  fg: '#EA580C',
  illustration: 'thinking',
};

/**
 * Stato pancia: con score (Bristol-like 1-7, 3-4 ideale) vince il punteggio;
 * senza score riusa l'esito dell'euristica badge già usata nella lista.
 */
function digestiveMood(
  entry: DiaryEntry,
  badgeLabel: string | null,
): DigestiveMood {
  const score = entry.digestiveScore;
  if (score != null) {
    if (score >= 3 && score <= 4) return MOOD_SERENA;
    if (score === 2 || score === 5) return MOOD_PENSIEROSA;
    return MOOD_DA_TENERE_D_OCCHIO;
  }
  return badgeLabel === 'Da osservare' ? MOOD_DA_TENERE_D_OCCHIO : MOOD_SERENA;
}

function DigestiveCover({
  entry,
  badgeLabel,
}: {
  entry: DiaryEntry;
  badgeLabel: string | null;
}) {
  const mood = digestiveMood(entry, badgeLabel);
  const rawScore = entry.digestiveScore;
  const score =
    rawScore != null ? Math.max(1, Math.min(7, Math.round(rawScore))) : null;
  const accessibilityLabel = `Controllo digestione: ${mood.label}${
    score != null ? `, ${score} zampe su 7` : ''
  }`;

  return (
    <View
      style={[styles.cover, { backgroundColor: mood.bg }]}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <DogIllustration size={110} mood={mood.illustration} />
      {score != null ? (
        <View style={styles.pawsRow} accessible={false}>
          {Array.from({ length: 7 }, (_, index) => (
            <CuteIcon
              key={index}
              name="paw"
              size={13}
              color={index < score ? mood.fg : colors.border}
              secondary={index < score ? mood.fg : colors.border}
            />
          ))}
        </View>
      ) : null}
      <Text style={[styles.coverLabel, { color: mood.fg }]}>
        {score != null ? `${mood.label} · ${score} zampe su 7` : mood.label}
      </Text>
    </View>
  );
}

function TealPlaceholder({
  icon,
  accessibilityLabel,
}: {
  icon: 'play' | 'paw';
  accessibilityLabel: string;
}) {
  return (
    <LinearGradient
      colors={[colors.accentSoft, colors.surface]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.cover}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.playCircle}>
        <CuteIcon name={icon} size={32} color={colors.accent} secondary={colors.text} />
      </View>
    </LinearGradient>
  );
}

/** Cerchio play centrato, sopra l'anteprima reale del video. */
export function VideoPlayOverlay() {
  return (
    <View pointerEvents="none" style={styles.playOverlay}>
      <View style={styles.playCircleOnMedia}>
        <CuteIcon name="play" size={24} color={colors.textOnPrimary} secondary={colors.textOnPrimary} />
      </View>
    </View>
  );
}

export function DiaryMediaCover({
  entry,
  badgeLabel,
}: {
  entry: DiaryEntry;
  badgeLabel: string | null;
}) {
  const [failed, setFailed] = useState(false);

  if (entry.domain === 'DIGESTIVE') {
    return <DigestiveCover entry={entry} badgeLabel={badgeLabel} />;
  }

  if (entry.mediaKind === 'VIDEO') {
    if (!entry.mediaUri) {
      return <TealPlaceholder icon="play" accessibilityLabel="Video del momento" />;
    }
    return (
      <DiaryVideoPreview
        uri={entry.mediaUri}
        fallback={
          <TealPlaceholder icon="play" accessibilityLabel="Video del momento" />
        }
      />
    );
  }

  if (!entry.mediaUri || failed) {
    return (
      <View
        style={[styles.cover, { backgroundColor: colors.accentSoft }]}
        accessibilityRole="image"
        accessibilityLabel="Foto del momento"
      >
        <CuteIcon name="paw" size={32} color={colors.accent} secondary={colors.text} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: entry.mediaUri }}
      style={styles.photo}
      accessibilityLabel="Foto del momento"
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  cover: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  coverLabel: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  pawsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  playCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircleOnMedia: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlayDark,
  },
  photo: { width: '100%', height: '100%', resizeMode: 'cover' },
});
