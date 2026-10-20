/**
 * Anteprima video nativa: fotogramma via expo-video-thumbnails.
 * - `active=false` → solo fallback (niente download del video).
 * - Cache del frame per media path (senza query firmata) così un rimint
 *   dell’URL non ri-scarica il file.
 */
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { VideoPlayOverlay } from './DiaryMediaCover';
import { mediaCacheKey } from './mediaCacheKey';

const frameCache = new Map<string, string>();

export function DiaryVideoPreview({
  uri,
  fallback,
  active = true,
}: {
  uri: string;
  fallback: React.ReactNode;
  /** When false, do not hit Storage (off-screen list cells). */
  active?: boolean;
}) {
  const cacheKey = mediaCacheKey(uri);
  const [frame, setFrame] = useState<string | null>(
    () => frameCache.get(cacheKey) ?? null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active) return;
    const cached = frameCache.get(cacheKey);
    if (cached) {
      setFrame(cached);
      setFailed(false);
      return;
    }
    let alive = true;
    setFailed(false);
    VideoThumbnails.getThumbnailAsync(uri, { time: 1800 })
      .then(({ uri: thumbnailUri }) => {
        frameCache.set(cacheKey, thumbnailUri);
        if (frameCache.size > 80) {
          const first = frameCache.keys().next().value;
          if (first) frameCache.delete(first);
        }
        if (alive) setFrame(thumbnailUri);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [active, cacheKey, uri]);

  if (!active || !frame || failed) {
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
