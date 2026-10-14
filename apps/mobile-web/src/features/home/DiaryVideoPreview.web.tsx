/**
 * Anteprima video web: fotogramma reale via elemento DOM <video>
 * (muted + playsInline: il browser non fa autoplay). Appena noti i
 * metadati si cerca un fotogramma "a camera avviata" (~1.8s o 30% della
 * durata, metà per clip <1s) e si mostra sull'evento seeked — il frame
 * iniziale è spesso scuro/sfuocato. Finché non è pronto — o se la signed
 * URL è scaduta (TTL 600s, onError) — resta il fallback del chiamante.
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
            onLoadedMetadata: (event: { currentTarget: HTMLVideoElement }) => {
              const video = event.currentTarget;
              const duration = video.duration;
              if (Number.isFinite(duration) && duration > 0) {
                video.currentTime =
                  duration < 1 ? duration / 2 : Math.min(1.8, duration * 0.3);
              } else {
                setReady(true);
              }
            },
            onSeeked: () => setReady(true),
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

