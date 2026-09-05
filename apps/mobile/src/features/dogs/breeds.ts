/**
 * Catalogo locale per una selezione rapida e disponibile offline.
 * Nomenclatura italiana basata sull’elenco ENCI delle razze riconosciute
 * (aggiornamento 6 luglio 2026).
 * Fonte: https://www.enci.it/media/7967/elenco_razze_canine.pdf
 */
export const UNKNOWN_BREED_LABEL = null;
export const MIXED_BREED_LABEL = 'Mix';

export type BreedSelection =
  | { kind: 'unselected' }
  | { kind: 'unknown' }
  | { kind: 'mixed' }
  | { kind: 'breed'; name: string };

export const DOG_BREEDS = [
  'Affenpinscher',
  'Airedale Terrier',
  'Akita',
  'Akita Americano',
  'Alano',
  'Alaskan Malamute',
  'American Staffordshire Terrier',
  'Australian Cattle Dog',
  'Australian Shepherd',
  'Barbone',
  'Basenji',
  'Basset Hound',
  'Bassotto',
  'Beagle',
  'Bearded Collie',
  'Bedlington Terrier',
  'Bichon Frisé',
  'Bobtail',
  'Bolognese',
  'Border Collie',
  'Boston Terrier',
  'Bovaro del Bernese',
  'Bovaro delle Fiandre',
  'Bovaro dell’Appenzell',
  'Bovaro dell’Entlebuch',
  'Boxer',
  'Bracco Italiano',
  'Bull Terrier',
  'Bulldog',
  'Bulldog Francese',
  'Bullmastiff',
  'Cairn Terrier',
  'Cane Corso',
  'Cane da Pastore Abruzzese Maremmano',
  'Cane da Pastore Belga',
  'Cane da Pastore Bergamasco',
  'Cane da Pastore Olandese',
  'Cane Lupo Cecoslovacco',
  'Cane Lupo di Saarloos',
  'Cavalier King Charles Spaniel',
  'Chihuahua',
  'Chow Chow',
  'Cirneco dell’Etna',
  'Cocker Spaniel Americano',
  'Cocker Spaniel Inglese',
  'Collie a Pelo Corto',
  'Collie a Pelo Lungo',
  'Dalmata',
  'Dobermann',
  'Dogo Argentino',
  'Dogue de Bordeaux',
  'Epagneul Breton',
  'Fox Terrier a Pelo Liscio',
  'Fox Terrier a Pelo Ruvido',
  'Golden Retriever',
  'Gordon Setter',
  'Greyhound',
  'Hovawart',
  'Irish Terrier',
  'Jack Russell Terrier',
  'Labrador Retriever',
  'Lagotto Romagnolo',
  'Leonberger',
  'Levriero Afgano',
  'Levriero Irlandese',
  'Lhasa Apso',
  'Maltese',
  'Manchester Terrier',
  'Mastiff',
  'Mastino Napoletano',
  'Norfolk Terrier',
  'Norwich Terrier',
  'Nova Scotia Duck Tolling Retriever',
  'Pastore Australiano Kelpie',
  'Pastore Scozzese Shetland',
  'Pastore Svizzero Bianco',
  'Pastore Tedesco',
  'Pechinese',
  'Piccolo Levriero Italiano',
  'Pinscher',
  'Pointer Inglese',
  'Pomerania',
  'Pudelpointer',
  'Rhodesian Ridgeback',
  'Rottweiler',
  'Samoiedo',
  'San Bernardo',
  'Schnauzer',
  'Schnauzer Gigante',
  'Schnauzer Nano',
  'Scottish Terrier',
  'Segugio Italiano a Pelo Forte',
  'Segugio Italiano a Pelo Raso',
  'Setter Inglese',
  'Setter Irlandese',
  'Shar Pei',
  'Shiba',
  'Shih Tzu',
  'Siberian Husky',
  'Spinone Italiano',
  'Spitz Giapponese',
  'Spitz Tedesco',
  'Staffordshire Bull Terrier',
  'Terranova',
  'Tibetan Terrier',
  'Volpino Italiano',
  'Weimaraner',
  'Welsh Corgi Cardigan',
  'Welsh Corgi Pembroke',
  'West Highland White Terrier',
  'Whippet',
  'Yorkshire Terrier',
] as const;

export type DogBreed = (typeof DOG_BREEDS)[number];

export function breedLabelFromSelection(
  selection: BreedSelection,
): string | null {
  if (selection.kind === 'breed') return selection.name;
  if (selection.kind === 'mixed') return MIXED_BREED_LABEL;
  return UNKNOWN_BREED_LABEL;
}

export function breedSelectionFromLabel(
  label: string | null,
): BreedSelection {
  if (!label) return { kind: 'unknown' };
  if (
    label === MIXED_BREED_LABEL ||
    label.toLocaleLowerCase('it') === 'incrocio'
  ) {
    return { kind: 'mixed' };
  }
  return { kind: 'breed', name: label };
}

export function filterBreeds(query: string): readonly DogBreed[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return DOG_BREEDS;
  return DOG_BREEDS.filter((breed) => normalize(breed).includes(normalizedQuery));
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it');
}
