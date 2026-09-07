import React from 'react';
import Svg, {
  Circle,
  Ellipse,
  G,
  Path,
  Rect,
} from 'react-native-svg';

import { colors } from '../theme/tokens';

export type DogIllustrationProps = {
  size?: number;
  mood?: 'welcome' | 'thinking' | 'resting';
};

/**
 * Illustrazione vettoriale di marca: calda, leggera e nitida a ogni densità.
 * Non rappresenta una razza specifica e non viene usata come dato del profilo.
 */
export function DogIllustration({
  size = 220,
  mood = 'welcome',
}: DogIllustrationProps) {
  return (
    <Svg
      width={size}
      height={size * 0.7}
      viewBox="0 0 240 168"
      fill="none"
      accessibilityLabel="Illustrazione di un cane"
    >
      <Ellipse cx="118" cy="147" rx="86" ry="11" fill={colors.accentSoft} />
      <Path
        d="M38 135c9-18 20-27 33-28 2 13-2 25-11 36H38v-8Z"
        fill={colors.primarySoft}
      />
      <Path
        d="M190 139c-7-18-5-32 7-42 10 13 14 27 11 42h-18Z"
        fill={colors.primarySoft}
      />

      <Path
        d="M90 68c-23 12-31 35-23 68h83c10-26 2-51-22-68H90Z"
        fill="#FFF9F0"
        stroke={colors.text}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <Path
        d="M68 100c-17-4-28-15-30-31 11 1 20 8 27 20"
        stroke={colors.text}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <Path
        d="M68 100c-10-3-17-8-22-16"
        stroke="#C98255"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <Path
        d="M86 127v18M133 127v18"
        stroke={colors.text}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <Path
        d="M79 145h18M126 145h18"
        stroke={colors.text}
        strokeWidth="5"
        strokeLinecap="round"
      />

      <Circle
        cx="111"
        cy="58"
        r="42"
        fill="#FFF9F0"
        stroke={colors.text}
        strokeWidth="3"
      />
      <Path
        d="M80 33c-13 5-21 17-18 37 2 14 8 24 18 30 9-14 13-31 9-51L80 33Z"
        fill="#C98255"
        stroke={colors.text}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <Path
        d="M137 28c15 4 24 16 24 34 0 15-6 27-18 36-8-16-11-33-6-52V28Z"
        fill="#C98255"
        stroke={colors.text}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <Path
        d="M91 24c8-6 18-9 29-7 7 10 9 22 5 36-17-1-30-11-34-29Z"
        fill="#E9B07B"
      />
      <Circle cx="99" cy="56" r="3.5" fill={colors.text} />
      <Circle cx="127" cy="56" r="3.5" fill={colors.text} />
      <Ellipse cx="113" cy="70" rx="7" ry="5" fill={colors.text} />
      <Path
        d="M113 75c-1 7-8 10-14 7M113 75c1 7 8 10 14 7"
        stroke={colors.text}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <Rect x="82" y="91" width="61" height="9" rx="4.5" fill={colors.accent} />
      <Circle cx="113" cy="100" r="7" fill="#F6C453" />

      {mood === 'welcome' ? (
        <G>
          <Path
            d="M180 47c-8-8-21 3-6 16l6 5 6-5c15-13 2-24-6-16Z"
            fill="#F3A28D"
          />
          <Circle cx="55" cy="45" r="5" fill={colors.accent} opacity="0.75" />
        </G>
      ) : null}
      {mood === 'thinking' ? (
        <G>
          <Circle cx="177" cy="46" r="5" fill={colors.accent} opacity="0.5" />
          <Circle cx="190" cy="32" r="8" fill={colors.accent} opacity="0.35" />
          <Circle cx="207" cy="17" r="11" fill={colors.accent} opacity="0.2" />
        </G>
      ) : null}
      {mood === 'resting' ? (
        <Path
          d="M172 37h16l-16 16h16"
          stroke={colors.primary}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </Svg>
  );
}

export default DogIllustration;
