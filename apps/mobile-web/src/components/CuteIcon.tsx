/**
 * CuteIcon — set di icone disegnate a mano in SVG per Dogly.
 * Stile: forme morbide e arrotondate, due toni (teal accent + navy text)
 * ripresi dal marchio. Usate per evidence semantiche ("Perché?") e per
 * l'hero del risultato per-intent, al posto delle icone generiche Ionicons.
 */
import React from 'react';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';
import { colors } from '../theme/tokens';

export const CUTE_ICON_NAMES = [
  // evidence semantiche
  'paw',
  'tail',
  'ear',
  'voice',
  'movement',
  'gaze',
  'breath',
  'home',
  'clock',
  'pattern',
  // hero per-intent
  'play',
  'attention',
  'door',
  'alert',
  'cloud',
  'bolt',
  'frustration',
  'moon',
  'bowl',
  'question',
  'search',
] as const;

export type CuteIconName = (typeof CUTE_ICON_NAMES)[number];

export type CuteIconProps = {
  name: CuteIconName;
  size?: number;
  /** Tono principale (default teal accent). */
  color?: string;
  /** Tono secondario (default navy text). */
  secondary?: string;
};

export function CuteIcon({
  name,
  size = 20,
  color = colors.accent,
  secondary = colors.text,
}: CuteIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {renderGlyph(name, color, secondary)}
    </Svg>
  );
}

function renderGlyph(
  name: CuteIconName,
  color: string,
  secondary: string,
): React.ReactNode {
  switch (name) {
    /* ---------------- Evidence semantiche ---------------- */
    case 'paw':
      return (
        <>
          <Ellipse cx={12} cy={15.5} rx={4.2} ry={3.4} fill={color} />
          <Circle cx={6.4} cy={10} r={1.8} fill={color} />
          <Circle cx={9.8} cy={7.3} r={1.8} fill={color} />
          <Circle cx={14.2} cy={7.3} r={1.8} fill={color} />
          <Circle cx={17.6} cy={10} r={1.8} fill={color} />
        </>
      );
    case 'tail':
      return (
        <>
          <Path
            d="M7 20 C6 13 9 8 15 6"
            stroke={secondary}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <Circle cx={16} cy={5.6} r={2.4} fill={color} />
          <Path
            d="M19.5 8.5 q2.5 2.2 2.3 5"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <Path
            d="M4.5 9 q-2 2.5 -1.4 5"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </>
      );
    case 'ear':
      return (
        <>
          <Path
            d="M9.5 3.5 C5.5 7.5 5 13.5 7.5 19.5 C11.5 17.5 13.5 10.5 9.5 3.5 Z"
            fill={secondary}
          />
          <Path
            d="M9.8 7.5 C8.3 10.5 8.3 14 9.6 16.8"
            stroke={color}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </>
      );
    case 'voice':
      // onde sonore arrotondate, eco delle onde del marchio
      return (
        <>
          <Rect x={3.4} y={9} width={2.8} height={6} rx={1.4} fill={color} />
          <Rect x={8.6} y={6} width={2.8} height={12} rx={1.4} fill={color} />
          <Rect x={13.8} y={3.5} width={2.8} height={17} rx={1.4} fill={color} />
          <Rect x={19} y={8} width={2.8} height={8} rx={1.4} fill={color} />
        </>
      );
    case 'movement':
      return (
        <>
          <Path
            d="M8 12 h8"
            stroke={secondary}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <Path
            d="M13 7.5 L17.5 12 L13 16.5"
            stroke={secondary}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Line x1={3} y1={8} x2={5.5} y2={8} stroke={color} strokeWidth={2} strokeLinecap="round" />
          <Line x1={2.5} y1={16} x2={5} y2={16} stroke={color} strokeWidth={2} strokeLinecap="round" />
        </>
      );
    case 'gaze':
      return (
        <>
          <Ellipse cx={8} cy={12} rx={3} ry={3.6} stroke={secondary} strokeWidth={1.8} />
          <Ellipse cx={16} cy={12} rx={3} ry={3.6} stroke={secondary} strokeWidth={1.8} />
          <Circle cx={8.9} cy={12.6} r={1.3} fill={color} />
          <Circle cx={16.9} cy={12.6} r={1.3} fill={color} />
        </>
      );
    case 'breath':
      return (
        <>
          <Path
            d="M3.5 8.5 h6.5 a2.3 2.3 0 1 0 -2.3 -2.3"
            stroke={color}
            strokeWidth={1.9}
            strokeLinecap="round"
          />
          <Path
            d="M3.5 12.5 h10.5 a2.3 2.3 0 1 1 -2.3 2.3"
            stroke={secondary}
            strokeWidth={1.9}
            strokeLinecap="round"
          />
          <Path
            d="M3.5 16.5 h5"
            stroke={color}
            strokeWidth={1.9}
            strokeLinecap="round"
          />
        </>
      );
    case 'home':
      return (
        <>
          <Path
            d="M4.5 11 L12 4.5 L19.5 11"
            stroke={secondary}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M6.5 9.8 V19 h11 V9.8"
            stroke={secondary}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Rect x={10.5} y={14} width={3} height={5} rx={1} fill={color} />
        </>
      );
    case 'clock':
      return (
        <>
          <Circle cx={12} cy={12} r={8} stroke={secondary} strokeWidth={2} />
          <Path
            d="M12 7.5 V12 L15.5 14"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case 'pattern':
      return (
        <>
          <Path
            d="M11 4 C11.7 7.5 13 8.8 16.5 9.5 C13 10.2 11.7 11.5 11 15 C10.3 11.5 9 10.2 5.5 9.5 C9 8.8 10.3 7.5 11 4 Z"
            fill={color}
          />
          <Path
            d="M17.5 13 C17.9 14.8 18.7 15.6 20.5 16 C18.7 16.4 17.9 17.2 17.5 19 C17.1 17.2 16.3 16.4 14.5 16 C16.3 15.6 17.1 14.8 17.5 13 Z"
            fill={secondary}
          />
        </>
      );

    /* ---------------- Hero per-intent ---------------- */
    case 'play':
      return (
        <>
          <Circle cx={12} cy={12} r={7.5} fill={color} />
          <Path
            d="M6 7.5 C9 10 9 14 6 16.5"
            stroke={colors.surface}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <Path
            d="M18 7.5 C15 10 15 14 18 16.5"
            stroke={colors.surface}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </>
      );
    case 'attention':
      return (
        <Path
          d="M12 20 C6 15.5 3.5 12 3.5 8.8 C3.5 6 5.6 4 8.2 4 C9.9 4 11.2 4.9 12 6.2 C12.8 4.9 14.1 4 15.8 4 C18.4 4 20.5 6 20.5 8.8 C20.5 12 18 15.5 12 20 Z"
          fill={color}
        />
      );
    case 'door':
      return (
        <>
          <Rect
            x={6.5}
            y={3.5}
            width={9}
            height={17}
            rx={1.5}
            stroke={secondary}
            strokeWidth={2}
          />
          <Circle cx={13.5} cy={12} r={1} fill={color} />
          <Path
            d="M16.8 12 h4.7 m0 0 l-2 -2 m2 2 l-2 2"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case 'alert':
      return (
        <>
          <Path d="M4.5 19 L7.5 5 L12 16 Z" fill={secondary} />
          <Path d="M19.5 19 L16.5 5 L12 16 Z" fill={secondary} />
          <Circle cx={12} cy={19.2} r={1.4} fill={color} />
        </>
      );
    case 'cloud':
      return (
        <Path
          d="M7 18 a4 4 0 0 1 -0.6 -7.9 A5.5 5.5 0 0 1 17 8.6 A4.2 4.2 0 0 1 17.5 18 Z"
          fill={color}
        />
      );
    case 'bolt':
      return (
        <Path
          d="M13 3 L5.5 13.5 H11 L9.5 21 L18 10 H12.5 Z"
          fill={color}
          strokeLinejoin="round"
        />
      );
    case 'frustration':
      return (
        <>
          <Path
            d="M3.5 14 L7 9.5 L10.5 14 L14 9.5 L17.5 14 L20.5 9.5"
            stroke={color}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={7} cy={18.5} r={1.2} fill={secondary} />
          <Circle cx={12} cy={18.5} r={1.2} fill={secondary} />
          <Circle cx={17} cy={18.5} r={1.2} fill={secondary} />
        </>
      );
    case 'moon':
      return (
        <>
          <Path
            d="M19.5 14.5 A8 8 0 1 1 9.5 4.3 A6.6 6.6 0 0 0 19.5 14.5 Z"
            fill={secondary}
          />
          <Path
            d="M15.3 4.3 h3.2 l-3.2 3.4 h3.2"
            stroke={color}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M19.2 10 h2.2 l-2.2 2.4 h2.2"
            stroke={color}
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case 'bowl':
      return (
        <>
          <Path d="M4 12.5 h16 a8 6.5 0 0 1 -16 0 Z" fill={color} />
          <Circle cx={9} cy={8.5} r={1.4} fill={secondary} />
          <Circle cx={12.5} cy={6.3} r={1.4} fill={secondary} />
          <Circle cx={15.5} cy={8.8} r={1.4} fill={secondary} />
        </>
      );
    case 'question':
      return (
        <>
          <Path
            d="M9.2 9 a2.8 2.8 0 1 1 4.2 2.4 c-1 0.6 -1.4 1.2 -1.4 2.3"
            stroke={secondary}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <Circle cx={12} cy={17} r={1.5} fill={color} />
        </>
      );
    case 'search':
      return (
        <>
          <Circle cx={11} cy={11} r={6.2} stroke={secondary} strokeWidth={2.2} />
          <Line
            x1={15.6}
            y1={15.6}
            x2={20}
            y2={20}
            stroke={secondary}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <Circle cx={11} cy={11} r={1.6} fill={color} />
        </>
      );
  }
}
