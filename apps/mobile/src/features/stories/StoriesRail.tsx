import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { DogStory } from './data';

export function StoriesRail({
  stories,
  onAdd,
  onOpen,
  onDelete,
}: {
  stories: DogStory[];
  onAdd: () => void;
  onOpen: (story: DogStory) => void;
  onDelete: (story: DogStory) => void;
}) {
  const previews = stories
    .filter(
      (story, index) =>
        stories.findIndex((candidate) => candidate.dogId === story.dogId) === index,
    )
    .map((story) => ({
      ...story,
      unseen: stories.some(
        (candidate) => candidate.dogId === story.dogId && candidate.unseen,
      ),
    }));

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Storie</Text>
        <Text style={styles.hint}>Scorri e tocca per vedere</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Aggiungi storia"
          onPress={onAdd}
          style={styles.item}
        >
          <View style={styles.addRing}>
            <Ionicons name="camera" size={26} color={colors.primary} />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            La tua
          </Text>
        </Pressable>

        {previews.map((story) => (
          <View key={story.id} style={styles.storyItem}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Storia di ${story.dogName}`}
              onPress={() => onOpen(story)}
              style={styles.item}
            >
              {story.unseen ? (
                <LinearGradient
                  colors={[colors.primary, colors.accent]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.ring}
                >
                  <View style={styles.ringInner}>
                    <Image
                      source={{ uri: story.photoUri }}
                      style={styles.avatar}
                    />
                  </View>
                </LinearGradient>
              ) : (
                <View style={styles.ringSeen}>
                  <Image source={{ uri: story.photoUri }} style={styles.avatar} />
                </View>
              )}
              <Text style={styles.label} numberOfLines={1}>
                {story.dogName}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Elimina storia"
              onPress={() => onDelete(story)}
              hitSlop={8}
              style={styles.deleteStory}
            >
              <Ionicons name="close" size={14} color={colors.textOnPrimary} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const SIZE = 68;

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  hint: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  row: {
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  item: {
    width: SIZE + 8,
    alignItems: 'center',
    gap: spacing.xs,
  },
  storyItem: {
    width: SIZE + 8,
    position: 'relative',
  },
  deleteStory: {
    position: 'absolute',
    top: -3,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  addRing: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    padding: 3,
  },
  ringInner: {
    flex: 1,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    padding: 2,
  },
  ringSeen: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 2,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: radius.full,
  },
  label: {
    fontSize: typography.size.xs,
    color: colors.text,
    textAlign: 'center',
    width: '100%',
  },
});
