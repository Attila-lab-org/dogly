/**
 * Image for Supabase signed URLs: cacheKey strips ?token= so a remint of the
 * same object reuses disk/memory cache instead of re-downloading.
 */
import React from 'react';
import { Image, type ImageProps } from 'expo-image';
import { mediaCacheKey } from './mediaCacheKey';

type Props = {
  uri: string;
  style?: ImageProps['style'];
  accessibilityLabel?: string;
  contentFit?: ImageProps['contentFit'];
  onError?: ImageProps['onError'];
};

export function SignedImage({
  uri,
  style,
  accessibilityLabel,
  contentFit = 'cover',
  onError,
}: Props) {
  return (
    <Image
      source={{ uri, cacheKey: mediaCacheKey(uri) }}
      style={style}
      contentFit={contentFit}
      accessibilityLabel={accessibilityLabel}
      onError={onError}
    />
  );
}
