import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
import { buildRoutePath, type WalkPoint } from './tracking';


/** Scenografia soft quando il GPS non ha registrato il percorso. */
function SoftTrailScene() {
  return (
    <>
      <Path d="M0 118 C60 96 110 128 170 112 S290 80 360 108 L360 190 L0 190 Z" fill="#DFF3EC" />
      <Path d="M0 150 C70 132 130 160 200 146 S310 128 360 146 L360 190 L0 190 Z" fill="#C9E8DA" />
      <Path d="M58 78 q9 -14 24 -8 q14 6 10 22 q-10 12 -22 6 q-14 -6 -12 -20 Z" fill="#9CD2C2" />
      <Circle cx={66} cy={74} r={3} fill="#FFFDF8" />
      <Path d="M120 64 q7 -11 19 -6 q11 5 8 17 q-8 10 -18 5 q-11 -5 -9 -16 Z" fill="#AEDCCB" />
      <Circle cx={126} cy={61} r={2.4} fill="#FFFDF8" />
      <Path d="M236 96 q9 -14 24 -8 q14 6 10 22 q-10 12 -22 6 q-14 -6 -12 -20 Z" fill="#9CD2C2" />
      <Circle cx={244} cy={92} r={3} fill="#FFFDF8" />
      <Circle cx={86} cy={104} r={4} fill="#8FCBB9" />
      <Circle cx={100} cy={116} r={4} fill="#8FCBB9" />
      <Circle cx={186} cy={88} r={4} fill="#8FCBB9" />
      <Circle cx={200} cy={100} r={4} fill="#8FCBB9" />
    </>
  );
}

export function WalkRouteArt({ points, compact = false }: { points: WalkPoint[]; compact?: boolean }) {
  const path = buildRoutePath(points);
  return <View style={[styles.scene, compact && styles.sceneCompact]} accessibilityLabel={path ? 'Il percorso della passeggiata' : 'Percorso non registrato'}>
    <Svg width="100%" height="100%" viewBox="0 0 360 190">
      <Ellipse cx="295" cy="36" rx="108" ry="66" fill="#CFEADF" />
      <Ellipse cx="35" cy="180" rx="110" ry="85" fill="#D7EAF5" />
      <Path d="M-10 80 Q90 10 180 80 T380 65" stroke="#FFF" strokeWidth="22" fill="none" opacity=".6" />
      {path ? <><Path d={path} stroke="#FFF" strokeWidth="12" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Path d={path} stroke="#079B83" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></> : null}
    </Svg>
    {!path ? <SoftTrailScene /> : null}
  </View>;
}
const styles = StyleSheet.create({
  mini: { width: 84, height: 52, borderRadius: 14, backgroundColor: '#ECF7F1', overflow: 'hidden' },
  scene: { height: 180, backgroundColor: '#ECF7F1', overflow: 'hidden', borderRadius: 22 },
  sceneCompact: { height: 104, borderRadius: 16 },
});

/** Mini-mappa del tracciato per le righe dello storico (solo linea su soft). */
export function WalkRouteMini({ points }: { points: WalkPoint[] }) {
  const path = buildRoutePath(points, 84, 52);
  return (
    <View style={styles.mini} accessibilityLabel={path ? 'Tracciato della passeggiata' : 'Prato senza tracciato'}>
      <Svg width={84} height={52} viewBox="0 0 84 52">
        {path ? (
          <>
            <Ellipse cx={66} cy={10} rx={30} ry={18} fill="#CFEADF" />
            <Ellipse cx={14} cy={48} rx={28} ry={20} fill="#D7EAF5" />
            <Path d={path} stroke="#FFF" strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Path d={path} stroke="#079B83" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <>
            <Ellipse cx={42} cy={44} rx={44} ry={18} fill="#DFF3EC" />
            <Ellipse cx={18} cy={30} rx={18} ry={14} fill="#E7F5F0" />
            <Path d="M36 22 q6 -9 15 -5 q9 4 7 14 q-6 8 -14 4 q-9 -4 -8 -13 Z" fill="#9CD2C2" />
          </>
        )}
      </Svg>
    </View>
  );
}
