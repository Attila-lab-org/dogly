import React from 'react';
import { GuideOverlay } from './GuideOverlay';
import { useGuide } from './useGuide';
import type { GuidePage } from './copy';

/** First-visit guide for screens that use their own scenic layout. */
export function PageGuide({ page, dogId, dogName }: { page: GuidePage; dogId?: string; dogName?: string }) {
  const guide = useGuide({ page, dogId, dogName });
  return (
    <GuideOverlay
      visible={guide.visible}
      page={page}
      dogName={dogName}
      locale={guide.locale}
      onLocaleChange={guide.setLocale}
      onClose={guide.close}
    />
  );
}

export default PageGuide;
