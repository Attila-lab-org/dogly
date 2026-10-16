export type GuideLocale = 'it' | 'en';

export type GuidePage =
  | 'ask'
  | 'home'
  | 'diary'
  | 'agenda'
  | 'nutrition'
  | 'social'
  | 'profile'
  | 'settings'
  | 'games';

export type GuideTarget = 'composer' | 'media' | 'conversation' | 'overview';

export type GuideStep = {
  title: string;
  body: string;
  target: GuideTarget;
};

export type GuidePageDefinition = {
  page: GuidePage;
  eyebrow: string;
  steps: GuideStep[];
};

const dog = (name: string) => name.trim() || 'il tuo cane';

const italian: Record<GuidePage, (name: string) => GuidePageDefinition> = {
  ask: (name) => ({
    page: 'ask',
    eyebrow: `CONOSCIAMO ${dog(name).toLocaleUpperCase('it-IT')}`,
    steps: [
      { title: `Iniziamo da ${dog(name)}!`, body: 'Scrivi qui una domanda. Ti aiuto a conoscerlo meglio.', target: 'composer' },
      { title: 'Parlami come vuoi', body: 'Puoi aggiungere una foto, un video o dettare a voce.', target: 'media' },
      { title: 'Tutto resta nel suo mondo', body: `Ritrovi qui le analisi, i momenti e le risposte su ${dog(name)}.`, target: 'conversation' },
    ],
  }),
  home: (name) => ({ page: 'home', eyebrow: `IL MONDO DI ${dog(name).toLocaleUpperCase('it-IT')}`, steps: [
    { title: 'Il momento di oggi', body: 'Qui trovi il punto di partenza per capire come sta andando la giornata.', target: 'overview' },
    { title: 'Una domanda è già un passo', body: 'Apri DOGly e raccontami quello che hai notato, anche in poche parole.', target: 'conversation' },
    { title: 'Tutto a portata di zampa', body: 'Diario, agenda e social restano raccolti qui, senza percorsi complicati.', target: 'overview' },
  ] }),
  diary: () => ({ page: 'diary', eyebrow: 'IL DIARIO DI DOGly', steps: [
    { title: 'Qui prendono forma i momenti', body: 'Ogni foto, video o nota diventa una storia utile da rileggere.', target: 'overview' },
    { title: 'Riconosciamo insieme i segnali', body: 'Apri un momento per capire cosa può raccontare il suo comportamento.', target: 'conversation' },
    { title: 'Non devi ricordare tutto', body: 'DOGly tiene il filo delle osservazioni per te.', target: 'overview' },
  ] }),
  agenda: () => ({ page: 'agenda', eyebrow: 'L’AGENDA DI DOGly', steps: [
    { title: 'Un promemoria al momento giusto', body: 'Vaccini, visite e cure restano ordinati in un unico posto.', target: 'overview' },
    { title: 'Segna ciò che è fatto', body: 'Ogni appuntamento si aggiorna dalla sua scheda, senza cercare tra le schermate.', target: 'conversation' },
    { title: 'La giornata resta leggera', body: 'DOGly ti ricorda l’essenziale e lascia spazio al tempo con il tuo cane.', target: 'overview' },
  ] }),
  nutrition: () => ({ page: 'nutrition', eyebrow: 'LA DISPENSA DI DOGly', steps: [
    { title: 'Conosciamo quello che mangia', body: 'Salva alimenti e note per capire cosa gli fa stare bene.', target: 'overview' },
    { title: 'Una foto può bastare', body: 'Mostrami un’etichetta o una ciotola quando vuoi un aiuto più preciso.', target: 'media' },
    { title: 'Le scelte restano semplici', body: 'Ritrovi i suoi alimenti preferiti senza ricominciare da capo.', target: 'overview' },
  ] }),
  social: () => ({ page: 'social', eyebrow: 'IL MONDO INTORNO A VOI', steps: [
    { title: 'Scopri luoghi che fanno per voi', body: 'Trova posti dog-friendly e idee per uscire insieme.', target: 'overview' },
    { title: 'Scegli con calma', body: 'Apri una scheda per vedere cosa c’è vicino e cosa aspettarti.', target: 'conversation' },
    { title: 'La mappa resta viva', body: 'Puoi tornare qui ogni volta che vuoi cambiare scenario.', target: 'overview' },
  ] }),
  profile: (name) => ({ page: 'profile', eyebrow: `IL MONDO DI ${dog(name).toLocaleUpperCase('it-IT')}`, steps: [
    { title: 'Questo è il suo mondo', body: 'Qui raccogli le informazioni che rendono ogni consiglio più personale.', target: 'overview' },
    { title: 'Aggiorna quando cambia qualcosa', body: 'Foto, abitudini e dettagli seguono la vostra storia mentre cresce.', target: 'conversation' },
    { title: 'Il profilo cresce con voi', body: 'Ogni momento condiviso aiuta DOGly a conoscerlo meglio.', target: 'overview' },
  ] }),
  settings: () => ({ page: 'settings', eyebrow: 'DOGly, COME PIACE A VOI', steps: [
    { title: 'Scegli il vostro ritmo', body: 'Qui puoi rendere DOGly più adatto alle vostre abitudini.', target: 'overview' },
    { title: 'Trovi tutto in un posto', body: 'Notifiche, aiuto e preferenze sono sempre a portata di mano.', target: 'conversation' },
    { title: 'Puoi cambiare idea', body: 'Le preferenze restano modificabili quando vuoi.', target: 'overview' },
  ] }),
  games: () => ({ page: 'games', eyebrow: 'TEMPO DI GIOCARE', steps: [
    { title: 'Un gioco per conoscersi', body: 'Piccole sfide, pensate per osservare e divertirvi insieme.', target: 'overview' },
    { title: 'Nessuna gara da vincere', body: 'Segui il suo ritmo e fermati quando ne ha abbastanza.', target: 'conversation' },
    { title: 'Pronti? Si parte', body: 'Scegli un gioco e lascia che sia lui a guidare il momento.', target: 'overview' },
  ] }),
};

const english: Record<GuidePage, (name: string) => GuidePageDefinition> = {
  ask: (name) => ({
    page: 'ask',
    eyebrow: `GET TO KNOW ${dog(name).toLocaleUpperCase('en-US')}`,
    steps: [
      { title: `Let’s start with ${dog(name)}!`, body: 'Write a question here. I’ll help you understand them better.', target: 'composer' },
      { title: 'Talk to me your way', body: 'Add a photo, a video or dictate a voice note whenever you like.', target: 'media' },
      { title: 'Everything stays in their world', body: `Find ${dog(name)}’s analyses, moments and answers here.`, target: 'conversation' },
    ],
  }),
  home: (name) => ({ page: 'home', eyebrow: `${dog(name).toLocaleUpperCase('en-US')}’S WORLD`, steps: [
    { title: 'Today, at a glance', body: 'This is your starting point for understanding how the day is going.', target: 'overview' },
    { title: 'One question is a step forward', body: 'Tell DOGly what you noticed, even in just a few words.', target: 'conversation' },
    { title: 'Everything close at paw', body: 'Diary, agenda and social stay together without complicated paths.', target: 'overview' },
  ] }),
  diary: () => ({ page: 'diary', eyebrow: 'DOGLY DIARY', steps: [
    { title: 'Moments become a story here', body: 'Every photo, video or note becomes something useful to revisit.', target: 'overview' },
    { title: 'We notice the signals together', body: 'Open a moment to explore what their behaviour may be telling you.', target: 'conversation' },
    { title: 'You do not have to remember everything', body: 'DOGly keeps the thread of your observations for you.', target: 'overview' },
  ] }),
  agenda: () => ({ page: 'agenda', eyebrow: 'DOGLY AGENDA', steps: [
    { title: 'A reminder at the right time', body: 'Vaccines, visits and care stay organised in one place.', target: 'overview' },
    { title: 'Mark what is done', body: 'Each appointment can be updated from its own card, without hunting through screens.', target: 'conversation' },
    { title: 'Keep the day light', body: 'DOGly remembers the essentials and leaves room for time together.', target: 'overview' },
  ] }),
  nutrition: () => ({ page: 'nutrition', eyebrow: 'DOGLY PANTRY', steps: [
    { title: 'Get to know what they eat', body: 'Save foods and notes to understand what helps them feel good.', target: 'overview' },
    { title: 'A photo can be enough', body: 'Show me a label or a bowl when you want a closer look.', target: 'media' },
    { title: 'Keep choices simple', body: 'Find their favourite foods again without starting over.', target: 'overview' },
  ] }),
  social: () => ({ page: 'social', eyebrow: 'YOUR WORLD TOGETHER', steps: [
    { title: 'Find places made for you', body: 'Discover dog-friendly places and ideas for going out together.', target: 'overview' },
    { title: 'Take your time choosing', body: 'Open a place to see what is nearby and what to expect.', target: 'conversation' },
    { title: 'The map stays yours', body: 'Come back whenever you feel like changing the scenery.', target: 'overview' },
  ] }),
  profile: (name) => ({ page: 'profile', eyebrow: `${dog(name).toLocaleUpperCase('en-US')}’S WORLD`, steps: [
    { title: 'This is their world', body: 'Keep the details that make every suggestion more personal.', target: 'overview' },
    { title: 'Update it as life changes', body: 'Photos, habits and details grow with your story together.', target: 'conversation' },
    { title: 'Their profile grows with you', body: 'Every shared moment helps DOGly understand them better.', target: 'overview' },
  ] }),
  settings: () => ({ page: 'settings', eyebrow: 'DOGLY, YOUR WAY', steps: [
    { title: 'Choose your rhythm', body: 'Make DOGly fit the way you and your dog live.', target: 'overview' },
    { title: 'Everything is in one place', body: 'Notifications, help and preferences are always close by.', target: 'conversation' },
    { title: 'You can change your mind', body: 'Your preferences can be updated whenever you like.', target: 'overview' },
  ] }),
  games: () => ({ page: 'games', eyebrow: 'TIME TO PLAY', steps: [
    { title: 'A game for getting closer', body: 'Small challenges designed to help you observe and enjoy time together.', target: 'overview' },
    { title: 'There is no race to win', body: 'Follow their pace and stop when they have had enough.', target: 'conversation' },
    { title: 'Ready? Let’s go', body: 'Choose a game and let them lead the moment.', target: 'overview' },
  ] }),
};

export function guideForPage(page: GuidePage, locale: GuideLocale, dogName = '') {
  return (locale === 'en' ? english : italian)[page](dogName);
}

export function guidePageForPath(pathname: string): GuidePage | null {
  const path = pathname.toLocaleLowerCase();
  if (path.includes('ask')) return 'ask';
  if (path.includes('settings') || path.includes('help') || path.includes('aiuto')) return 'settings';
  if (path.includes('diary')) return 'diary';
  if (path.includes('care') || path.includes('agenda') || path.includes('notifications')) return 'agenda';
  if (path.includes('nutrition') || path.includes('foods')) return 'nutrition';
  if (path.includes('social') || path.includes('around')) return 'social';
  if (path.includes('rocky') || path.includes('/dogs')) return 'profile';
  if (path.includes('games')) return 'games';
  if (path === '/' || path.includes('/home')) return 'home';
  return null;
}
