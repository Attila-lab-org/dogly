import {
  DIGESTIVE_VET_SHARE_CTA,
  buildDigestiveVetShareCard,
} from '../features/digestive/shareCopy';

describe('digestive vet share', () => {
  it('prepares a text-only message the owner can send to the vet', () => {
    const card = buildDigestiveVetShareCard({
      dogName: 'Oreo',
      headline: 'Non riesco a confermare un dettaglio',
      summary:
        'Non riesco a confermare bene questo dettaglio dalla foto. Se noti una traccia rossa evidente, è meglio sentire il veterinario.',
      actionBody:
        'Non riesco a confermare bene questo dettaglio dalla foto. Se noti una traccia rossa evidente, è meglio sentire il veterinario.',
    });

    expect(DIGESTIVE_VET_SHARE_CTA).toBe('Invia questa osservazione');
    expect(card.title).toContain('Oreo');
    expect(card.message).toContain('Oreo');
    expect(card.message).toContain('traccia rossa');
    expect(card.message).toContain('non una diagnosi');
    expect(card.message).not.toMatch(/https?:\/\//);
    expect(card.message.toLowerCase()).not.toContain('fecal');
  });
});
