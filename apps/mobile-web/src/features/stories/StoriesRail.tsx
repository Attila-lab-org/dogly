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
import type { DogStory } from './data';
import { storyRailLabel } from './labels';

export function StoriesRail({
  stories,
  onAdd,
  onOpen,
}: {
  stories: DogStory[];
  onAdd: () => void;
  onOpen: (story: DogStory) => void;
}) {
  const previews = [...stories]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8);

  return (
    <View style={styles.wrap}>
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
            <Ionicons name="add" size={28} color="#2563EB" />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            La tua storia
          </Text>
        </Pressable>

        {previews.map((story) => (
          <Pressable
            key={story.id}
            accessibilityRole="button"
            accessibilityLabel={`Storia: ${storyRailLabel(story)}`}
            onPress={() => onOpen(story)}
            style={styles.item}
          >
            {story.unseen ? (
              <LinearGradient
                colors={['#2563EB', '#38BDF8']}
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
              {storyRailLabel(story)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const SIZE = 64;

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
  },
  row: {
    gap: 12,
    paddingRight: 16,
  },
  item: {
    width: SIZE + 12,
    alignItems: 'center',
    gap: 4,
  },
  addRing: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    padding: 2,
  },
  ringInner: {
    flex: 1,
    borderRadius: 9999,
    backgroundColor: '#F4F7FB',
    padding: 2,
  },
  ringSeen: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
    borderColor: '#DBEAFE',
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
