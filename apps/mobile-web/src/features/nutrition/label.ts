import type { ApiFoodProduct } from './api';

export function hasReadableFoodLabelData(product: ApiFoodProduct): boolean {
  return Boolean(
    product.brand ||
      product.name ||
      product.ingredients_raw ||
      Object.values(product.guaranteed_analysis ?? {}).some(Boolean),
  );
}
