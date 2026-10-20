/**
 * Copertina 16:9 delle card Diario ("la timeline è emotiva, il dettaglio
 * è clinico").
 * - DIGESTIVE: mai la foto in lista — cover illustrata "La sua pancia
 *   oggi": natura morta illustrata + punteggio in zampe da digestive_score
 *   (scala 1-7, 3-4 ideale). Senza score (mock/vecchi eventi) solo oggetti e stato.
 * - VIDEO: anteprima reale per-piattaforma (DiaryVideoPreview), fallback
 *   teal se la signed URL è scaduta o il fotogramma non si genera.
 * - PHOTO: <Image> con fallback onError allo stesso placeholder.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import { CuteIcon } from '../../components/CuteIcon';
import type { DiaryEntry } from '../core/types';
import { DiaryVideoPreview } from './DiaryVideoPreview';
import { SignedImage } from './SignedImage';

type DigestiveMood = {
  label: string;
  bg: string;
  fg: string;
};

const MOOD_SERENA: DigestiveMood = {
  label: 'Pancia serena',
  bg: colors.accentSoft,
  fg: colors.accentPressed,
};
const MOOD_PENSIEROSA: DigestiveMood = {
  label: 'Pancia pensierosa',
  bg: colors.warningSoft,
  fg: '#B45309',
};
const MOOD_DA_TENERE_D_OCCHIO: DigestiveMood = {
  label: 'Pancia da tenere d’occhio',
  bg: '#FFF1EE',
  fg: '#EA580C',
};

/**
 * Natura morta della digestione: ciotola, foglia e piccoli indicatori di
 * stato. Gli oggetti mantengono il tono gioioso senza introdurre un secondo
 * personaggio-cucciolo accanto alla foto reale del cane.
 */
function DigestiveStillLife({
  color,
  size = 96,
}: {
  color: string;
  size?: number;
}) {
  return (
    <Svg
      width={size}
      height={size * 0.82}
      viewBox="0 0 120 98"
      fill="none"
      accessible={false}
    >
      {/* scintilla e foglia */}
      <Path
        d="M100 12 l2.2 5.4 5.4 2.2 -5.4 2.2 -2.2 5.4 -2.2 -5.4 -5.4 -2.2 5.4 -2.2 Z"
        fill={color}
      />
      <Path
        d="M20 37 C14 28 16 20 26 16 C31 25 28 34 20 37 Z"
        fill={color}
        opacity={0.72}
      />
      <Path
        d="M20 36 C22 29 25 23 29 19"
        stroke="#FFF9F0"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      {/* ciotola */}
      <Path
        d="M30 48 C31 70 43 82 60 82 C77 82 89 70 90 48 Z"
        fill="#FFF9F0"
        stroke={colors.text}
        strokeWidth={2.8}
        strokeLinejoin="round"
      />
      <Path
        d="M27 47 C38 55 82 55 93 47 C86 40 34 40 27 47 Z"
        fill={color}
        opacity={0.34}
        stroke={colors.text}
        strokeWidth={2.8}
      />
      <Path
        d="M42 65 C50 70 70 70 78 65"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <Circle cx={102} cy={70} r={4} fill={color} opacity={0.45} />
      <Circle cx={111} cy={62} r={2.5} fill={color} opacity={0.35} />
    </Svg>
  );
}

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
      <DigestiveStillLife color={mood.fg} />
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

/**
 * Bottone play brandizzato sopra l'anteprima reale: scrim gradiente leggero
 * dal basso + cerchio bianco con ombra morbida e play teal.
 */
export function VideoPlayOverlay() {
  return (
    <View pointerEvents="none" style={styles.playOverlay}>
      <LinearGradient
        colors={['rgba(14, 42, 71, 0)', 'rgba(14, 42, 71, 0.25)']}
        locations={[0.55, 1]}
        style={styles.scrim}
      />
      <View style={styles.playButton}>
        <CuteIcon name="play" size={22} color={colors.accent} secondary={colors.text} />
      </View>
    </View>
  );
}

export function DiaryMediaCover({
  entry,
  badgeLabel,
  mediaActive = true,
}: {
  entry: DiaryEntry;
  badgeLabel: string | null;
  /** False for off-screen diary rows — avoids downloading behavior-raw. */
  mediaActive?: boolean;
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
        active={mediaActive}
        fallback={
          <TealPlaceholder icon="play" accessibilityLabel="Video del momento" />
        }
      />
    );
  }

  if (!mediaActive) {
    return (
      <TealPlaceholder icon="paw" accessibilityLabel="Foto del momento" />
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
    <SignedImage
      uri={entry.mediaUri}
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
  scrim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  playButton: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    ...shadows.raised,
  },
  photo: { width: '100%', height: '100%', resizeMode: 'cover' },
});
