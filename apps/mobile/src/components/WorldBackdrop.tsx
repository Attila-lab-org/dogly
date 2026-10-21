/**
 * Fondale-mondo: ogni pagina ha una mini-scena illustrata riconoscibile
 * (stesso stile grafico della scena Home: forme SVG morbide, gradiente che
 * sfuma nel colore di sfondo della pagina, elementi duotone brand).
 * La scena vive nella fascia alta (~240px), statica o con una nuvoletta che
 * deriva lenta (unica micro-animazione; reduce-motion → tutto statico).
 * Sempre sotto il contenuto, nascosta agli screen reader.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme/tokens';

export type WorldKind =
  | 'diary'
  | 'care'
  | 'pantry'
  | 'profile'
  | 'social'
  | 'ask'
  | 'settings'
  | 'games'
  | 'analysis'
  | 'soft';

export function worldForPath(pathname: string): WorldKind {
  if (/diary/i.test(pathname)) return 'diary';
  if (/routine/i.test(pathname)) return 'care';
  if (/care|agenda|notifications/i.test(pathname)) return 'care';
  if (/nutrition|foods/i.test(pathname)) return 'pantry';
  if (/rocky|dogs/i.test(pathname)) return 'profile';
  if (/social|around/i.test(pathname)) return 'social';
  if (/ask|help|aiuto/i.test(pathname)) return 'ask';
  if (/settings|paywall/i.test(pathname)) return 'settings';
  if (/games/i.test(pathname)) return 'games';
  if (/behavior|digestive|processing|capture/i.test(pathname)) return 'analysis';
  return 'soft';
}

const BAND = 240;

/** Colore "cielo" in cima alla banda per mondo (sfuma nel fondo pagina). */
const SKY: Record<WorldKind, string> = {
  diary: colors.blueMist,
  care: colors.coralSoft,
  pantry: colors.amberPale,
  profile: colors.bluePale,
  social: colors.tealMist,
  ask: colors.blueMist,
  settings: colors.bluePale,
  games: colors.bluePale,
  analysis: colors.blueMist,
  soft: colors.bluePale,
};

const HILL_BACK = '#A9DCCF';
const HILL_FRONT = '#74C4A9';
const NAVY = colors.text;

function Hills() {
  return (
    <>
      <Path
        d={`M0 ${BAND - 46} C120 ${BAND - 78} 220 ${BAND - 40} 400 ${BAND - 64} L400 ${BAND} L0 ${BAND} Z`}
        fill={HILL_BACK}
      />
      <Path
        d={`M0 ${BAND - 20} C140 ${BAND - 44} 280 ${BAND - 8} 400 ${BAND - 30} L400 ${BAND} L0 ${BAND} Z`}
        fill={HILL_FRONT}
      />
    </>
  );
}

function Sun({ cx = 316, cy = 40, r = 22, fill = colors.amber, opacity = 0.85 }: { cx?: number; cy?: number; r?: number; fill?: string; opacity?: number }) {
  return (
    <>
      <Circle cx={cx} cy={cy} r={r + 12} fill={fill} opacity={opacity * 0.3} />
      <Circle cx={cx} cy={cy} r={r} fill={fill} opacity={opacity} />
    </>
  );
}

function CloudShape({ cx, cy, scale = 1, opacity = 0.9 }: { cx: number; cy: number; scale?: number; opacity?: number }) {
  return (
    <G transform={`translate(${cx} ${cy}) scale(${scale})`} opacity={opacity}>
      <Rect x={-26} y={-4} width={52} height={16} rx={8} fill="#FFFFFF" />
      <Circle cx={-10} cy={-8} r={11} fill="#FFFFFF" />
      <Circle cx={8} cy={-12} r={13} fill="#FFFFFF" />
    </G>
  );
}

/** Nuvoletta che deriva lenta (unica micro-animazione ammessa). */
function DriftingCloud({ reducedMotion }: { reducedMotion: boolean }) {
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    drift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 13000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 13000, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [reducedMotion, drift]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: drift.value * 34 - 17 }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.cloud, style]}>
      <Svg width={92} height={40} viewBox="0 0 92 40">
        <CloudShape cx={46} cy={22} scale={1.1} opacity={0.95} />
      </Svg>
    </Animated.View>
  );
}

function PawPrint({ cx, cy, scale = 1, color = colors.accent, opacity = 0.55 }: { cx: number; cy: number; scale?: number; color?: string; opacity?: number }) {
  return (
    <G transform={`translate(${cx} ${cy}) scale(${scale})`} opacity={opacity}>
      <Ellipse cx={0} cy={9} rx={9} ry={7.4} fill={color} />
      <Circle cx={-12} cy={-2} r={3.8} fill={color} />
      <Circle cx={-4.5} cy={-8} r={3.8} fill={color} />
      <Circle cx={4.5} cy={-8} r={3.8} fill={color} />
      <Circle cx={12} cy={-2} r={3.8} fill={color} />
    </G>
  );
}

function Polaroid({ x, y, rotate, accent, size = 58 }: { x: number; y: number; rotate: number; accent: string; size?: number }) {
  const h = size * 1.16;
  return (
    <G transform={`rotate(${rotate} ${x + size / 2} ${y + h / 2})`}>
      <Rect x={x} y={y} width={size} height={h} rx={5} fill="#FFFFFF" stroke={NAVY} strokeWidth={1.6} />
      <Rect x={x + 6} y={y + 6} width={size - 12} height={size * 0.62} rx={3} fill={accent} />
    </G>
  );
}

function Balloon({ cx, cy, color, string = 34 }: { cx: number; cy: number; color: string; string?: number }) {
  return (
    <>
      <Path d={`M${cx} ${cy + 16} q-2 ${string / 2} 0 ${string}`} stroke={NAVY} strokeWidth={1.2} fill="none" opacity={0.4} />
      <Ellipse cx={cx} cy={cy} rx={13} ry={15.5} fill={color} />
      <Path d={`M${cx - 3} ${cy + 14} l3 3 l3 -3 Z`} fill={color} />
    </>
  );
}

function ConfettiDots() {
  return (
    <>
      <Rect x={36} y={26} width={7} height={7} rx={2} fill={colors.accent} transform="rotate(20 39 29)" />
      <Rect x={352} y={20} width={7} height={7} rx={2} fill={colors.amber} transform="rotate(-18 355 23)" />
      <Circle cx={60} cy={14} r={3} fill={colors.coral} />
      <Circle cx={330} cy={44} r={3} fill={colors.primary} />
      <Path d="M28 46 q4 -6 8 0" stroke={colors.accent} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      <Path d="M366 40 q5 -6 9 -1" stroke={colors.amber} strokeWidth={2.4} strokeLinecap="round" fill="none" />
    </>
  );
}

function WorldScene({ world, accent }: { world: WorldKind; accent?: string }) {
  const profileAccent = accent ?? colors.coral;

  switch (world) {
    case 'profile':
      return (
        <>
          <Sun cx={330} cy={38} fill={profileAccent} opacity={0.7} />
          <Hills />
          <Polaroid x={44} y={BAND - 128} rotate={-7} accent={profileAccent} />
          <PawPrint cx={300} cy={BAND - 52} scale={2.1} color={profileAccent} opacity={0.5} />
          <PawPrint cx={246} cy={BAND - 20} scale={1.2} color={colors.accent} opacity={0.45} />
        </>
      );
    case 'social':
      return (
        <>
          <Hills />
          <Balloon cx={96} cy={BAND - 112} color={colors.accentSoft} />
          <Balloon cx={150} cy={BAND - 138} color={colors.amberPale} string={26} />
          <PawPrint cx={300} cy={BAND - 40} scale={1.6} color={colors.accent} opacity={0.4} />
        </>
      );
    case 'pantry':
      return (
        <>
          <Sun cx={326} cy={36} fill={colors.amber} opacity={0.8} />
          <Rect x={40} y={BAND - 92} width={220} height={7} rx={3.5} fill="#D8B48A" opacity={0.85} />
          <Rect x={58} y={BAND - 122} width={26} height={32} rx={6} fill={colors.primarySoft} stroke={NAVY} strokeWidth={1.4} />
          <Rect x={94} y={BAND - 116} width={22} height={26} rx={5} fill={colors.accentSoft} stroke={NAVY} strokeWidth={1.4} />
          <Rect x={126} y={BAND - 124} width={28} height={34} rx={7} fill={colors.amberPale} stroke={NAVY} strokeWidth={1.4} />
          <Path d={`M288 ${BAND - 44} h46 c2 15 -7 22 -23 22 c-16 0 -25 -7 -23 -22 Z`} fill={colors.accentSoft} stroke={NAVY} strokeWidth={1.6} />
          <PawPrint cx={220} cy={BAND - 18} scale={1.1} color={colors.accent} opacity={0.4} />
        </>
      );
    case 'care':
      return (
        <>
          <Sun cx={326} cy={36} fill={colors.coral} opacity={0.65} />
          <Hills />
          <Rect x={46} y={BAND - 118} width={66} height={58} rx={10} fill="#FFFFFF" stroke={NAVY} strokeWidth={1.8} />
          <Rect x={46} y={BAND - 118} width={66} height={16} rx={10} fill={colors.coralPale} />
          <Circle cx={58} cy={BAND - 122} r={3.4} fill={colors.coral} />
          <Circle cx={98} cy={BAND - 122} r={3.4} fill={colors.coral} />
          <Circle cx={79} cy={BAND - 82} r={5.5} fill={colors.accentSoft} />
          <Circle cx={152} cy={BAND - 86} r={20} fill="#FFFFFF" stroke={NAVY} strokeWidth={1.8} />
          <Path d={`M152 ${BAND - 98} v12 l9 6`} stroke={colors.accent} strokeWidth={3} strokeLinecap="round" fill="none" />
        </>
      );
    case 'games':
      return (
        <>
          <Sun cx={326} cy={36} />
          <ConfettiDots />
          <Hills />
          <PawPrint cx={88} cy={BAND - 34} scale={1.5} color={colors.accent} opacity={0.45} />
        </>
      );
    case 'diary':
      return (
        <>
          <Hills />
          <Polaroid x={50} y={BAND - 122} rotate={-6} accent={colors.primarySoft} />
          <Polaroid x={280} y={BAND - 112} rotate={8} accent={colors.accentSoft} size={50} />
          <Rect x={68} y={BAND - 134} width={46} height={14} rx={3} fill={colors.amberPale} transform={`rotate(-14 ${91} ${BAND - 127})`} />
          <PawPrint cx={210} cy={BAND - 26} scale={1.3} color={colors.accent} opacity={0.4} />
        </>
      );
    case 'settings':
      return (
        <>
          <Sun cx={326} cy={36} fill={colors.primaryBright} opacity={0.6} />
          <Hills />
          <Circle cx={96} cy={BAND - 84} r={26} fill={colors.lavenderPale} stroke={NAVY} strokeWidth={1.6} />
          <Circle cx={96} cy={BAND - 84} r={9} fill={colors.primarySoft} stroke={NAVY} strokeWidth={1.6} />
        </>
      );
    case 'ask':
      return (
        <>
          <Hills />
          <Rect x={56} y={BAND - 116} width={92} height={48} rx={20} fill="#FFFFFF" stroke={NAVY} strokeWidth={1.6} />
          <Circle cx={84} cy={BAND - 62} r={6.5} fill="#FFFFFF" stroke={NAVY} strokeWidth={1.4} />
          <Rect x={240} y={BAND - 92} width={76} height={40} rx={18} fill={colors.primarySoft} stroke={NAVY} strokeWidth={1.6} />
          <Circle cx={308} cy={BAND - 44} r={5.5} fill={colors.primarySoft} stroke={NAVY} strokeWidth={1.4} />
          <Circle cx={80} cy={BAND - 100} r={2.6} fill={colors.iconMuted} />
          <Circle cx={102} cy={BAND - 100} r={2.6} fill={colors.iconMuted} />
          <Circle cx={124} cy={BAND - 100} r={2.6} fill={colors.iconMuted} />
        </>
      );
    case 'analysis':
      return (
        <>
          <Sun cx={326} cy={36} fill={colors.primaryBright} opacity={0.6} />
          <Hills />
          <Path d={`M44 ${BAND - 60} C84 ${BAND - 92} 132 ${BAND - 36} 184 ${BAND - 68} S300 ${BAND - 74} 368 ${BAND - 42}`} stroke={colors.accentSoft} strokeWidth={7} strokeLinecap="round" fill="none" />
          <PawPrint cx={300} cy={BAND - 96} scale={1.2} color={colors.accent} opacity={0.45} />
        </>
      );
    default:
      return (
        <>
          <Sun cx={326} cy={36} />
          <Hills />
          <PawPrint cx={96} cy={BAND - 40} scale={1.4} color={colors.accent} opacity={0.4} />
        </>
      );
  }
}

export function WorldBackdrop({ world, accent }: { world: WorldKind; accent?: string }) {
  const reducedMotion = useReducedMotion();
  return (
    <View pointerEvents="none" style={styles.layer} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <LinearGradient
        colors={[SKY[world], 'rgba(255,255,255,0)']}
        locations={[0, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg width="100%" height={BAND} viewBox={`0 0 400 ${BAND}`} preserveAspectRatio="xMidYMax slice">
        <WorldScene world={world} accent={accent} />
      </Svg>
      <DriftingCloud reducedMotion={reducedMotion} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: BAND,
  },
  cloud: {
    position: 'absolute',
    top: 18,
    left: '38%',
    opacity: 0.9,
  },
});
