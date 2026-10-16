import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';

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

function Leaf({ x, y, color, rotate }: { x: number; y: number; color: string; rotate: number }) {
  return (
    <Ellipse
      cx={x}
      cy={y}
      rx={8}
      ry={3.5}
      fill={color}
      opacity={0.32}
      transform={`rotate(${rotate} ${x} ${y})`}
    />
  );
}

function worldForPath(pathname: string): WorldKind {
  if (/diary/i.test(pathname)) return 'diary';
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

export function WorldBackdrop({ world, accent }: { world: WorldKind; accent?: string }) {
  const month = new Date().getMonth();
  const autumn = month >= 8 && month <= 10;
  const winter = month === 11 || month <= 1;
  const profileAccent = accent ?? '#D59A64';

  return (
    <View pointerEvents="none" style={styles.layer} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="none">
        <Circle cx={348} cy={-24} r={118} fill={world === 'care' ? '#FFB7A9' : '#BDEFE7'} opacity={0.24} />
        <Ellipse cx={42} cy={86} rx={112} ry={72} fill={world === 'pantry' ? '#F9D88A' : '#CDE4FF'} opacity={0.22} />

        {world === 'diary' ? (
          <>
            <Rect x={18} y={132} width={102} height={78} rx={8} fill="#FFFFFF" opacity={0.46} transform="rotate(-6 18 132)" />
            <Rect x={34} y={144} width={72} height={4} rx={2} fill="#FFB8A8" opacity={0.5} transform="rotate(-6 34 144)" />
            <Rect x={74} y={108} width={84} height={13} rx={3} fill="#F2DCA0" opacity={0.42} transform="rotate(8 74 108)" />
            <Rect x={274} y={188} width={98} height={74} rx={8} fill="#FFFFFF" opacity={0.42} transform="rotate(7 274 188)" />
            <Circle cx={323} cy={220} r={20} fill="#D7EEE7" opacity={0.7} />
          </>
        ) : null}

        {world === 'care' ? (
          <>
            <Rect x={270} y={110} width={78} height={72} rx={14} fill="#FFFFFF" opacity={0.48} />
            <Line x1={270} y1={136} x2={348} y2={136} stroke="#7AC9C1" strokeWidth={3} opacity={0.45} />
            <Line x1={288} y1={102} x2={288} y2={120} stroke="#7AC9C1" strokeWidth={5} strokeLinecap="round" opacity={0.45} />
            <Line x1={330} y1={102} x2={330} y2={120} stroke="#7AC9C1" strokeWidth={5} strokeLinecap="round" opacity={0.45} />
            <Circle cx={312} cy={160} r={8} fill="#FFB7A9" opacity={0.58} />
            <Circle cx={333} cy={160} r={8} fill="#BDEFE7" opacity={0.75} />
          </>
        ) : null}

        {world === 'pantry' ? (
          <>
            <Path d="M0 172 H400 M0 218 H400" stroke="#E8B765" strokeWidth={5} opacity={0.18} />
            <Rect x={28} y={126} width={42} height={42} rx={10} fill="#FFE2A8" opacity={0.38} />
            <Rect x={86} y={132} width={38} height={36} rx={12} fill="#B9E8D1" opacity={0.42} />
            <Rect x={306} y={130} width={48} height={38} rx={12} fill="#FFB7A9" opacity={0.36} />
            <Circle cx={48} cy={116} r={10} fill="#F5C95B" opacity={0.46} />
          </>
        ) : null}

        {world === 'profile' ? (
          <>
            <Circle cx={316} cy={130} r={72} fill={profileAccent} opacity={0.22} />
            <Ellipse cx={274} cy={202} rx={142} ry={54} fill={profileAccent} opacity={0.15} />
            <Path d="M40 222 C112 184 182 212 246 190 C302 171 350 185 400 166" stroke={profileAccent} strokeWidth={3} opacity={0.3} fill="none" />
            <Circle cx={72} cy={266} r={18} fill="#FFFFFF" opacity={0.58} />
            <Path d="M61 266 C64 256 80 256 83 266 C80 276 64 276 61 266 Z" fill={profileAccent} opacity={0.42} />
            <Path d="M336 248 C342 238 353 238 359 248 C365 238 376 238 382 248 C382 260 359 273 359 273 C359 273 336 260 336 248 Z" fill={profileAccent} opacity={0.16} />
          </>
        ) : null}

        {world === 'social' ? (
          <>
            <Circle cx={350} cy={118} r={54} fill="#F6C94C" opacity={0.2} />
            <Path d="M0 184 C75 150 126 198 196 168 C268 138 319 178 400 146 V250 H0 Z" fill="#BDEFE7" opacity={0.23} />
          </>
        ) : null}

        {world === 'ask' ? (
          <>
            <Rect x={258} y={122} width={102} height={58} rx={24} fill="#FFFFFF" opacity={0.38} />
            <Circle cx={279} cy={185} r={7} fill="#FFFFFF" opacity={0.38} />
            <Rect x={42} y={208} width={82} height={48} rx={20} fill="#D8EEFF" opacity={0.28} />
            <Circle cx={116} cy={258} r={6} fill="#D8EEFF" opacity={0.28} />
          </>
        ) : null}

        {world === 'settings' ? (
          <>
            <Circle cx={326} cy={144} r={44} fill="#DDE5FF" opacity={0.32} />
            <Circle cx={326} cy={144} r={18} fill="#FFFFFF" opacity={0.48} />
            <Circle cx={326} cy={144} r={7} fill="#8FA8EA" opacity={0.42} />
            <Circle cx={82} cy={190} r={32} fill="#D7EEE7" opacity={0.28} />
          </>
        ) : null}

        {world === 'games' ? (
          <>
            <Path d="M0 190 C70 160 132 204 208 176 C282 148 342 188 400 164 V260 H0 Z" fill="#B9E8D1" opacity={0.26} />
            <Circle cx={324} cy={106} r={32} fill="#F6C94C" opacity={0.24} />
          </>
        ) : null}

        {world === 'analysis' ? (
          <>
            <Circle cx={324} cy={136} r={58} fill="#DDE5FF" opacity={0.28} />
            <Path d="M36 196 C84 164 132 220 184 188 S298 182 368 214" stroke="#8ED7CD" strokeWidth={7} strokeLinecap="round" opacity={0.24} fill="none" />
          </>
        ) : null}

        {autumn ? (
          <>
            <Leaf x={56} y={292} color="#E8A45C" rotate={22} />
            <Leaf x={344} y={324} color="#D9796C" rotate={-28} />
            <Leaf x={210} y={94} color="#E8A45C" rotate={-42} />
          </>
        ) : null}
        {winter ? (
          <>
            <Circle cx={70} cy={310} r={3} fill="#FFFFFF" opacity={0.65} />
            <Circle cx={330} cy={286} r={4} fill="#FFFFFF" opacity={0.62} />
            <Circle cx={218} cy={118} r={3} fill="#FFFFFF" opacity={0.65} />
          </>
        ) : null}
      </Svg>
    </View>
  );
}

export { worldForPath };

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.9,
  },
});

