import { useCallback, useEffect, useMemo, useState } from 'react';
import { guideForPage, type GuideLocale, type GuidePage } from './copy';
import { hasSeenGuide, markGuideSeen, readGuideLocale, saveGuideLocale } from './persistence';

export function useGuide({
  page,
  dogId,
  dogName,
  enabled = true,
  force = false,
}: {
  page: GuidePage | null;
  dogId?: string;
  dogName?: string;
  enabled?: boolean;
  /** Dev/review entry point: show the guide again without clearing user data. */
  force?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [locale, setLocaleState] = useState<GuideLocale>('it');
  const key = useMemo(() => (page ? `${page}:${dogId || 'default'}` : ''), [page, dogId]);

  useEffect(() => {
    let active = true;
    if (!enabled || !page) {
      setVisible(false);
      setReady(true);
      return () => { active = false; };
    }
    setReady(false);
    void Promise.all([hasSeenGuide(page, dogId), readGuideLocale()]).then(([seen, nextLocale]) => {
      if (!active) return;
      setLocaleState(nextLocale);
      setVisible(force || !seen);
      setReady(true);
    });
    return () => { active = false; };
  }, [enabled, page, dogId, key, force]);

  const close = useCallback(async () => {
    if (!page) return;
    setVisible(false);
    await markGuideSeen(page, dogId);
  }, [page, dogId]);

  const setLocale = useCallback((nextLocale: GuideLocale) => {
    setLocaleState(nextLocale);
    void saveGuideLocale(nextLocale);
  }, []);

  const reopen = useCallback(() => setVisible(Boolean(page)), [page]);
  const definition = page ? guideForPage(page, locale, dogName) : null;

  return { visible, ready, locale, setLocale, close, reopen, definition };
}
