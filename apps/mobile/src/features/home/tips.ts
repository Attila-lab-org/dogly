/**
 * Consigli Home: frasi di vita quotidiana sul cane, non diagnosi.
 * Scelti a caso tra quelli che combaciano con età / razza / sesso.
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
};

export type HomeTip = {
  id: string;
  title: string;
  body: string;
};

type ResolvedDog = HomeTipDog & {
  years: number | null;
  puppy: boolean;
  senior: boolean;
  energetic: boolean;
};

type TipTemplate = {
  id: string;
  title: string;
  body: string;
  matches?: (dog: ResolvedDog) => boolean;
};

const ENERGETIC_BREED =
  /labrador|retriever|border collie|husky|malinois|pastore|pointer|setter|spaniel|terrier|beagle|boxer|dalmata/i;

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
    id: 'small-moment',
    title: 'Ogni piccolo momento racconta qualcosa.',
    body: 'Insieme capiamo il mondo di {name}.',
  },
  {
    id: 'calm-hello',
    title: '{name} legge i tuoi tempi.',
    body: 'Un saluto calmo all’ingresso {him} aiuta a capire che sei tu, e che può rilassarsi.',
  },
  {
    id: 'watch-before',
    title: 'Guarda {name} prima di intervenire.',
    body: 'Spesso basta un attimo di osservazione per capire se cerca gioco, spazio o solo compagnia.',
  },
  {
    id: 'sniff-walk',
    title: 'Il naso è il {his} superpotere.',
    body: 'Qualche minuto di annusate lente vale più di una camminata tutta dritta.',
  },
  {
    id: 'rest-is-talk',
    title: 'Anche il riposo è un messaggio.',
    body: 'Se {name} si accuccia vicino a te, sta dicendo che in quel momento si fida.',
  },
  {
    id: 'soft-voice',
    title: 'La voce conta quanto le parole.',
    body: 'Un tono basso e lento aiuta {name} a capire che non c’è urgenza.',
  },
  {
    id: 'choice',
    title: 'Lascia a {name} una scelta piccola.',
    body: 'Avvicinarsi da solo, o fare un passo indietro, è già una conversazione.',
  },
  {
    id: 'play-pause',
    title: 'Il gioco migliore ha delle pause.',
    body: 'Fermarsi un attimo e riprendere insegna a {name} che l’eccitazione può scendere.',
  },
  {
    id: 'same-spot',
    title: 'Un angolo suo, sempre lo stesso.',
    body: 'Un posto prevedibile aiuta {name} a spegnersi dopo le emozioni della giornata.',
  },
  {
    id: 'puppy-chew',
    title: 'A questa età la bocca esplora il mondo.',
    body: 'Offri a {name} qualcosa di lecito da masticare prima che trovi {his} alternativa.',
    matches: (dog) => dog.puppy,
  },
  {
    id: 'puppy-sleep',
    title: 'I cuccioli imparano anche dormendo.',
    body: '{name} ha bisogno di tanti micro-riposi: dopo il gioco, un nido quieto aiuta più di uno stimolo in più.',
    matches: (dog) => dog.puppy,
  },
  {
    id: 'senior-pace',
    title: 'Il {his} ritmo è cambiato, ed è normale.',
    body: 'Uscite più corte e pause per annusare fanno sentire {name} ancora parte della giornata.',
    matches: (dog) => dog.senior,
  },
  {
    id: 'senior-soft',
    title: 'Meno rumore, più chiarezza.',
    body: 'Avvicinati a {name} dal lato visibile e parla piano: gli anziani leggono meglio i gesti lenti.',
    matches: (dog) => dog.senior,
  },
  {
    id: 'energy-brain',
    title: 'A {name} serve anche la testa, non solo le zampe.',
    body: 'Un gioco di nascondino o un tapis da annusare scarica più di una corsa infinita.',
    matches: (dog) => dog.energetic,
  },
  {
    id: 'energy-cool',
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
    title: fill(template.title, dog),
    body: fill(template.body, dog),
  };
}

function pickFrom(
  pool: TipTemplate[],
  rng: () => number,
): TipTemplate {
  if (pool.length === 0) return TEMPLATES[0];
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[Math.max(0, index)];
}

/** Un consiglio a caso, filtrato sul profilo del cane. */
export function pickHomeTip(
  dog: HomeTipDog,
  rng: () => number = Math.random,
): HomeTip {
  const resolved = resolveDog(dog);
  return renderTip(pickFrom(matchingTemplates(resolved), rng), resolved);
}

/** Prossimo consiglio diverso da quello già visibile, se possibile. */
export function nextHomeTip(
  dog: HomeTipDog,
  currentId: string | null,
  rng: () => number = Math.random,
): HomeTip {
  const resolved = resolveDog(dog);
  const pool = matchingTemplates(resolved);
  const others = pool.filter((tip) => tip.id !== currentId);
  return renderTip(pickFrom(others.length > 0 ? others : pool, rng), resolved);
}
