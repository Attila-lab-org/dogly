import type { DogProfile } from '../features/core/types';
import { profileChangesToUpdateBody } from '../features/dogs/profilePatch';

const current: DogProfile = {
  id: 'dog-1',
  name: 'Luna',
  ageLabel: '4 anni',
  birthDate: '2022-05-18',
  sizeLabel: 'Taglia media',
  weightKg: 12.5,
  sex: null,
  breedLabel: 'Mix',
  isMix: true,
  photoUri: null,
  profileVisibility: 'private',
  publicConsentVersion: null,
};

describe('dog profile semantic PATCH', () => {
  it('non invia campi invariati', () => {
    expect(
      profileChangesToUpdateBody(current, {
        name: 'Luna',
        birthDate: '2022-05-18',
        sizeLabel: 'Taglia media',
        weightKg: 12.5,
        sex: null,
        breedLabel: 'Mix',
        isMix: true,
      }),
    ).toEqual({});
  });

  it('mantiene null esplicito per cancellare campi opzionali', () => {
    expect(
      profileChangesToUpdateBody(current, {
        birthDate: null,
        weightKg: null,
        breedLabel: null,
      }),
    ).toEqual({
      birth_date: null,
      weight_kg: null,
      breed_label: null,
    });
  });

  it('include il sesso solo quando cambia', () => {
    expect(profileChangesToUpdateBody(current, { sex: 'MALE' })).toEqual({
      sex: 'MALE',
    });
  });
});
