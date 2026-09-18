export function isOpenPeriodForFood(
  period: { food_product_id: string; end_at?: string | null } | null | undefined,
  foodId: string,
): boolean {
  return Boolean(
    period && period.end_at == null && period.food_product_id === foodId,
  );
}

export function feedingQuantitySuccessCopy(
  dogName: string,
  foodLabel: string,
): { title: string; body: string } {
  return {
    title: 'Quantità aggiornata',
    body:
      `La quantità giornaliera di ${foodLabel} è stata aggiornata. ` +
      `Il periodo alimentare di ${dogName} resta lo stesso.`,
  };
}
