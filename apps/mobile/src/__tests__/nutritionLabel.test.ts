import type { ApiFoodProduct } from '../features/nutrition/api';
import { hasReadableFoodLabelData } from '../features/nutrition/label';

const emptyProduct: ApiFoodProduct = {
  id: 'food-1',
  brand: null,
  name: null,
  ingredients_raw: null,
  guaranteed_analysis: {},
  verified_at: null,
};

describe('food label reading', () => {
  it('falls back to manual review when nothing was legible', () => {
    expect(hasReadableFoodLabelData(emptyProduct)).toBe(false);
  });

  it('continues with review when at least one useful field was read', () => {
    expect(
      hasReadableFoodLabelData({
        ...emptyProduct,
        guaranteed_analysis: { crude_protein_min: 26 },
      }),
    ).toBe(true);
  });
});
