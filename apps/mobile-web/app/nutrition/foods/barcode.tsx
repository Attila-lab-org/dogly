/**
 * Barcode entry temporarily retired — photo + catalog are the primary paths.
 * Keep the route so old links land somewhere useful.
 */
import { Redirect } from 'expo-router';

export default function FoodBarcodeRedirect() {
  return <Redirect href="/nutrition/foods/scan" />;
}
