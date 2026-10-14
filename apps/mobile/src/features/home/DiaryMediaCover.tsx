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
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import { CuteIcon } from '../../components/CuteIcon';
import type { DiaryEntry } from '../core/types';
import { DiaryVideoPreview } from './DiaryVideoPreview';

type TummyMood = 'serena' | 'pensierosa' | 'preoccupata';

type DigestiveMood = {
  label: string;
  bg: string;
  fg: string;
  tummy: TummyMood;
};

const MOOD_SERENA: DigestiveMood = {
  label: 'Pancia serena',
  bg: colors.accentSoft,
  fg: colors.accentPressed,
  tummy: 'serena',
};
const MOOD_PENSIEROSA: DigestiveMood = {
  label: 'Pancia pensierosa',
  bg: colors.warningSoft,
  fg: '#B45309',
  tummy: 'pensierosa',
};
const MOOD_DA_TENERE_D_OCCHIO: DigestiveMood = {
  label: 'Pancia da tenere d’occhio',
  bg: '#FFF1EE',
  fg: '#EA580C',
  tummy: 'preoccupata',
};

/**
 * TummyBuddy — la "pancina" mascotte della cover digestione: corpo tondo
 * duotone (crema + contorno navy, accenti nel colore di stato), faccina per
 * umore e piccole decorazioni (sparkle, cuoricino, fogliolina).
 */
function TummyBuddy({
  mood,
  color,
  size = 96,
}: {
  mood: TummyMood;
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
      {/* decorazioni */}
      <Path
        d="M100 12 l2.2 5.4 5.4 2.2 -5.4 2.2 -2.2 5.4 -2.2 -5.4 -5.4 -2.2 5.4 -2.2 Z"
        fill={color}
      />
      <Path
        d="M18 30 c-3.2 -4.4 -10 -2.4 -10 2.2 c0 3.4 4.4 6.6 10 9.8 c5.6 -3.2 10 -6.4 10 -9.8 c0 -4.6 -6.8 -6.6 -10 -2.2 Z"
        fill={color}
        opacity={0.55}
      />
      <Path
        d="M104 62 c6 -1 9 -5 9 -10 c-5 0 -9 3 -10 8 c-2 -1 -4 -1 -6 0 c1 3 3 5 7 2 Z"
        fill={color}
        opacity={0.45}
      />
      {/* corpo pancia tonda */}
      <Path
        d="M60 16 C86 16 102 36 102 56 C102 78 85 90 60 90 C35 90 18 78 18 56 C18 36 34 16 60 16 Z"
        fill="#FFF9F0"
        stroke={colors.text}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      {/* blush */}
      <Circle cx={42} cy={62} r={4.6} fill={color} opacity={0.35} />
      <Circle cx={78} cy={62} r={4.6} fill={color} opacity={0.35} />
      {/* ombelico a ricciolo */}
      <Path
        d="M60 76 c4 0 6.4 2.8 4.6 5.6 c-1.8 2.6 -6.4 2.4 -7.6 -0.6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {mood === 'serena' ? (
        <>
          <Path
            d="M44 50 q4.5 -5 9 0"
            stroke={colors.text}
            strokeWidth={2.6}
            strokeLinecap="round"
          />
          <Path
            d="M67 50 q4.5 -5 9 0"
            stroke={colors.text}
            strokeWidth={2.6}
            strokeLinecap="round"
          />
          <Path
            d="M50 62 q10 8 20 0"
            stroke={colors.text}
            strokeWidth={2.6}
            strokeLinecap="round"
          />
        </>
      ) : null}
      {mood === 'pensierosa' ? (
        <>
          <Circle cx={50} cy={50} r={2.6} fill={colors.text} />
          <Circle cx={72} cy={50} r={2.6} fill={colors.text} />
          <Path
            d="M46 44 h9 M68 44 h9"
            stroke={colors.text}
            strokeWidth={2.2}
            strokeLinecap="round"
            opacity={0.6}
          />
          <Path
            d="M55 64 q5 3 10 0"
            stroke={colors.text}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        </>
      ) : null}
      {mood === 'preoccupata' ? (
        <>
          <Path
            d="M43 42 q5 -4 10 -1 M67 41 q5 -3 10 1"
            stroke={colors.text}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <Circle cx={48} cy={51} r={2.6} fill={colors.text} />
          <Circle cx={72} cy={51} r={2.6} fill={colors.text} />
          <Path
            d="M50 65 q5 -4.5 10 0 q5 4.5 10 0"
            stroke={colors.text}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        </>
      ) : null}
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
      <TummyBuddy mood={mood.tummy} color={mood.fg} />
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
