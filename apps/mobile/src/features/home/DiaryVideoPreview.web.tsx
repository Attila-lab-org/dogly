/**
 * Anteprima video web: primo fotogramma reale via elemento DOM <video>
 * (muted + playsInline + preload="metadata": il browser mostra il primo
 * frame senza autoplay). Finché non è pronto — o se la signed URL è
 * scaduta (TTL 600s, onError) — resta il fallback teal del chiamante.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
// @ts-expect-error API non tipizzata ma stabile in react-native-web
import { unstable_createElement } from 'react-native-web';
import { VideoPlayOverlay } from './DiaryMediaCover';

export function DiaryVideoPreview({
  uri,
  fallback,
}: {
  uri: string;
  fallback: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <View style={styles.wrap}>
      {failed ? null : (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {unstable_createElement('video', {
            src: uri,
            muted: true,
            playsInline: true,
            preload: 'metadata',
            'aria-hidden': true,
            onLoadedData: () => setReady(true),
            onError: () => setFailed(true),
            style: {
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: ready ? 1 : 0,
            },
          })}
        </View>
      )}
      {(!ready || failed) && fallback}
      {ready && !failed ? <VideoPlayOverlay /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', height: '100%', overflow: 'hidden' },
});
