/**
 * Hub "Giochi": i tre mini-giochi da giocare insieme al cane.
 * Scoiattolo!, Agility Oreo e Fiuto da campione — tutti giocabili.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Rect } from 'react-native-svg';
import { ScreenContainer } from '@/components';
import { CuteIcon } from '@/components/CuteIcon';
import { StackScreenHeader } from '@/features/secondary/components';
import { SquirrelArt } from '@/features/games/squirrelArt';
import { MatchPiece } from '@/features/games/matchPieces';
import { GAME_LABELS, type GameId } from '@/features/games/api';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';

function AgilityMark() {
  return (
    <Svg width={86} height={62} viewBox="0 0 86 62">
      <Rect x={2} y={8} width={5} height={54} fill={colors.text} />
      <Rect x={79} y={8} width={5} height={54} fill={colors.text} />
      <Rect x={0} y={18} width={86} height={8} rx={4} fill={colors.accent} />
      <Rect x={0} y={38} width={86} height={8} rx={4} fill={colors.textOnPrimary} stroke={colors.text} strokeWidth={2} />
      <Path
        d="M30 12 C36 0 50 0 56 12"
        stroke={colors.accent}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

function MatchMark() {
  return (
    <View style={styles.markGrid}>
      {[0, 1, 2, 3].map((piece) => (
        <MatchPiece key={piece} type={piece} size={34} />
      ))}
    </View>
  );
}

const GAMES: {
  id: GameId;
  route: string;
  text: string;
  art: 'match' | 'squirrel' | 'agility';
  gradient: [string, string, string];
}[] = [
  {
    id: 'match',
    route: '/games/match',
    text: 'Il preferito del quartiere: scambia le tessere, scoppia le file, catene a moltiplicatore!',
    art: 'match',
    gradient: ['#E0F7F4', '#F0FAF6', '#FFF3D6'],
  },
  {
    id: 'squirrel',
    route: '/games/squirrel',
    text: 'Gli scoiattoli sbucano dalle buche: acchiappali prima che scappino. Attento al riccio!',
    art: 'squirrel',
    gradient: ['#DFF3EC', '#EAF7F1', '#FFF6E8'],
  },
  {
    id: 'agility',
    route: '/games/agility',
    text: 'Corri, salta muretti e birilli… ma il tunnel si attraversa da sotto!',
    art: 'agility',
    gradient: ['#E3EFFE', '#EAF3FD', '#E0F7F4'],
  },
];

export default function GamesHubScreen() {
  const router = useRouter();
  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Giochi" />
      <Text style={styles.intro}>
        Tre minuti di gioco insieme valgono più di un’ora di divano. Scegliete
        la vostra sfida.
      </Text>

      {GAMES.map((game) => (
        <Pressable
          key={game.id}
          accessibilityRole="button"
          accessibilityLabel={`Gioca a ${GAME_LABELS[game.id]}`}
          onPress={() => router.push(game.route as never)}
          style={({ pressed }) => [styles.heroCard, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={game.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>{GAME_LABELS[game.id]}</Text>
            <Text style={styles.heroText}>{game.text}</Text>
            <View style={styles.heroCta}>
              <CuteIcon name="play" size={16} color={colors.textOnPrimary} secondary={colors.textOnPrimary} />
              <Text style={styles.heroCtaText}>Gioca</Text>
            </View>
          </View>
          {game.art === 'match' ? (
            <MatchMark />
          ) : game.art === 'squirrel' ? (
            <SquirrelArt size={92} />
          ) : (
            <AgilityMark />
          )}
        </Pressable>
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  markGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 72,
    justifyContent: 'center',
  },
  intro: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.lg,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.card,
  },
  heroCopy: { flex: 1, minWidth: 0, gap: spacing.sm },
  heroTitle: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  heroText: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  heroCtaText: {
    color: colors.textOnPrimary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  pressed: { opacity: 0.9 },
});
