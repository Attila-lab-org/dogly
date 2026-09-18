import type { ApiFoodProduct } from '../features/nutrition/api';
import { hasReadableFoodLabelData } from '../features/nutrition/label';
import {
  feedingQuantitySuccessCopy,
  isOpenPeriodForFood,
} from '../features/nutrition/period';

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

describe('feeding period quantity updates', () => {
  it('treats the open period of the same food as an in-place update', () => {
    expect(
      isOpenPeriodForFood(
        {
          food_product_id: 'food-1',
          end_at: null,
        },
        'food-1',
      ),
    ).toBe(true);
    expect(
      isOpenPeriodForFood(
        {
          food_product_id: 'food-1',
          end_at: '2026-09-18T00:00:00Z',
        },
        'food-1',
      ),
    ).toBe(false);
  });

  it('does not describe a quantity change as a new food period', () => {
    const copy = feedingQuantitySuccessCopy('Oreo', 'Pasto casalingo al pollo');
    expect(copy.title).toBe('Quantità aggiornata');
    expect(copy.body).toContain('resta lo stesso');
    expect(copy.body).not.toContain('chiuso');
  });
});
