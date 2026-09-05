import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chip } from '../../components/Chip';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { AlbumPhoto, PhotoAlbum, PhotoVisibility } from './types';

export function VisibilityBadge({
  visibility,
}: {
  visibility: PhotoVisibility;
}) {
  return (
    <Chip
      label={visibility === 'private' ? 'Privata' : 'Visibile'}
      tone={visibility === 'private' ? 'neutral' : 'accent'}
    />
  );
}

export function PhotoThumbnail({
  photo,
  onPress,
  size = 104,
}: {
  photo: AlbumPhoto;
  onPress?: () => void;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${photo.caption ?? 'Foto'}, ${
        photo.visibility === 'private' ? 'privata' : 'visibile'
      }`}
      onPress={onPress}
      style={[styles.thumb, { width: size, height: size }]}
    >
      <Image source={{ uri: photo.thumbnailUri }} style={styles.thumbImage} />
      {photo.visibility === 'published' ? (
        <View style={styles.badgeCorner}>
          <Ionicons name="eye-outline" size={14} color={colors.textOnPrimary} />
        </View>
      ) : null}
    </Pressable>
  );
}

export function PhotoGrid({
  photos,
  onPressPhoto,
  style,
}: {
  photos: AlbumPhoto[];
  onPressPhoto: (photo: AlbumPhoto) => void;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.grid, style]}>
      {photos.map((photo) => (
        <PhotoThumbnail
          key={photo.id}
          photo={photo}
          onPress={() => onPressPhoto(photo)}
        />
      ))}
    </View>
  );
}

export function AlbumCard({
  album,
  coverUri,
  onPress,
}: {
  album: PhotoAlbum;
  coverUri?: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${album.title}, ${album.photoCount} foto`}
      onPress={onPress}
      style={styles.albumCard}
    >
      <View style={styles.albumCover}>
        {coverUri ? (
          <Image source={{ uri: coverUri }} style={styles.albumCoverImage} />
        ) : (
          <Ionicons name="images-outline" size={28} color={colors.textMuted} />
        )}
      </View>
      <View style={styles.albumMeta}>
        <Text style={styles.albumTitle}>{album.title}</Text>
        <Text style={styles.albumCount}>{album.photoCount} foto</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export function PrivacyNoticeBanner({ text }: { text: string }) {
  return (
    <View style={styles.notice}>
      <Ionicons name="lock-closed-outline" size={16} color={colors.accent} />
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  badgeCorner: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    padding: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  albumCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  albumCover: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  albumCoverImage: {
    width: '100%',
    height: '100%',
  },
  albumMeta: {
    flex: 1,
  },
  albumTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  albumCount: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  notice: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  noticeText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
});
