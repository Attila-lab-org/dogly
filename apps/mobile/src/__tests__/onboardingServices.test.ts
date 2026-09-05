import { mapApiDogToProfile, type ApiDog } from '../features/dogs/map';
import { contentTypeFromUri, isLocalPhotoUri } from '../features/dogs/photoUri';

const apiDog = (overrides: Partial<ApiDog> = {}): ApiDog => ({
  id: 'dog-1',
  name: 'Nala',
  birth_date: '2022-05-18',
  age_stage: '4 anni',
  size: 'MEDIUM',
  breed_label: 'Mix',
  is_mix: true,
  sex: null,
  weight_kg: 12.5,
  photo_path: 'users/u1/dogs/dog-1/avatar/abc.jpg',
  photo_url: 'https://storage.example/read/avatar.jpg',
  created_at: '2026-09-05T10:00:00Z',
  ...overrides,
});

describe('onboarding + servizi: foto e mapping profilo', () => {
  it('usa l’URL firmato per mostrare la foto, non il path di storage', () => {
    const profile = mapApiDogToProfile(apiDog());
    expect(profile.photoUri).toBe('https://storage.example/read/avatar.jpg');
    expect(profile.weightKg).toBe(12.5);
  });

  it('senza URL firmato non mostra un path privato come immagine', () => {
    const profile = mapApiDogToProfile(apiDog({ photo_url: null }));
    expect(profile.photoUri).toBeNull();
  });

  it('riconosce solo URI locali della fotocamera/galleria', () => {
    expect(isLocalPhotoUri('file:///data/user/0/cache/photo.jpg')).toBe(true);
    expect(isLocalPhotoUri('content://media/external/images/1')).toBe(true);
    expect(isLocalPhotoUri('https://storage.example/read/avatar.jpg')).toBe(false);
    expect(isLocalPhotoUri(null)).toBe(false);
  });

  it('deriva il content-type dal file scelto', () => {
    expect(contentTypeFromUri('file:///tmp/a.PNG')).toBe('image/png');
    expect(contentTypeFromUri('file:///tmp/a.webp?x=1')).toBe('image/webp');
    expect(contentTypeFromUri('file:///tmp/a.jpg')).toBe('image/jpeg');
  });
});
