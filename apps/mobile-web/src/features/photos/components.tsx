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
import { CuteIcon } from '@/components/CuteIcon';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { AlbumPhoto, PhotoAlbum } from './types';

/** Gap stile Instagram (profilo): quasi a filo. */
const GRID_GAP = 2;

export function PhotoThumbnail({
  photo,
  onPress,
  onLongPress,
  onPressTrash,
  size = 104,
  showTrash = false,
}: {
  photo: AlbumPhoto;
  onPress?: () => void;
  onLongPress?: () => void;
  onPressTrash?: () => void;
  size?: number;
  showTrash?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={photo.caption ?? 'Momento'}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      style={[styles.thumb, { width: size, height: size }]}
    >
      <Image source={{ uri: photo.thumbnailUri }} style={styles.thumbImage} />
      {showTrash ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Elimina momento"
          hitSlop={6}
          onPress={(event) => {
            event.stopPropagation?.();
            onPressTrash?.();
          }}
          style={styles.trashBadge}
        >
          <Ionicons name="trash" size={14} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export function PhotoGrid({
  photos,
  onPressPhoto,
  onLongPressPhoto,
  onPressTrash,
  armedPhotoId = null,
  style,
  header,
  footer,
  empty,
  onEndReached,
}: {
  photos: AlbumPhoto[];
  onPressPhoto: (photo: AlbumPhoto) => void;
  onLongPressPhoto?: (photo: AlbumPhoto) => void;
  onPressTrash?: (photo: AlbumPhoto) => void;
  /** Foto su cui è apparso il cestino dopo long-press. */
  armedPhotoId?: string | null;
  style?: ViewStyle;
  header?: ReactElement;
  footer?: ReactElement;
  empty?: ReactElement;
  onEndReached?: () => void;
}) {
  const { width } = useWindowDimensions();
  const size = Math.floor((width - GRID_GAP * 2) / 3);
  return (
    <FlatList
      data={photos}
      keyExtractor={(photo) => photo.id}
      numColumns={3}
      initialNumToRender={18}
      maxToRenderPerBatch={18}
      windowSize={7}
      showsVerticalScrollIndicator={false}
      style={styles.gridList}
      contentContainerStyle={style}
      columnWrapperStyle={styles.gridRow}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      ListEmptyComponent={empty}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item: photo }) => (
        <PhotoThumbnail
          photo={photo}
          onPress={() => onPressPhoto(photo)}
          onLongPress={
            onLongPressPhoto ? () => onLongPressPhoto(photo) : undefined
          }
          onPressTrash={
            onPressTrash ? () => onPressTrash(photo) : undefined
          }
          size={size}
          showTrash={armedPhotoId === photo.id}
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
          <CuteIcon name="play" size={28} color={colors.accent} secondary={colors.accentSoft} />
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
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  trashBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
    zIndex: 2,
  },
  gridList: {
    flex: 1,
  },
  gridRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
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
