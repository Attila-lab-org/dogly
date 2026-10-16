import {
  guideForPage,
  guidePageForPath,
} from '@/features/guide/copy';
import {
  hasSeenGuide,
  markGuideSeen,
  readGuideLocale,
  resetGuideStorageForTests,
  saveGuideLocale,
  setGuideStorageForTests,
} from '@/features/guide/persistence';

describe('DOGly contextual guide', () => {
  afterEach(() => resetGuideStorageForTests());

  it('keeps a helpful three-step story for every core service', () => {
    for (const page of ['ask', 'home', 'diary', 'agenda', 'nutrition', 'social', 'profile', 'settings', 'games'] as const) {
      const guide = guideForPage(page, 'it', 'Oreo');
      expect(guide.steps).toHaveLength(3);
      expect(guide.steps.every((step) => step.title.length > 0 && step.body.length > 0)).toBe(true);
    }
  });

  it('keeps the chat guide personal and bilingual', () => {
    expect(guideForPage('ask', 'it', 'Oreo').steps[0]?.title).toBe('Iniziamo da Oreo!');
    expect(guideForPage('ask', 'en', 'Oreo').steps[0]?.title).toBe('Let’s start with Oreo!');
    expect(guideForPage('ask', 'it', 'Oreo').steps[0]?.target).toBe('composer');
  });

  it('maps the real routes to their own guide world', () => {
    expect(guidePageForPath('/ask')).toBe('ask');
    expect(guidePageForPath('/settings/notifications')).toBe('settings');
    expect(guidePageForPath('/nutrition/foods')).toBe('nutrition');
    expect(guidePageForPath('/social')).toBe('social');
    expect(guidePageForPath('/unrelated')).toBeNull();
  });

  it('persists completion and language across a fresh module consumer', async () => {
    const values = new Map<string, string>();
    setGuideStorageForTests({
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => { values.set(key, value); },
    });

    expect(await hasSeenGuide('ask', 'dog-1')).toBe(false);
    await markGuideSeen('ask', 'dog-1');
    await saveGuideLocale('en');
    expect(await hasSeenGuide('ask', 'dog-1')).toBe(true);
    expect(await readGuideLocale()).toBe('en');
  });
});
