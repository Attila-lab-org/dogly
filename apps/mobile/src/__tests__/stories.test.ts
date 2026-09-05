import {
  addStory,
  getActiveStories,
  markStorySeen,
  storyById,
} from '../features/stories/data';

describe('storie', () => {
  it('aggiunge una storia separata e la rende disponibile nel viewer', () => {
    const story = addStory({
      dogId: 'dog-test',
      dogName: 'Luna',
      photoUri: 'file:///story.jpg',
    });

    expect(getActiveStories()[0]).toEqual(story);
    expect(storyById(story.id)?.photoUri).toBe('file:///story.jpg');
  });

  it('registra la visualizzazione della storia', () => {
    const seeded = getActiveStories().find((story) => story.unseen);
    expect(seeded).toBeDefined();

    markStorySeen(seeded!.id);

    expect(storyById(seeded!.id)?.unseen).toBe(false);
  });
});
