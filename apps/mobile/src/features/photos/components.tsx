import React, { type ReactElement } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { AlbumPhoto, PhotoAlbum } from './types';

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
      accessibilityLabel={photo.caption ?? 'Foto'}
      onPress={onPress}
      style={[styles.thumb, { width: size, height: size }]}
    >
      <Image source={{ uri: photo.thumbnailUri }} style={styles.thumbImage} />
    </Pressable>
  );
}

export function PhotoGrid({
  photos,
  onPressPhoto,
  style,
  header,
  footer,
  empty,
}: {
  photos: AlbumPhoto[];
  onPressPhoto: (photo: AlbumPhoto) => void;
  style?: ViewStyle;
  header?: ReactElement;
  footer?: ReactElement;
  empty?: ReactElement;
}) {
  const { width } = useWindowDimensions();
  const size = Math.max(
    88,
    Math.floor((width - spacing.lg * 2 - spacing.sm * 2) / 3),
  );
  return (
    <FlatList
      data={photos}
      keyExtractor={(photo) => photo.id}
      numColumns={3}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      showsVerticalScrollIndicator={false}
      style={styles.gridList}
      contentContainerStyle={style}
      columnWrapperStyle={styles.gridRow}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      ListEmptyComponent={empty}
      renderItem={({ item: photo }) => (
        <PhotoThumbnail
          photo={photo}
          onPress={() => onPressPhoto(photo)}
          size={size}
        />
      )}
    />
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
      accessibilityLabel={`${album.title}, ${album.photoCount} momenti`}
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
        <Text style={styles.albumCount}>
          {album.photoCount === 1 ? '1 momento' : `${album.photoCount} momenti`}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={colors.textMuted}
        style={styles.albumChevron}
      />
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
  gridList: {
    flex: 1,
  },
  gridRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  albumCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  albumCover: {
    width: 108,
    height: 92,
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
  albumChevron: {
    marginRight: spacing.md,
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
