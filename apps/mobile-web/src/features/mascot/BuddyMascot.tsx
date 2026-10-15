/**
 * Buddy — la mascotte di Dogly. Cane di marca in SVG flat moderno
 * (Bezier vere, simmetria pulita, riflessi negli occhi, patch teal,
 * naso lucido, blush), 5 espressioni e blink periodico via Reanimated.
 * Il volto del prodotto: telecronista dei giochi e voce del brand.
 */
import React, { useEffect } from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../../theme/tokens';

export type BuddyExpression =
  | 'happy'
  | 'focused'
  | 'celebrate'
  | 'sad'
  | 'neutral';

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

const NAVY = colors.text;
const CREAM = '#FFF6EC';
const CREAM_LIGHT = '#FFFDF8';
const EAR_DARK = '#14385E';
const CORAL = '#FF8B74';

function BuddyEye({
  cx,
  cy,
  r,
  blink,
}: {
  cx: number;
  cy: number;
  r: number;
  blink: SharedValue<number>;
}) {
  const eyeProps = useAnimatedProps(() => ({
    ry: r * (1 - blink.value * 0.94),
    cy: cy + r * blink.value * 0.5,
  }));
  const glintProps = useAnimatedProps(() => ({
    opacity: 1 - blink.value,
  }));
  return (
    <>
      <AnimatedEllipse cx={cx} cy={cy} rx={r} animatedProps={eyeProps} fill={NAVY} />
      <AnimatedCircleHighlight glintProps={glintProps} cx={cx} cy={cy} r={r} />
    </>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function AnimatedCircleHighlight({
  glintProps,
  cx,
  cy,
  r,
}: {
  glintProps: ReturnType<typeof useAnimatedProps>;
  cx: number;
  cy: number;
  r: number;
}) {
  return (
    <AnimatedCircle
      cx={cx - r * 0.32}
      cy={cy - r * 0.34}
      r={r * 0.32}
      animatedProps={glintProps}
      fill="#FFFFFF"
    />
  );
}

/** Orecchio floscio (sinistra) e orecchio su (destra). In `sad` entrambe giù. */
function Ears({ expression }: { expression: BuddyExpression }) {
  const sad = expression === 'sad';
  return (
    <>
      {/* orecchio sinistro: sempre floscio */}
      <Path
        d="M66 64 C58 40 40 32 27 41 C15 52 22 80 39 91 C54 93 68 80 66 64 Z"
        fill={EAR_DARK}
      />
      <Path
        d="M58 66 C53 50 42 45 34 50 C27 57 31 74 42 81 C51 82 60 76 58 66 Z"
        fill={colors.accentSoft}
        opacity={0.55}
      />
      {/* orecchio destro: su, tranne quando è triste */}
      {sad ? (
        <Path
          d="M134 64 C142 40 160 32 173 41 C185 52 178 80 161 91 C146 93 132 80 134 64 Z"
          fill={EAR_DARK}
        />
      ) : (
        <>
          <Path
            d="M134 62 C134 36 147 17 166 16 C182 24 187 46 178 68 C164 76 142 74 134 62 Z"
            fill={EAR_DARK}
          />
          <Path
            d="M142 60 C143 42 152 29 164 27 C174 33 177 48 171 61 C161 66 148 66 142 60 Z"
            fill={colors.accentSoft}
            opacity={0.55}
          />
        </>
      )}
    </>
  );
}

export function BuddyMascot({
  size = 96,
  expression = 'neutral',
  animate = true,
}: {
  size?: number;
  expression?: BuddyExpression;
  /** Blink periodico (rispetta reduce-motion). */
  animate?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const blink = useSharedValue(0);

  useEffect(() => {
    if (!animate || reducedMotion) return;
    blink.value = withRepeat(
      withSequence(
        withDelay(
          2600,
          withTiming(1, { duration: 90, easing: Easing.inOut(Easing.quad) }),
        ),
        withTiming(0, { duration: 120, easing: Easing.inOut(Easing.quad) }),
        withDelay(
          900,
          withTiming(1, { duration: 80, easing: Easing.inOut(Easing.quad) }),
        ),
        withTiming(0, { duration: 110, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [animate, reducedMotion, blink]);

  const openEyes =
    expression === 'happy' ||
    expression === 'focused' ||
    expression === 'neutral';
  const eyeR = expression === 'sad' ? 9.6 : 7.6;
  const eyeY = expression === 'sad' ? 90 : 86;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      accessibilityLabel="Buddy, la mascotte di Dogly"
    >
      {/* ombra sotto la testa */}
      <Ellipse cx={100} cy={166} rx={52} ry={9} fill={NAVY} opacity={0.08} />

      <Ears expression={expression} />

      {/* testa */}
      <Path
        d="M52 92 C52 62 76 46 100 46 C124 46 148 62 148 92 C148 120 136 150 100 154 C64 150 52 120 52 92 Z"
        fill={CREAM}
        stroke={NAVY}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      {/* patch teal sull'occhio sinistro */}
      <Path
        d="M58 82 C61 68 74 60 87 65 C94 74 92 89 81 94 C68 98 55 94 58 82 Z"
        fill={colors.accentSoft}
      />
      {/* muso */}
      <Ellipse cx={100} cy={118} rx={34} ry={26} fill={CREAM_LIGHT} />

      {/* occhi */}
      {openEyes ? (
        <>
          <BuddyEye cx={78} cy={eyeY} r={eyeR} blink={blink} />
          <BuddyEye cx={122} cy={eyeY} r={eyeR} blink={blink} />
        </>
      ) : null}
      {expression === 'celebrate' ? (
        <>
          <Path
            d="M68 88 q10 -10 20 0"
            stroke={NAVY}
            strokeWidth={4}
            strokeLinecap="round"
          />
          <Path
            d="M112 88 q10 -10 20 0"
            stroke={NAVY}
            strokeWidth={4}
            strokeLinecap="round"
          />
        </>
      ) : null}
      {expression === 'sad' ? (
        <>
          <BuddyEye cx={78} cy={eyeY} r={eyeR} blink={blink} />
          <BuddyEye cx={122} cy={eyeY} r={eyeR} blink={blink} />
          <Path
            d="M68 76 q10 -6 18 -2 M114 74 q10 -4 18 2"
            stroke={NAVY}
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.7}
          />
        </>
      ) : null}
      {expression === 'focused' ? (
        <>
          <Path
            d="M66 72 l22 5 M134 72 l-22 5"
            stroke={NAVY}
            strokeWidth={4}
            strokeLinecap="round"
          />
        </>
      ) : null}

      {/* blush */}
      {expression !== 'sad' ? (
        <>
          <Ellipse cx={62} cy={106} rx={7} ry={4.6} fill={colors.accentSoft} opacity={0.7} />
          <Ellipse cx={138} cy={106} rx={7} ry={4.6} fill={colors.accentSoft} opacity={0.7} />
        </>
      ) : null}

      {/* naso lucido */}
      <Path
        d="M88 108 C88 101 112 101 112 108 C112 116 106 122 100 122 C94 122 88 116 88 108 Z"
        fill={NAVY}
      />
      <Ellipse cx={95} cy={106.5} rx={3.2} ry={2.2} fill="#FFFFFF" opacity={0.85} />

      {/* bocca per espressione */}
      {expression === 'happy' || expression === 'celebrate' ? (
        <>
          <Path
            d="M84 124 Q100 140 116 124"
            stroke={NAVY}
            strokeWidth={4}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M93 132 C93 144 96 151 100 151 C104 151 107 144 107 132 C103 136 97 136 93 132 Z"
            fill={CORAL}
          />
        </>
      ) : null}
      {expression === 'neutral' ? (
        <Path
          d="M90 126 Q100 132 110 126"
          stroke={NAVY}
          strokeWidth={3.5}
          strokeLinecap="round"
          fill="none"
        />
      ) : null}
      {expression === 'focused' ? (
        <Path
          d="M92 128 h16"
          stroke={NAVY}
          strokeWidth={3.5}
          strokeLinecap="round"
        />
      ) : null}
      {expression === 'sad' ? (
        <Path
          d="M88 134 Q100 126 112 134"
          stroke={NAVY}
          strokeWidth={3.5}
          strokeLinecap="round"
          fill="none"
        />
      ) : null}

      {/* coriandoli per celebrate */}
      {expression === 'celebrate' ? (
        <G>
          <Rect x={34} y={34} width={7} height={7} rx={2} fill={colors.accent} transform="rotate(20 37 37)" />
          <Rect x={158} y={28} width={7} height={7} rx={2} fill="#F6C94C" transform="rotate(-18 161 31)" />
          <Circle cx={48} cy={20} r={3.4} fill={CORAL} />
          <Circle cx={152} cy={52} r={3.4} fill={colors.primary} />
          <Path d="M28 52 q4 -6 8 0" stroke={colors.accent} strokeWidth={3} strokeLinecap="round" fill="none" />
          <Path d="M166 44 q5 -6 9 -1" stroke="#F6C94C" strokeWidth={3} strokeLinecap="round" fill="none" />
        </G>
      ) : null}
    </Svg>
  );
}
