/**
 * Tessere di "Bau Match": 5 pezzi kawaii duotone (osso, pallina, ciotola,
 * biscotto, zampina) nello stile del set SquirrelArt/CuteIcon.
 */
import React from 'react';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { colors } from '../../theme/tokens';

const NAVY = colors.text;

export function MatchPiece({ type, size }: { type: number; size: number }) {
  switch (type % 5) {
    case 0:
      // osso
      return (
        <Svg width={size} height={size} viewBox="0 0 48 48">
          <Path
            d="M12 16 C8 11 1 15 4 21 C0 26 7 31 12 26 L22 26 L22 22 L26 22 L26 12 C31 7 26 0 21 4 C15 1 11 8 16 12 Z"
            transform="rotate(45 24 24)"
            fill="#FFF6EC"
            stroke={NAVY}
            strokeWidth={2.6}
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 1:
      // pallina
      return (
        <Svg width={size} height={size} viewBox="0 0 48 48">
          <Circle cx={24} cy={24} r={15} fill={colors.primarySoft} stroke={NAVY} strokeWidth={2.6} />
          <Path
            d="M10 20 C16 26 32 26 38 20 M10 28 C16 22 32 22 38 28"
            stroke={colors.primary}
            strokeWidth={2.6}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
      );
    case 2:
      // ciotola
      return (
        <Svg width={size} height={size} viewBox="0 0 48 48">
          <Path
            d="M10 20 h28 c1 12 -5 18 -14 18 c-9 0 -15 -6 -14 -18 Z"
            fill={colors.accentSoft}
            stroke={NAVY}
            strokeWidth={2.6}
            strokeLinejoin="round"
          />
          <Path d="M8 20 h32" stroke={NAVY} strokeWidth={2.6} strokeLinecap="round" />
          <Ellipse cx={24} cy={16} rx={7} ry={3.4} fill="#FFF6EC" stroke={NAVY} strokeWidth={2} />
        </Svg>
      );
    case 3:
      // biscotto
      return (
        <Svg width={size} height={size} viewBox="0 0 48 48">
          <Circle cx={24} cy={24} r={15} fill="#F5D9A8" stroke={NAVY} strokeWidth={2.6} />
          <Circle cx={18} cy={19} r={2.2} fill={NAVY} />
          <Circle cx={29} cy={22} r={2.2} fill={NAVY} />
          <Circle cx={21} cy={30} r={2.2} fill={NAVY} />
          <Circle cx={30} cy={31} r={1.8} fill={NAVY} />
        </Svg>
      );
    default:
      // zampina
      return (
        <Svg width={size} height={size} viewBox="0 0 48 48">
          <Ellipse cx={24} cy={29} rx={9} ry={7.4} fill={colors.accent} />
          <Circle cx={12} cy={19} r={3.8} fill={colors.accent} />
          <Circle cx={19} cy={14} r={3.8} fill={colors.accent} />
          <Circle cx={29} cy={14} r={3.8} fill={colors.accent} />
          <Circle cx={36} cy={19} r={3.8} fill={colors.accent} />
          <Ellipse cx={21} cy={28} rx={2} ry={1.4} fill="#FFFFFF" opacity={0.5} />
        </Svg>
      );
  }
}
