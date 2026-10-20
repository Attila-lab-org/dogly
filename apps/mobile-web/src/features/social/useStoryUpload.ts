/**
 * Upload storia condiviso (StoryHeader + anello storia del ConnectionHero).
 * Web: il picker deve partire nello stesso gesto del tap. Invalida le query
 * dei Momenti/Storie dopo l'upload.
 */
import { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { hapticLight } from '../../lib/haptics';
import {
  getOrCreateStoriesAlbum,
  uploadAlbumPhoto,
} from '../photos/api';
import { pickAlbumPhoto, takeStoryPhoto } from '../photos/share';
import { pickWebImage } from '../photos/webPickImage';

export function useStoryUpload(dogId: string, dogName: string, onUploaded: () => void) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const uploadUri = useCallback(
    async (uri: string) => {
      setUploading(true);
      try {
        const album = await getOrCreateStoriesAlbum(dogId);
        await uploadAlbumPhoto(album.id, uri, {
          caption: `Storia di ${dogName}`,
          visibility: 'PRIVATE',
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['social-stories', dogId] }),
          queryClient.invalidateQueries({ queryKey: ['social-moments', dogId] }),
          queryClient.invalidateQueries({ queryKey: ['gallery-dog-photos', dogId] }),
          queryClient.invalidateQueries({ queryKey: ['gallery-photos', album.id] }),
          queryClient.invalidateQueries({ queryKey: ['gallery-albums', dogId] }),
        ]);
        onUploaded();
      } catch {
        Alert.alert(
          'Upload non riuscito',
          'Non sono riuscito a salvare questa storia. Riprova.',
        );
      } finally {
        setUploading(false);
      }
    },
    [dogId, dogName, onUploaded, queryClient],
  );

  const addFromCamera = useCallback(() => {
    if (uploading) return;
    void hapticLight();
    if (Platform.OS === 'web') {
      void pickWebImage({ capture: true }).then((picked) => {
        if (picked?.uri) void uploadUri(picked.uri);
      });
      return;
    }
    void takeStoryPhoto().then((uri) => {
      if (uri) void uploadUri(uri);
    });
  }, [uploading, uploadUri]);

  const addFromGallery = useCallback(() => {
    if (uploading) return;
    void hapticLight();
    if (Platform.OS === 'web') {
      void pickWebImage().then((picked) => {
        if (picked?.uri) void uploadUri(picked.uri);
      });
      return;
    }
    void pickAlbumPhoto().then((uri) => {
      if (uri) void uploadUri(uri);
    });
  }, [uploading, uploadUri]);

  /** Su web il picker parte nel gesto: niente Alert intermedio. */
  const addStory = useCallback(() => {
    if (uploading) return;
    if (Platform.OS === 'web') {
      addFromGallery();
      return;
    }
    Alert.alert('Aggiungi alla storia', undefined, [
      { text: 'Fotocamera', onPress: addFromCamera },
      { text: 'Galleria', onPress: addFromGallery },
      { text: 'Annulla', style: 'cancel' },
    ]);
  }, [uploading, addFromCamera, addFromGallery]);

  return { uploading, addStory };
}
