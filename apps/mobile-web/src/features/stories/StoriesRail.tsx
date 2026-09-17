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
import { spacing, typography } from '../../theme/tokens';
import type { DogStory } from './data';

const SIZE = 72;

export function StoriesRail({
  stories,
  onAdd,
  onOpen,
}: {
  stories: DogStory[];
  onAdd: () => void;
  onOpen: (story: DogStory) => void;
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
            <Ionicons name="camera" size={26} color="#2DAAAB" />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            La tua
          </Text>
        </Pressable>

        {previews.map((story) => (
          <Pressable
            key={story.id}
            accessibilityRole="button"
            accessibilityLabel={`Storia di ${story.dogName}`}
            onPress={() => onOpen(story)}
            style={styles.item}
          >
            {story.unseen ? (
              <LinearGradient
                colors={['#0050d8', '#01AEC5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ring}
              >
                <View style={styles.ringInner}>
                  <Image source={{ uri: story.photoUri }} style={styles.avatar} />
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
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A2B48',
  },
  hint: {
    fontSize: 12,
    color: '#8295A8',
  },
  row: {
    gap: 14,
    paddingRight: spacing.lg,
  },
  item: {
    width: SIZE + 8,
    alignItems: 'center',
    gap: 6,
  },
  addRing: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1.5,
    borderColor: '#E0F7F6',
    borderStyle: 'dashed',
    backgroundColor: '#F8FAFC',
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
    borderRadius: 9999,
    backgroundColor: '#FFFFFF',
    padding: 2,
  },
  ringSeen: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    padding: 2,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 9999,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    width: '100%',
  },
});
