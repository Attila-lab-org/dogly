import {
  breedLabelFromSelection,
  breedSelectionFromLabel,
  filterBreeds,
} from '../features/dogs/breeds';

describe('selezione razza', () => {
  it('cerca ignorando maiuscole e accenti', () => {
    expect(filterBreeds('frise')).toContain('Bichon Frisé');
    expect(filterBreeds('golden')).toContain('Golden Retriever');
  });

  it('salva esplicitamente un mix', () => {
    expect(breedLabelFromSelection({ kind: 'mixed' })).toBe('Mix');
    expect(breedSelectionFromLabel('Mix')).toEqual({ kind: 'mixed' });
    expect(breedSelectionFromLabel('Incrocio')).toEqual({ kind: 'mixed' });
  });

  it('non inventa una razza quando l’utente non la conosce', () => {
    expect(breedLabelFromSelection({ kind: 'unknown' })).toBeNull();
    expect(breedSelectionFromLabel(null)).toEqual({ kind: 'unknown' });
  });
});
