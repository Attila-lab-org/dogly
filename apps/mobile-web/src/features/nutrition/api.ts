import { getInfoAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { api } from '../../lib/apiClient';
import { putSignedUpload } from '../../lib/signedUpload';
import { detectImageContentType } from '../dogs/photoUri';
import { hasReadableFoodLabelData } from './label';

export type ApiFoodProduct = {
  id: string;
  dog_id?: string | null;
  label_image_url?: string | null;
  brand: string | null;
  name: string | null;
  ingredients_raw?: string | null;
  guaranteed_analysis?: {
    crude_protein_min?: number | null;
    crude_fat_min?: number | null;
    crude_fiber_max?: number | null;
    moisture_max?: number | null;
    calories?: string | null;
  };
  feeding_directions?: string | null;
  extraction_confidence?: Record<string, number>;
  verified_at: string | null;
};

export type ApiFeedingPeriod = {
  id: string;
  dog_id: string;
  food_product_id: string;
  start_at: string;
  end_at: string | null;
  quantity_per_day?: string | null;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function fileBytes(localUri: string): Promise<number> {
  if (
    Platform.OS === 'web' &&
    (localUri.startsWith('blob:') || localUri.startsWith('http'))
  ) {
    const response = await fetch(localUri);
    if (!response.ok) {
      throw new Error(`Lettura foto fallita (${response.status})`);
    }
    return Math.max(1, (await response.blob()).size);
  }
  try {
    const info = await getInfoAsync(localUri);
    if (info.exists && 'size' in info && typeof info.size === 'number') {
      return Math.max(1, info.size);
    }
  } catch {
    // fallback
  }
  return 1;
}

export async function listFoods(dogId: string): Promise<ApiFoodProduct[]> {
  return api.get<ApiFoodProduct[]>(
    `/v1/nutrition/foods?dog_id=${encodeURIComponent(dogId)}`,
  );
}

export async function getFood(foodId: string): Promise<ApiFoodProduct> {
  return api.get<ApiFoodProduct>(`/v1/nutrition/foods/${foodId}`);
}

export async function listFeedingPeriods(
  dogId: string,
): Promise<ApiFeedingPeriod[]> {
  return api.get<ApiFeedingPeriod[]>(
    `/v1/nutrition/feeding-periods?dog_id=${encodeURIComponent(dogId)}`,
  );
}

export async function scanAndUploadFoodLabel(options: {
  dogId: string;
  localUri: string;
}): Promise<{
  foodId: string;
  food: ApiFoodProduct | null;
  readAutomatically: boolean;
}> {
  const contentType = await detectImageContentType(options.localUri);
  const bytes = await fileBytes(options.localUri);
  const clientRequestId = newId('food');
  const init = await api.post<{
    food_product_id: string;
    upload: { url: string };
  }>(
    '/v1/nutrition/foods/scan/init',
    {
      dog_id: options.dogId,
      client_request_id: clientRequestId,
      bytes,
      content_type: contentType,
    },
    { headers: { 'X-Idempotency-Key': clientRequestId } },
  );
  await putSignedUpload(init.upload.url, options.localUri, contentType);
  try {
    const extracted = await api.post<ApiFoodProduct>(
      `/v1/nutrition/foods/${init.food_product_id}/extract`,
      {},
    );
    return {
      foodId: init.food_product_id,
      food: extracted,
      readAutomatically: hasReadableFoodLabelData(extracted),
    };
  } catch {
    return {
      foodId: init.food_product_id,
      food: null,
      readAutomatically: false,
    };
  }
}

export async function verifyFood(options: {
  foodId: string;
  brand: string;
  name: string;
  ingredientsRaw: string;
  protein: string;
  fat: string;
  fiber: string;
  moisture: string;
  calories: string;
  feedingDirections?: string;
}): Promise<ApiFoodProduct> {
  const numberOrNull = (value: string): number | null => {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) && value.trim() ? parsed : null;
  };
  return api.patch<ApiFoodProduct>(
    `/v1/nutrition/foods/${options.foodId}/verify`,
    {
      brand: options.brand,
      name: options.name,
      ingredients_raw: options.ingredientsRaw || null,
      guaranteed_analysis: {
        crude_protein_min: numberOrNull(options.protein),
        crude_fat_min: numberOrNull(options.fat),
        crude_fiber_max: numberOrNull(options.fiber),
        moisture_max: numberOrNull(options.moisture),
        calories: options.calories || null,
      },
      feeding_directions: options.feedingDirections?.trim() || null,
    },
    { headers: { 'X-Idempotency-Key': `verify-${options.foodId}` } },
  );
}

export async function createManualFood(options: {
  dogId: string;
  brand?: string;
  name: string;
  ingredientsRaw?: string;
  calories?: string;
}): Promise<ApiFoodProduct> {
  const clientRequestId = newId('manual-food');
  return api.post<ApiFoodProduct>(
    '/v1/nutrition/foods/manual',
    {
      dog_id: options.dogId,
      client_request_id: clientRequestId,
      brand: options.brand?.trim() || null,
      name: options.name.trim(),
      ingredients_raw: options.ingredientsRaw?.trim() || null,
      guaranteed_analysis: {
        calories: options.calories?.trim() || null,
      },
    },
    { headers: { 'X-Idempotency-Key': clientRequestId } },
  );
}

export type ExternalFoodCandidate = {
  lookup_id: string;
  barcode: string;
  brand: string | null;
  name: string | null;
  variant?: string | null;
  package_size?: string | null;
  food_form?: string | null;
  ingredients_raw?: string | null;
  calories?: string | null;
  image_url?: string | null;
  attribution: string;
  confirmation_required: boolean;
};

export async function searchFoodsByName(options: {
  dogId: string;
  query: string;
}): Promise<{ items: ExternalFoodCandidate[]; attribution: string }> {
  const clientRequestId = newId('opff-search');
  const query = options.query.trim().slice(0, 80);
  return api.post<{ items: ExternalFoodCandidate[]; attribution: string }>(
    '/v1/nutrition/foods/external/search',
    {
      dog_id: options.dogId,
      query,
      client_request_id: clientRequestId,
    },
    { headers: { 'X-Idempotency-Key': clientRequestId } },
  );
}

export async function lookupFoodByBarcode(options: {
  dogId: string;
  barcode: string;
}): Promise<ExternalFoodCandidate> {
  const clientRequestId = newId('opff');
  return api.post<ExternalFoodCandidate>(
    '/v1/nutrition/foods/external/lookup',
    {
      dog_id: options.dogId,
      barcode: options.barcode,
      client_request_id: clientRequestId,
    },
    { headers: { 'X-Idempotency-Key': clientRequestId } },
  );
}

export async function confirmExternalFood(options: {
  dogId: string;
  lookupId: string;
  draftFoodId?: string;
  brand?: string;
  name: string;
  ingredientsRaw?: string;
  calories?: string;
  activate?: boolean;
}): Promise<ApiFoodProduct> {
  const key = `opff-confirm-${options.lookupId}`;
  return api.post<ApiFoodProduct>(
    '/v1/nutrition/foods/external/confirm',
    {
      dog_id: options.dogId,
      lookup_id: options.lookupId,
      draft_food_id: options.draftFoodId || null,
      brand: options.brand?.trim() || null,
      name: options.name.trim(),
      ingredients_raw: options.ingredientsRaw?.trim() || null,
      calories: options.calories?.trim() || null,
      activate: options.activate ?? false,
    },
    { headers: { 'X-Idempotency-Key': key } },
  );
}

export async function updateFeedingPeriod(options: {
  periodId: string;
  quantityPerDay?: string;
}): Promise<ApiFeedingPeriod> {
  const quantity = options.quantityPerDay?.trim() || '';
  return api.patch<ApiFeedingPeriod>(
    `/v1/nutrition/feeding-periods/${options.periodId}`,
    { quantity_per_day: quantity || null },
    {
      headers: {
        'X-Idempotency-Key': `feed-qty-${options.periodId}-${quantity || 'clear'}`,
      },
    },
  );
}

export async function activateFeedingPeriod(options: {
  dogId: string;
  foodId: string;
  quantityPerDay?: string;
  treatsNotes?: string;
  transitionNotes?: string;
}): Promise<ApiFeedingPeriod> {
  // FIX 3.4: deterministic key per food so a duplicate activation tap is a
  // server-side no-op instead of creating a second feeding period.
  const quantityKey = options.quantityPerDay?.trim();
  const key = quantityKey
    ? `feed-${options.foodId}-qty-${quantityKey}`
    : `feed-${options.foodId}`;
  return api.post<ApiFeedingPeriod>(
    '/v1/nutrition/feeding-periods',
    {
      dog_id: options.dogId,
      food_product_id: options.foodId,
      start_at: new Date().toISOString(),
      quantity_per_day: options.quantityPerDay?.trim() || null,
      treats_notes: options.treatsNotes?.trim() || null,
      transition_notes: options.transitionNotes?.trim() || null,
    },
    { headers: { 'X-Idempotency-Key': key } },
  );
}
