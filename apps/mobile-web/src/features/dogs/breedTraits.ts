/**
 * Archetipi funzionali di razza per i consigli dell'hero Home.
 * Il catalogo ENCI (breeds.ts) è solo-nomi: questa mappa curata raggruppa
 * le razze in archetipi (pastori, riporto, segugi, terrier, molossi, nordici,
 * toy, levrieri, bracchi, pinscher) con consigli benessere generici e sicuri
 * per fascia oraria — niente affermazioni mediche, niente percentuali.
 * Mix → consigli per meticci; razza sconosciuta/null → consigli generici.
 */
import { MIXED_BREED_LABEL } from './breeds';
import type { LifestyleTimeAlone } from '../lifestyle/types';
import type { DayPart } from '../home/dogHeroCopy';

export type BreedArchetypeId =
  | 'herding'
  | 'retriever'
  | 'hound'
  | 'terrier'
  | 'molossi'
  | 'nordic'
  | 'toy'
  | 'sighthound'
  | 'pointer'
  | 'pinscher'
  | 'mixed'
  | 'generic';

function normalizeBreed(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('it');
}

/** Ordine significativo: le chiavi specifiche (es. "boston terrier") precedono quelle generiche ("terrier"). */
const ARCHETYPE_KEYWORDS: ReadonlyArray<{
  id: Exclude<BreedArchetypeId, 'mixed' | 'generic'>;
  keywords: readonly string[];
}> = [
  {
    id: 'toy',
    keywords: [
      'boston terrier',
      'tibetan terrier',
      'bulldog francese',
      'chihuahua',
      'maltese',
      'bolognese',
      'bichon',
      'cavalier',
      'pechinese',
      'shih tzu',
      'lhasa',
    ],
  },
  {
    id: 'herding',
    keywords: [
      'bovaro delle fiandre',
      'pastore',
      'shepherd',
      'collie',
      'corgi',
      'kelpie',
      'cattle dog',
      'bobtail',
    ],
  },
  {
    id: 'retriever',
    keywords: [
      'retriever',
      'labrador',
      'golden',
      'lagotto',
      'barbone',
      'cocker',
      'terranova',
    ],
  },
  {
    id: 'hound',
    keywords: [
      'beagle',
      'basset',
      'bassotto',
      'segugio',
      'cirneco',
      'rhodesian',
      'basenji',
    ],
  },
  {
    id: 'sighthound',
    keywords: ['levriero', 'greyhound', 'whippet'],
  },
  {
    id: 'pointer',
    keywords: ['bracco', 'pointer', 'setter', 'weimaraner', 'spinone', 'epagneul'],
  },
  { id: 'terrier', keywords: ['terrier'] },
  {
    id: 'molossi',
    keywords: [
      'bulldog',
      'boxer',
      'corso',
      'mastiff',
      'mastino',
      'dogue',
      'dogo',
      'rottweiler',
      'bovaro',
      'san bernardo',
      'leonberger',
      'hovawart',
      'alano',
      'bullmastiff',
      'shar pei',
    ],
  },
  {
    id: 'nordic',
    keywords: [
      'husky',
      'malamute',
      'samoiedo',
      'akita',
      'shiba',
      'chow chow',
      'spitz',
      'volpino',
      'pomerania',
    ],
  },
  { id: 'pinscher', keywords: ['pinscher', 'schnauzer', 'dobermann'] },
];

export function breedArchetypeFor(
  breedLabel: string | null | undefined,
): BreedArchetypeId {
  const label = breedLabel?.trim();
  if (!label) return 'generic';
  if (
    label === MIXED_BREED_LABEL ||
    label.toLocaleLowerCase('it') === 'incrocio'
  ) {
    return 'mixed';
  }
  const normalized = normalizeBreed(label);
  for (const archetype of ARCHETYPE_KEYWORDS) {
    if (archetype.keywords.some((keyword) => normalized.includes(keyword))) {
      return archetype.id;
    }
  }
  return 'generic';
}

/** Tipo di mantello stimato dall'archetipo (guida cappottino/spazzolatura). */
export type CoatType = 'double' | 'short' | 'long';

export function coatTypeFor(
  breedLabel: string | null | undefined,
): CoatType | null {
  switch (breedArchetypeFor(breedLabel)) {
    case 'nordic':
    case 'herding':
    case 'retriever':
      return 'double';
    case 'hound':
    case 'sighthound':
    case 'pinscher':
    case 'pointer':
    case 'molossi':
      return 'short';
    case 'toy':
    case 'terrier':
      return 'long';
    default:
      return null;
  }
}

/** `{breed}` viene sostituito col nome reale della razza. */
const ARCHETYPE_TIPS: Record<BreedArchetypeId, Record<DayPart, string>> = {
  herding: {
    morning:
      'Noi {breed} abbiamo la testa che corre: 10 minuti di fiuto stamattina e sono il cane più buono del mondo.',
    afternoon:
      'Ho ancora energia da vendere: un gioco di ricerca o un trucchetto nuovo mi rende felice.',
    evening:
      'Dopo una giornata a pensare e sgambettare, una carezza lenta e la mia cuccia sono il rituale perfetto.',
  },
  retriever: {
    morning:
      'Noi {breed} amiamo l’acqua e il riporto: una passeggiata allegra stamattina mi accende il sorriso.',
    afternoon:
      'Lancia, riporta, ripeti: è il mio gioco preferito, lo sai. Anche in corridoio va benissimo.',
    evening:
      'La sera mi piace stare vicino a voi: una spazzolata dolce e sono in pace.',
  },
  hound: {
    morning:
      'Il mio naso comanda: una passeggiata lenta piena di odori è la mia colazione preferita.',
    afternoon:
      'Nascondimi un bocconcino in casa: seguire la pista è la cosa più bella che so fare.',
    evening:
      'Tante piste annusate stancano anche me: stasera solo coccole e riposo.',
  },
  terrier: {
    morning:
      'Sono una molla: una bella corsetta stamattina e poi affrontiamo la giornata!',
    afternoon:
      'Un gioco da smontare o una palla da rincorrere: la noia non fa per me.',
    evening:
      'Ho dato tutto oggi: una copertina e il mio posto accanto a te, grazie.',
  },
  molossi: {
    morning:
      'Noi {breed} siamo forti ma pacati: una passeggiata tranquilla al fresco è il mio ideale.',
    afternoon:
      'Poca fatica ma tanta compagnia: un gioco calmo insieme mi basta e mi avanza.',
    evening:
      'La sera sono un peso massimo di dolcezza: c’è posto per me sul divano?',
  },
  nordic: {
    morning:
      'Ho il freddo nel sangue: al mattino presto, con l’aria fresca, cammino che è una meraviglia.',
    afternoon:
      'Nelle ore calde preferisco l’ombra: un gioco tranquillo in casa e la mia ciotola sempre fresca.',
    evening:
      'Con la frescura serale torno in forma: una passeggiata quietta sotto le stelle, che ne dici?',
  },
  toy: {
    morning:
      'Piccolo ma curioso: un giretto tranquillo con tanti annusamenti mi fa iniziare bene la giornata.',
    afternoon:
      'Un gioco morbido o un trucchetto nuovo: la mia mente è molto più grande di me!',
    evening:
      'La sera amo stare in braccio: il mio posto preferito è vicino a te.',
  },
  sighthound: {
    morning:
      'Sono un fulmine elegante: uno scatto breve stamattina e poi relax da campione.',
    afternoon:
      'Pochi minuti di inseguimento in un posto sicuro mi bastano: poi torno a poltrire.',
    evening:
      'Queste zampe lunghe amano i cuscini: stasera solo morbidezza, per favore.',
  },
  pointer: {
    morning:
      'Naso a terra e coda dritta: una passeggiata di esplorazione è la mia felicità.',
    afternoon:
      'Nascondimi qualcosa da trovare: puntare e scovare ce l’ho scritto dentro.',
    evening:
      'Dopo tante avventure (anche solo immaginate), la sera sto vicino al mio branco: voi.',
  },
  pinscher: {
    morning:
      'Vigile e sveglio: un giro del quartiere a ispezionare tutto, come piace a me.',
    afternoon:
      'Un piccolo addestramento o un gioco di attivazione: adoro imparare cose nuove.',
    evening:
      'Finito il turno di guardia, la sera voglio solo la mia famiglia.',
  },
  mixed: {
    morning:
      'Noi meticci siamo un cocktail unico: scopriamo insieme cosa mi piace di più.',
    afternoon:
      'Ogni giorno mi accende una cosa diversa: osservami e capirai cosa mi piace davvero.',
    evening:
      'Qualunque sia il mio mix, la sera il mio posto preferito è accanto a te.',
  },
  generic: {
    morning:
      'Ogni cane è unico: una bella passeggiata al nostro ritmo è sempre una buona idea.',
    afternoon:
      'Un po’ di gioco insieme tiene svegli la mente e il cuore.',
    evening:
      'La sera è fatta per la calma: un rituale dolce e la nanna viene da sé.',
  },
};

const TIME_ALONE_MANY_HOURS_TIP =
  'Quando resto solo tante ore, un gioco da riempire con i bocconcini mi fa compagnia: preparalo prima di uscire.';

/**
 * Consiglio del giorno per l'hero: archetipo di razza + fascia oraria.
 * Se il lifestyle dice che il cane resta solo molte ore, il consiglio di
 * arricchimento sostituisce quello di fascia (è più utile al proprietario).
 */
export function breedTipFor(
  breedLabel: string | null | undefined,
  dayPart: DayPart,
  options: { timeAlone?: LifestyleTimeAlone | null } = {},
): string {
  if (options.timeAlone === 'MANY_HOURS') return TIME_ALONE_MANY_HOURS_TIP;
  const archetype = breedArchetypeFor(breedLabel);
  const tip = ARCHETYPE_TIPS[archetype][dayPart];
  return tip.replaceAll('{breed}', breedLabel?.trim() || 'cani');
}
