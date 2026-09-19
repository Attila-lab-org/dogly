/**
 * Banner Home: mix di consigli, inviti a usare l’app e novità oneste.
 * Mai diagnosi. Il testo si adatta al cane; le CTA aprono flussi reali.
 */
import {
  ageFromBirthDate,
  ageYearsFromLabel,
} from '../dogs/profileDates';

export type HomeTipDog = {
  id: string;
  name: string;
  birthDate: string | null;
  ageLabel: string;
  breedLabel: string | null;
  sex: 'MALE' | 'FEMALE' | 'UNKNOWN' | null;
  photoUri?: string | null;
};

export type HomeBannerKind = 'advice' | 'use' | 'news';

export type HomeBannerAction =
  | 'analyze'
  | 'realtime'
  | 'stories'
  | 'diary'
  | 'digestive'
  | 'profile';

export type HomeTip = {
  id: string;
  kind: HomeBannerKind;
  title: string;
  body: string;
  ctaLabel: string | null;
  action: HomeBannerAction | null;
};

type ResolvedDog = HomeTipDog & {
  years: number | null;
  puppy: boolean;
  senior: boolean;
  energetic: boolean;
  profileThin: boolean;
};

type TipTemplate = {
  id: string;
  kind: HomeBannerKind;
  title: string;
  body: string;
  ctaLabel?: string;
  action?: HomeBannerAction;
  matches?: (dog: ResolvedDog) => boolean;
};

const ENERGETIC_BREED =
  /labrador|retriever|border collie|husky|malinois|pastore|pointer|setter|spaniel|terrier|beagle|boxer|dalmata/i;

export const HOME_BANNER_KIND_LABEL: Record<HomeBannerKind, string> = {
  advice: 'Consiglio',
  use: 'Prova',
  news: 'Novità',
};

function resolveDog(dog: HomeTipDog): ResolvedDog {
  const years = dog.birthDate
    ? ageFromBirthDate(dog.birthDate)
    : ageYearsFromLabel(dog.ageLabel);
  return {
    ...dog,
    name: dog.name.trim() || 'il tuo cane',
    years,
    puppy: years !== null && years < 2,
    senior: years !== null && years >= 8,
    energetic: ENERGETIC_BREED.test(dog.breedLabel ?? ''),
    profileThin: !dog.breedLabel || !dog.photoUri || !dog.birthDate,
  };
}

function fill(text: string, dog: ResolvedDog): string {
  const him = dog.sex === 'FEMALE' ? 'la' : 'lo';
  const his = dog.sex === 'FEMALE' ? 'sua' : 'suo';
  const hers = dog.sex === 'FEMALE' ? 'le' : 'gli';
  return text
    .replaceAll('{name}', dog.name)
    .replaceAll('{him}', him)
    .replaceAll('{his}', his)
    .replaceAll('{hers}', hers)
    .replaceAll('{breed}', dog.breedLabel?.trim() || 'cane');
}

const TEMPLATES: TipTemplate[] = [
  {
    id: 'use-analyze',
    kind: 'use',
    title: 'Capire {name} parte da un momento.',
    body: 'Un video breve, oppure due parole a voce: tu scegli.',
    ctaLabel: 'Analizza',
    action: 'analyze',
  },
  {
    id: 'use-audio',
    kind: 'use',
    title: 'Se non hai il telefono puntato, parliamone.',
    body: 'Raccontami cosa ha fatto {name}: a volte la voce basta.',
    ctaLabel: 'Parla',
    action: 'realtime',
  },
  {
    id: 'use-story',
    kind: 'use',
    title: 'Oggi di {name} può restare una storia.',
    body: 'Una foto nella rail, visibile 24 ore, poi sparisce da sola.',
    ctaLabel: 'Aggiungi storia',
    action: 'stories',
  },
  {
    id: 'use-diary',
    kind: 'use',
    title: 'Le letture stanno nel diario.',
    body: 'Riapri un momento di {name} e dimmi se ci abbiamo preso.',
    ctaLabel: 'Apri il diario',
    action: 'diary',
  },
  {
    id: 'use-digestive',
    kind: 'use',
    title: 'La digestione ha un posto suo.',
    body: 'Lì sì, serve una foto. Non è il flusso dei momenti.',
    ctaLabel: 'Controlla',
    action: 'digestive',
  },
  {
    id: 'use-profile',
    kind: 'use',
    title: 'Più so di {name}, più le letture sono sue.',
    body: 'Razza, età e una foto nel profilo aiutano le prossime analisi.',
    ctaLabel: 'Completa il profilo',
    action: 'profile',
    matches: (dog) => dog.profileThin,
  },
  {
    id: 'news-video-audio',
    kind: 'news',
    title: 'Per i momenti: video o voce.',
    body: 'Le foto restano sulla digestione. Così ogni gesto ha il suo posto.',
    ctaLabel: 'Prova',
    action: 'analyze',
  },
  {
    id: 'news-hypothesis',
    kind: 'news',
    title: 'Non diamo etichette a {name}.',
    body: 'Diciamo cosa sembra. Tu confermi, e insieme diventiamo più sicuri.',
    ctaLabel: 'Vedi le letture',
    action: 'diary',
  },
  {
    id: 'news-stories',
    kind: 'news',
    title: 'Le storie durano un giorno, ed è voluto.',
    body: 'Un ricordo breve di {name}, senza archivio infinito in Home.',
    ctaLabel: 'Aggiungi storia',
    action: 'stories',
  },
  {
    id: 'news-talk',
    kind: 'news',
    title: 'Puoi anche solo parlarmi.',
    body: 'Se il video non c’è, dimmi cosa hai notato di {name}.',
    ctaLabel: 'Parla',
    action: 'realtime',
  },
  {
    id: 'small-moment',
    kind: 'advice',
    title: 'Ogni piccolo momento racconta qualcosa.',
    body: 'Insieme capiamo il mondo di {name}.',
  },
  {
    id: 'calm-hello',
    kind: 'advice',
    title: '{name} legge i tuoi tempi.',
    body: 'Un saluto calmo all’ingresso {him} aiuta a capire che sei tu, e che può rilassarsi.',
  },
  {
    id: 'watch-before',
    kind: 'advice',
    title: 'Guarda {name} prima di intervenire.',
    body: 'Spesso basta un attimo di osservazione per capire se cerca gioco, spazio o solo compagnia.',
  },
  {
    id: 'sniff-walk',
    kind: 'advice',
    title: 'Il naso è il {his} superpotere.',
    body: 'Qualche minuto di annusate lente vale più di una camminata tutta dritta.',
  },
  {
    id: 'rest-is-talk',
    kind: 'advice',
    title: 'Anche il riposo è un messaggio.',
    body: 'Se {name} si accuccia vicino a te, sta dicendo che in quel momento si fida.',
  },
  {
    id: 'play-pause',
    kind: 'advice',
    title: 'Il gioco migliore ha delle pause.',
    body: 'Fermarsi un attimo e riprendere insegna a {name} che l’eccitazione può scendere.',
  },
  {
    id: 'puppy-chew',
    kind: 'advice',
    title: 'A questa età la bocca esplora il mondo.',
    body: 'Offri a {name} qualcosa di lecito da masticare prima che trovi {his} alternativa.',
    matches: (dog) => dog.puppy,
  },
  {
    id: 'puppy-sleep',
    kind: 'advice',
    title: 'I cuccioli imparano anche dormendo.',
    body: '{name} ha bisogno di tanti micro-riposi: dopo il gioco, un nido quieto aiuta più di uno stimolo in più.',
    matches: (dog) => dog.puppy,
  },
  {
    id: 'senior-pace',
    kind: 'advice',
    title: 'Il {his} ritmo è cambiato, ed è normale.',
    body: 'Uscite più corte e pause per annusare fanno sentire {name} ancora parte della giornata.',
    matches: (dog) => dog.senior,
  },
  {
    id: 'senior-soft',
    kind: 'advice',
    title: 'Meno rumore, più chiarezza.',
    body: 'Avvicinati a {name} dal lato visibile e parla piano: gli anziani leggono meglio i gesti lenti.',
    matches: (dog) => dog.senior,
  },
  {
    id: 'energy-brain',
    kind: 'advice',
    title: 'A {name} serve anche la testa, non solo le zampe.',
    body: 'Un gioco di nascondino o un tapis da annusare scarica più di una corsa infinita.',
    matches: (dog) => dog.energetic,
  },
  {
    id: 'energy-cool',
    kind: 'advice',
    title: 'Dopo il fuoco, un atterraggio morbido.',
    body: 'Due minuti di coccole lente o di masticazione calma aiutano {name} a scendere di giri.',
    matches: (dog) => dog.energetic,
  },
];

function matchingTemplates(dog: ResolvedDog): TipTemplate[] {
  const matched = TEMPLATES.filter((tip) => !tip.matches || tip.matches(dog));
  return matched.length > 0 ? matched : TEMPLATES.slice(0, 1);
}

function renderTip(template: TipTemplate, dog: ResolvedDog): HomeTip {
  return {
    id: template.id,
    kind: template.kind,
    title: fill(template.title, dog),
    body: fill(template.body, dog),
    ctaLabel: template.ctaLabel ?? null,
    action: template.action ?? null,
  };
}

function pickFrom(pool: TipTemplate[], rng: () => number): TipTemplate {
  if (pool.length === 0) return TEMPLATES[0];
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[Math.max(0, index)];
}

function pickBucket(
  pool: TipTemplate[],
  rng: () => number,
): TipTemplate[] {
  const use = pool.filter((tip) => tip.kind === 'use');
  const news = pool.filter((tip) => tip.kind === 'news');
  const advice = pool.filter((tip) => tip.kind === 'advice');
  const roll = rng();
  if (roll < 0.45 && use.length > 0) return use;
  if (roll < 0.65 && news.length > 0) return news;
  if (advice.length > 0) return advice;
  return pool;
}

export function pickHomeTip(
  dog: HomeTipDog,
  rng: () => number = Math.random,
): HomeTip {
  const resolved = resolveDog(dog);
  const pool = matchingTemplates(resolved);
  return renderTip(pickFrom(pickBucket(pool, rng), rng), resolved);
}

export function nextHomeTip(
  dog: HomeTipDog,
  currentId: string | null,
  rng: () => number = Math.random,
): HomeTip {
  const resolved = resolveDog(dog);
  const pool = matchingTemplates(resolved);
  const others = pool.filter((tip) => tip.id !== currentId);
  const source = others.length > 0 ? others : pool;
  return renderTip(pickFrom(pickBucket(source, rng), rng), resolved);
}
