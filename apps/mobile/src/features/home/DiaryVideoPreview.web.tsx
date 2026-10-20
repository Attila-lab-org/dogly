/**
 * Anteprima video web. Con `active=false` non monta <video> (niente egress).
 * Dopo il primo seek, cattura un frame in cache (mediaCacheKey) e smonta il
 * video così remount/scroll non ri-scaricano i byte.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
// @ts-expect-error API non tipizzata ma stabile in react-native-web
import { unstable_createElement } from 'react-native-web';
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
  active?: boolean;
}) {
  const cacheKey = mediaCacheKey(uri);
  const [frame, setFrame] = useState<string | null>(
    () => frameCache.get(cacheKey) ?? null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const cached = frameCache.get(cacheKey);
    if (cached) {
      setFrame(cached);
      setFailed(false);
    }
  }, [cacheKey, active]);

  if (!active) {
    return <>{fallback}</>;
  }

  if (frame && !failed) {
    return (
      <View style={styles.wrap}>
        <Image
          source={{ uri: frame, cacheKey }}
          style={styles.frame}
          contentFit="cover"
          accessibilityLabel="Video del momento"
          onError={() => setFailed(true)}
        />
        <VideoPlayOverlay />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
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
            }
          },
          onSeeked: (event: { currentTarget: HTMLVideoElement }) => {
            const video = event.currentTarget;
            try {
              const canvas = document.createElement('canvas');
              const w = video.videoWidth || 320;
              const h = video.videoHeight || 180;
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                setFailed(true);
                return;
              }
              ctx.drawImage(video, 0, 0, w, h);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
              frameCache.set(cacheKey, dataUrl);
              if (frameCache.size > 80) {
                const first = frameCache.keys().next().value;
                if (first) frameCache.delete(first);
              }
              setFrame(dataUrl);
            } catch {
              setFailed(true);
            }
          },
          onError: () => setFailed(true),
          style: {
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0,
          },
        })}
      </View>
      {fallback}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', height: '100%', overflow: 'hidden' },
  frame: { width: '100%', height: '100%' },
});
