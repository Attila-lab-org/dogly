/**
 * Anteprima video nativa: primo fotogramma reale via expo-video-thumbnails
 * (getThumbnailAsync sulla signed URL). In caricamento e su errore (URL
 * scaduta, TTL 600s) resta il fallback teal passato dal chiamante.
 */
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { VideoPlayOverlay } from './DiaryMediaCover';

export function DiaryVideoPreview({
  uri,
  fallback,
}: {
  uri: string;
  fallback: React.ReactNode;
}) {
  const [frame, setFrame] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFrame(null);
    setFailed(false);
    VideoThumbnails.getThumbnailAsync(uri, { time: 1800 })
      .then(({ uri: thumbnailUri }) => {
        if (alive) setFrame(thumbnailUri);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [uri]);

  if (!frame || failed) {
    return <>{fallback}</>;
  }

  return (
    <View style={styles.wrap}>
      <Image
        source={{ uri: frame }}
        style={styles.frame}
        accessibilityLabel="Video del momento"
        onError={() => setFailed(true)}
      />
      <VideoPlayOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', height: '100%' },
  frame: { width: '100%', height: '100%', resizeMode: 'cover' },
});
