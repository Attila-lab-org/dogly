/**
 * Condivisione risultato "Scoiattolo!" (nativa).
 * Senza rasterizzatori installati (react-native-view-shot assente) la card
 * grafica non è generabile su nativa: fallback onesto alla condivisione di
 * sistema con il testo del risultato. Su web la card PNG entra davvero
 * nelle storie (vedi shareScoreCard.web.ts).
 */
import { Share } from 'react-native';

export async function shareSquirrelResult({
  dogName,
  score,
  best,
}: {
  dogId: string;
  dogName: string;
  score: number;
  best: number;
}): Promise<boolean> {
  try {
    await Share.share({
      message: `${dogName} ha totalizzato ${score} punti a Scoiattolo! su Dogly${
        best > 0 && score >= best ? ' — nuovo record personale!' : ''
      }. Riuscite a batterci?`,
    });
    return true;
  } catch {
    return false;
  }
}
