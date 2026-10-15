/**
 * Artwork kawaii duotone di "Scoiattolo!" (stile TummyBuddy/CuteIcon:
 * corpo crema, contorno navy, accenti teal). Varianti: squirrel,
 * golden (raro, alone dorato), hedgehog (riccio amico: NON va toccato).
 */
import React from 'react';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { colors } from '../../theme/tokens';

export type SquirrelArtVariant = 'squirrel' | 'golden' | 'hedgehog';

export function SquirrelArt({
  variant = 'squirrel',
  size = 64,
}: {
  variant?: SquirrelArtVariant;
  size?: number;
}) {
  if (variant === 'hedgehog') {
    return (
      <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
        {/* aculei */}
        <Path
          d="M18 58 L24 40 L32 54 L38 34 L47 50 L55 32 L62 50 L71 36 L76 54 L82 44 L84 60 Z"
          fill="#D9B08C"
          stroke={colors.text}
          strokeWidth={2.6}
          strokeLinejoin="round"
        />
        {/* muso */}
        <Ellipse cx={58} cy={64} rx={24} ry={16} fill="#FFF9F0" stroke={colors.text} strokeWidth={2.6} />
        <Circle cx={52} cy={62} r={2.6} fill={colors.text} />
        <Circle cx={72} cy={62} r={2.6} fill={colors.text} />
        {/* nasino */}
        <Circle cx={82} cy={66} r={3.4} fill={colors.accent} />
        {/* boccuccia */}
        <Path d="M58 71 q4 3 8 0" stroke={colors.text} strokeWidth={2} strokeLinecap="round" />
        {/* zampine */}
        <Path d="M42 80 v5 M72 80 v5" stroke={colors.text} strokeWidth={2.6} strokeLinecap="round" />
      </Svg>
    );
  }

  const golden = variant === 'golden';
  const body = golden ? '#FFE9B8' : '#FFF9F0';
  const accent = golden ? '#E9A93B' : colors.accent;

  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      {golden ? (
        <Circle cx={48} cy={50} r={42} fill="#F6C94C" opacity={0.28} />
      ) : null}
      {/* coda grande dietro */}
      <Path
        d="M70 78 C88 74 92 52 84 38 C78 27 66 24 60 31 C54 38 60 46 66 44 C62 52 64 62 58 70 Z"
        fill={golden ? '#F6D98A' : colors.accentSoft}
        stroke={colors.text}
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      {/* corpo tondo */}
      <Ellipse cx={42} cy={62} rx={24} ry={22} fill={body} stroke={colors.text} strokeWidth={2.8} />
      {/* orecchie */}
      <Circle cx={28} cy={38} r={7} fill={body} stroke={colors.text} strokeWidth={2.6} />
      <Circle cx={52} cy={34} r={7} fill={body} stroke={colors.text} strokeWidth={2.6} />
      <Circle cx={28} cy={38} r={3} fill={accent} opacity={0.5} />
      <Circle cx={52} cy={34} r={3} fill={accent} opacity={0.5} />
      {/* pancia */}
      <Ellipse cx={42} cy={68} rx={13} ry={11} fill={colors.surface} opacity={0.85} />
      {/* faccina */}
      <Circle cx={34} cy={54} r={3} fill={colors.text} />
      <Circle cx={52} cy={54} r={3} fill={colors.text} />
      <Ellipse cx={43} cy={60} rx={3.4} ry={2.6} fill={accent} />
      <Path d="M37 65 q6 5 12 0" stroke={colors.text} strokeWidth={2.2} strokeLinecap="round" />
      {/* dentino */}
      <Path d="M41 67 h4 v3 h-4 Z" fill={colors.surface} stroke={colors.text} strokeWidth={1.2} />
      {/* blush */}
      <Circle cx={27} cy={60} r={3.2} fill={accent} opacity={0.35} />
      <Circle cx={59} cy={60} r={3.2} fill={accent} opacity={0.35} />
      {/* zampine */}
      <Path d="M30 83 v4 M52 83 v4" stroke={colors.text} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}
