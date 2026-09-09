import { getInfoAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { api } from '../../lib/apiClient';
import { putSignedUpload } from '../../lib/signedUpload';
import { contentTypeFromUri } from '../dogs/photoUri';

export type ApiFoodProduct = {
  id: string;
  dog_id?: string | null;
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
}): Promise<string> {
  const contentType = contentTypeFromUri(options.localUri);
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
  return init.food_product_id;
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
    },
    { headers: { 'X-Idempotency-Key': `verify-${options.foodId}` } },
  );
}

export async function activateFeedingPeriod(options: {
  dogId: string;
  foodId: string;
}): Promise<ApiFeedingPeriod> {
  // FIX 3.4: deterministic key per food so a duplicate activation tap is a
  // server-side no-op instead of creating a second feeding period.
  const key = `feed-${options.foodId}`;
  return api.post<ApiFeedingPeriod>(
    '/v1/nutrition/feeding-periods',
    {
      dog_id: options.dogId,
      food_product_id: options.foodId,
      start_at: new Date().toISOString(),
    },
    { headers: { 'X-Idempotency-Key': key } },
  );
}
