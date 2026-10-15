import type { ApiFoodProduct, ExternalFoodCandidate } from './api';

type NutritionSource = {
  ingredients_raw?: string | null;
  guaranteed_analysis?: {
    crude_protein_min?: number | null;
    crude_fat_min?: number | null;
    crude_fiber_max?: number | null;
    moisture_max?: number | null;
    calories?: string | null;
  } | null;
};

/** Any label signal at all (legacy). */
export function hasReadableFoodLabelData(product: ApiFoodProduct): boolean {
  return Boolean(
    product.brand ||
      product.name ||
      product.ingredients_raw ||
      Object.values(product.guaranteed_analysis ?? {}).some(Boolean),
  );
}

/**
 * Minimum data to use a food as the dog's meal context
 * (composition + protein + fat — like FoodSwitch / label readers).
 */
export function hasMealNutrition(source: NutritionSource | null | undefined): boolean {
  if (!source) return false;
  const ingredients = source.ingredients_raw?.trim();
  const protein = source.guaranteed_analysis?.crude_protein_min;
  const fat = source.guaranteed_analysis?.crude_fat_min;
  return Boolean(
    ingredients &&
      typeof protein === 'number' &&
      Number.isFinite(protein) &&
      typeof fat === 'number' &&
      Number.isFinite(fat),
  );
}

/** True when identity is known but meal nutrition is still missing. */
export function needsLabelEnrichment(
  source: NutritionSource | ExternalFoodCandidate | ApiFoodProduct | null | undefined,
): boolean {
  return !hasMealNutrition(source);
}
