import { Share } from 'react-native';

import {
  buildDigestiveVetShareCard,
  type DigestiveVetShareCard,
} from './shareCopy';

export { DIGESTIVE_VET_SHARE_CTA, buildDigestiveVetShareCard } from './shareCopy';
export type { DigestiveVetShareCard } from './shareCopy';

/** Share sheet testuale. Mai la foto delle feci. */
export async function shareDigestiveWithVet(options: {
  dogName: string;
  headline: string;
  summary: string;
  actionBody?: string | null;
}): Promise<boolean> {
  const card: DigestiveVetShareCard = buildDigestiveVetShareCard(options);
  try {
    await Share.share({ title: card.title, message: card.message });
    return true;
  } catch {
    return false;
  }
}
