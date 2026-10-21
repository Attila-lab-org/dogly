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
  | 'games'
  | 'games-match'
  | 'games-squirrel'
  | 'games-agility';

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
  // Regole dichiarate qui = regole del gioco: tenerle allineate agli intro.
  'games-match': () => ({ page: 'games-match', eyebrow: 'BAU MATCH', steps: [
    { title: 'Scambia e scoppia', body: 'Tocca due tessere vicine per scambiarle: 3 o più in fila scoppiano.', target: 'overview' },
    { title: 'Catene e razzi', body: 'Le cascate alzano il moltiplicatore; una fila da 4+ crea un razzo che libera riga o colonna.', target: 'conversation' },
    { title: 'Tre vite, zero cronometro', body: 'Uno scambio che non scoppia nulla costa una vita. Raggiungi l’obiettivo punti e sali di livello, con calma.', target: 'overview' },
  ] }),
  'games-squirrel': () => ({ page: 'games-squirrel', eyebrow: 'CACCIA AGLI SCOIATTOLI', steps: [
    { title: 'Sbucano dalle buche', body: 'Per 30 secondi gli scoiattoli spuntano qua e là: toccali prima che rientrino.', target: 'overview' },
    { title: 'Il dorato vale triplo', body: 'Lo scoiattolo dorato compare di rado e vale 3 punti. Il riccio è un amico: lascialo stare.', target: 'conversation' },
    { title: 'Niente vite, solo riflessi', body: 'Non si può perdere: conta solo quanti ne acchiappi prima del via libera.', target: 'overview' },
  ] }),
  'games-agility': () => ({ page: 'games-agility', eyebrow: 'AGILITY', steps: [
    { title: 'Un tap per saltare', body: 'Muretti, birilli e anche il tunnel si superano con lo stesso gesto: un salto.', target: 'overview' },
    { title: 'Tre cuori e via', body: 'Ogni ostacolo colpito toglie un cuore; finiti i cuori la corsa è finita. Un tap in extremis salva comunque.', target: 'conversation' },
    { title: 'Ossicini in arcata', body: 'Gli ossicini sospesi si raccolgono solo in salto e valgono punti extra.', target: 'overview' },
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
  // The rules stated here are the rules of the game: keep them in sync.
  'games-match': () => ({ page: 'games-match', eyebrow: 'BAU MATCH', steps: [
    { title: 'Swap and pop', body: 'Tap two neighbouring tiles to swap them: 3 or more in a row pop.', target: 'overview' },
    { title: 'Chains and rockets', body: 'Cascades raise the multiplier; a row of 4+ creates a rocket that clears a line.', target: 'conversation' },
    { title: 'Three lives, no timer', body: 'A swap that pops nothing costs a life. Reach the points goal to level up, at your own pace.', target: 'overview' },
  ] }),
  'games-squirrel': () => ({ page: 'games-squirrel', eyebrow: 'SQUIRREL HUNT', steps: [
    { title: 'They pop out of holes', body: 'For 30 seconds squirrels peek out here and there: tap them before they duck back.', target: 'overview' },
    { title: 'Golden is worth triple', body: 'The golden squirrel is rare and worth 3 points. The hedgehog is a friend: leave it alone.', target: 'conversation' },
    { title: 'No lives, just reflexes', body: 'You cannot lose: only how many you catch before time is up counts.', target: 'overview' },
  ] }),
  'games-agility': () => ({ page: 'games-agility', eyebrow: 'AGILITY', steps: [
    { title: 'One tap to jump', body: 'Hurdles, cones and even the tunnel are all cleared with the same move: a jump.', target: 'overview' },
    { title: 'Three hearts and go', body: 'Every obstacle hit costs a heart; when they are gone, the run is over. A last-instant tap still saves you.', target: 'conversation' },
    { title: 'Bones in an arc', body: 'Floating bones can only be collected mid-jump and are worth extra points.', target: 'overview' },
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
  // I giochi montano la propria guida per-gioco (PageGuide): niente guida
  // automatica da route qui, altrimenti apparirebbe due volte.
  if (path.includes('games')) return null;
  if (path === '/' || path.includes('/home')) return 'home';
  return null;
}
