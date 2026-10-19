import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Ellipse, Path } from 'react-native-svg';
import { buildRoutePath, type WalkPoint } from './tracking';

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
    {!path ? <Text style={styles.note}>Ricordo pronto</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  scene: { height: 180, backgroundColor: '#ECF7F1', overflow: 'hidden', borderRadius: 22 },
  sceneCompact: { height: 104, borderRadius: 16 },
  note: { position: 'absolute', bottom: 16, left: 16, right: 16, color: '#526E68', fontSize: 12 },
});
