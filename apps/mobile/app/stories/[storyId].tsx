/**
 * Viewer storia a schermo intero: tap a sinistra/destra per scorrere.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@/theme/tokens';
import { deleteStory, markStorySeen, useStories } from '@/features/stories/data';
import { useDogProfile } from '@/features/core/useDogProfile';
import { confirmDestructiveAction } from '@/lib/confirmAction';

export default function StoryViewerScreen() {
  const params = useLocalSearchParams<{ storyId?: string | string[] }>();
  const storyId = Array.isArray(params.storyId)
    ? params.storyId[0] ?? ''
    : params.storyId ?? '';
  const router = useRouter();
  const { dog } = useDogProfile();
  const [deleting, setDeleting] = useState(false);
  const stories = useStories(dog.id, dog.name);
  const index = Math.max(
    0,
    stories.findIndex((s) => s.id === storyId),
  );
  const story = stories.find((item) => item.id === storyId) ?? stories[index];

  useEffect(() => {
    if (story) markStorySeen(story.id);
  }, [story?.id]);

  if (!story) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.empty}>
          <Text style={styles.emptyText}>Storia non disponibile</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.closeLabel}>Chiudi</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  const goNext = () => {
    const next = stories[index + 1];
    if (next) {
      router.replace(`/stories/${next.id}` as never);
      return;
    }
    router.back();
  };

  const goPrevious = () => {
    const previous = stories[index - 1];
    if (previous) {
      router.replace(`/stories/${previous.id}` as never);
    }
  };

  return (
    <View style={styles.root}>
      <Image source={{ uri: story.photoUri }} style={styles.image} />
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.tapZones}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Storia precedente"
            disabled={index === 0}
            onPress={goPrevious}
            style={styles.tapZone}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              index === stories.length - 1 ? 'Chiudi storie' : 'Storia successiva'
            }
            onPress={goNext}
            style={styles.tapZone}
          />
        </View>
        <View style={styles.header}>
          <View style={styles.progressRow}>
            {stories.map((item, itemIndex) => (
              <View key={item.id} style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressValue,
                    itemIndex > index && styles.progressPending,
                  ]}
                />
              </View>
            ))}
          </View>
          <View style={styles.topBar}>
            <Text style={styles.name}>{story.dogName}</Text>
            <View style={styles.topActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Elimina storia"
                disabled={deleting}
                onPress={() =>
                  confirmDestructiveAction(
                    'Eliminare questa storia?',
                    'Verrà rimossa subito e definitivamente.',
                    () => {
                      const next = stories[index + 1] ?? stories[index - 1];
                      setDeleting(true);
                      void deleteStory(story.id, dog.id)
                        .then(() => {
                          if (next) {
                            router.replace(`/stories/${next.id}` as never);
                          } else {
                            router.back();
                          }
                        })
                        .catch(() => {
                          setDeleting(false);
                          Alert.alert(
                            'Storia non eliminata',
                            'Riprova tra poco.',
                          );
                        });
                    },
                  )
                }
                hitSlop={10}
              >
                <Ionicons name="trash-outline" size={24} color={colors.textOnPrimary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Chiudi"
                onPress={() => router.back()}
                hitSlop={12}
              >
                <Ionicons name="close" size={28} color={colors.textOnPrimary} />
              </Pressable>
            </View>
          </View>
        </View>
        {story.caption ? (
          <Text style={styles.caption}>{story.caption}</Text>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  image: {
    ...StyleSheet.absoluteFill,
    resizeMode: 'cover',
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  tapZones: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
  },
  tapZone: {
    flex: 1,
  },
  header: {
    gap: spacing.md,
    zIndex: 1,
  },
  progressRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  progressValue: {
    flex: 1,
    backgroundColor: colors.textOnPrimary,
  },
  progressPending: {
    opacity: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  name: {
    color: colors.textOnPrimary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  caption: {
    color: colors.textOnPrimary,
    fontSize: typography.size.md,
    marginBottom: spacing.xl,
    zIndex: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  emptyText: {
    color: colors.textOnPrimary,
  },
  closeLabel: {
    color: colors.accent,
    fontWeight: typography.weight.semibold,
  },
});
