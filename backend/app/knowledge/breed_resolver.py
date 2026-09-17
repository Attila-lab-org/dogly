"""Deterministic breed resolver for Intelligence V3.

Resolves an owner-entered Italian/English label to a curated Dogly taxon.
Mix and unknown never receive a named-breed prior. The observer never sees
the breed name — only optional verified morphology hints.
"""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from typing import Literal

from pydantic import BaseModel, Field

FunctionalGroup = Literal[
    "HERDING",
    "RETRIEVING",
    "SIGHTHOUND",
    "GUARDIAN",
    "COMPANION",
    "TERRIER",
    "SPITZ",
    "SCENTHOUND",
    "UNKNOWN",
    "MIX",
]

ResolutionStatus = Literal["NAMED", "MIX", "UNKNOWN"]


class MorphologyHints(BaseModel):
    ear_carriage: str | None = None
    tail_carriage: str | None = None
    muzzle: str | None = None
    coat_visibility: str | None = None
    size_hint: str | None = None


class BreedRecord(BaseModel):
    id: str
    display_name: str
    functional_group: FunctionalGroup
    aliases: list[str] = Field(default_factory=list)
    morphology: MorphologyHints = Field(default_factory=MorphologyHints)


class BreedResolution(BaseModel):
    status: ResolutionStatus
    input_label: str | None = None
    is_mix: bool = False
    canonical_id: str | None = None
    display_name: str | None = None
    functional_group: FunctionalGroup = "UNKNOWN"
    confidence: Literal["HIGH", "MEDIUM", "LOW", "NONE"] = "NONE"
    morphology: MorphologyHints | None = None
    prior_eligible: bool = False
    reasons: list[str] = Field(default_factory=list)

    def observer_safe_morphology(self) -> dict[str, str] | None:
        if self.morphology is None:
            return None
        payload = {
            key: value
            for key, value in self.morphology.model_dump().items()
            if value
        }
        return payload or None


_PUNCT_RE = re.compile(r"[^a-z0-9]+")


def normalize_breed_label(value: str | None) -> str:
    text = unicodedata.normalize("NFKD", (value or "").strip().lower())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("’", " ").replace("'", " ").replace("`", " ")
    return _PUNCT_RE.sub(" ", text).strip()


_MIX_LABELS = frozenset(
    {
        "mix",
        "misto",
        "meticcio",
        "incrocio",
        "mixed",
        "mixed breed",
        "crossbreed",
        "cross",
    }
)
_UNKNOWN_LABELS = frozenset(
    {
        "",
        "unknown",
        "sconosciuto",
        "sconosciuta",
        "non so",
        "non lo so",
        "non specificata",
        "non specificato",
        "altro",
        "other",
        "n a",
        "na",
        "cane",
        "dog",
    }
)


def _record(
    breed_id: str,
    display_name: str,
    group: FunctionalGroup,
    aliases: list[str] | None = None,
    **morphology: str,
) -> BreedRecord:
    return BreedRecord(
        id=breed_id,
        display_name=display_name,
        functional_group=group,
        aliases=aliases or [],
        morphology=MorphologyHints(**morphology),
    )


def _catalog() -> list[BreedRecord]:
    return [
        _record("affenpinscher", "Affenpinscher", "COMPANION", ["monkey dog"], ear_carriage="erect", muzzle="brachycephalic", coat_visibility="dense", size_hint="toy"),
        _record("airedale_terrier", "Airedale Terrier", "TERRIER", ["airedale"], ear_carriage="v_fold", muzzle="mesocephalic", coat_visibility="dense", size_hint="medium"),
        _record("akita", "Akita", "SPITZ", ["akita inu"], ear_carriage="erect", tail_carriage="sickle", muzzle="mesocephalic", coat_visibility="dense", size_hint="large"),
        _record("akita_americano", "Akita Americano", "SPITZ", ["american akita"], ear_carriage="erect", tail_carriage="sickle", muzzle="mesocephalic", coat_visibility="dense", size_hint="large"),
        _record("alano", "Alano", "GUARDIAN", ["great dane", "alano tedesco"], ear_carriage="natural_drop", muzzle="mesocephalic", size_hint="giant"),
        _record("alaskan_malamute", "Alaskan Malamute", "SPITZ", ["malamute"], ear_carriage="erect", tail_carriage="sickle", coat_visibility="dense", size_hint="large"),
        _record("american_staffordshire_terrier", "American Staffordshire Terrier", "TERRIER", ["amstaff", "american staffordshire"], ear_carriage="semi", muzzle="mesocephalic", size_hint="medium"),
        _record("australian_cattle_dog", "Australian Cattle Dog", "HERDING", ["cattle dog", "heeler"], ear_carriage="erect", muzzle="mesocephalic", size_hint="medium"),
        _record("australian_shepherd", "Australian Shepherd", "HERDING", ["aussie"], ear_carriage="semi", tail_carriage="level", muzzle="mesocephalic", size_hint="medium"),
        _record("barbone", "Barbone", "COMPANION", ["barboncino", "poodle", "standard poodle"], ear_carriage="floppy", coat_visibility="dense", size_hint="medium"),
        _record("basenji", "Basenji", "SPITZ", [], ear_carriage="erect", tail_carriage="sickle", muzzle="mesocephalic", size_hint="small"),
        _record("basset_hound", "Basset Hound", "SCENTHOUND", ["basset"], ear_carriage="floppy", muzzle="mesocephalic", size_hint="medium"),
        _record("bassotto", "Bassotto", "SCENTHOUND", ["dachshund", "bassotto tedesco"], ear_carriage="floppy", muzzle="mesocephalic", size_hint="small"),
        _record("beagle", "Beagle", "SCENTHOUND", [], ear_carriage="floppy", muzzle="mesocephalic", size_hint="small"),
        _record("bearded_collie", "Bearded Collie", "HERDING", ["bearded"], ear_carriage="semi", coat_visibility="long", size_hint="medium"),
        _record("bedlington_terrier", "Bedlington Terrier", "TERRIER", ["bedlington"], ear_carriage="semi", coat_visibility="dense", size_hint="small"),
        _record("bichon_frise", "Bichon Frisé", "COMPANION", ["bichon"], ear_carriage="floppy", coat_visibility="dense", size_hint="toy"),
        _record("bobtail", "Bobtail", "HERDING", ["old english sheepdog"], coat_visibility="long", size_hint="large"),
        _record("bolognese", "Bolognese", "COMPANION", [], ear_carriage="floppy", coat_visibility="dense", size_hint="toy"),
        _record("border_collie", "Border Collie", "HERDING", ["border"], ear_carriage="semi", tail_carriage="level", muzzle="mesocephalic", size_hint="medium"),
        _record("boston_terrier", "Boston Terrier", "COMPANION", ["boston"], ear_carriage="erect", muzzle="brachycephalic", size_hint="small"),
        _record("bovaro_del_bernese", "Bovaro del Bernese", "GUARDIAN", ["bernese", "bernese mountain dog"], ear_carriage="floppy", coat_visibility="long", size_hint="large"),
        _record("bovaro_delle_fiandre", "Bovaro delle Fiandre", "HERDING", ["bouvier"], coat_visibility="dense", size_hint="large"),
        _record("bovaro_appenzell", "Bovaro dell’Appenzell", "HERDING", ["appenzeller"], ear_carriage="erect", size_hint="medium"),
        _record("bovaro_entlebuch", "Bovaro dell’Entlebuch", "HERDING", ["entlebucher"], ear_carriage="floppy", size_hint="medium"),
        _record("boxer", "Boxer", "GUARDIAN", [], ear_carriage="natural_drop", muzzle="brachycephalic", size_hint="large"),
        _record("bracco_italiano", "Bracco Italiano", "RETRIEVING", ["bracco"], ear_carriage="floppy", muzzle="mesocephalic", size_hint="large"),
        _record("bull_terrier", "Bull Terrier", "TERRIER", [], ear_carriage="erect", muzzle="mesocephalic", size_hint="medium"),
        _record("bulldog", "Bulldog", "COMPANION", ["english bulldog", "bulldog inglese"], ear_carriage="rose", muzzle="brachycephalic", size_hint="medium"),
        _record("bulldog_francese", "Bulldog Francese", "COMPANION", ["french bulldog", "frenchie"], ear_carriage="bat", muzzle="brachycephalic", size_hint="small"),
        _record("bullmastiff", "Bullmastiff", "GUARDIAN", [], ear_carriage="v_fold", muzzle="mesocephalic", size_hint="giant"),
        _record("cairn_terrier", "Cairn Terrier", "TERRIER", ["cairn"], ear_carriage="erect", coat_visibility="dense", size_hint="small"),
        _record("cane_corso", "Cane Corso", "GUARDIAN", ["corso"], ear_carriage="natural_drop", muzzle="mesocephalic", size_hint="large"),
        _record("maremmano", "Cane da Pastore Abruzzese Maremmano", "HERDING", ["maremmano", "maremma"], coat_visibility="long", size_hint="large"),
        _record("pastore_belga", "Cane da Pastore Belga", "HERDING", ["belgian shepherd", "malinois", "tervueren", "groenendael"], ear_carriage="erect", size_hint="medium"),
        _record("bergamasco", "Cane da Pastore Bergamasco", "HERDING", ["bergamasco"], coat_visibility="long", size_hint="medium"),
        _record("pastore_olandese", "Cane da Pastore Olandese", "HERDING", ["dutch shepherd"], ear_carriage="erect", size_hint="medium"),
        _record("cane_lupo_cecoslovacco", "Cane Lupo Cecoslovacco", "SPITZ", ["czechoslovakian wolfdog"], ear_carriage="erect", tail_carriage="sickle", size_hint="large"),
        _record("saarloos", "Cane Lupo di Saarloos", "SPITZ", ["saarloos"], ear_carriage="erect", size_hint="large"),
        _record("cavalier_king", "Cavalier King Charles Spaniel", "COMPANION", ["cavalier", "cavalier king charles"], ear_carriage="floppy", muzzle="brachycephalic", size_hint="small"),
        _record("chihuahua", "Chihuahua", "COMPANION", [], ear_carriage="erect", size_hint="toy"),
        _record("chow_chow", "Chow Chow", "SPITZ", ["chow"], ear_carriage="erect", tail_carriage="sickle", muzzle="brachycephalic", coat_visibility="dense", size_hint="medium"),
        _record("cirneco", "Cirneco dell’Etna", "SIGHTHOUND", ["cirneco"], ear_carriage="erect", muzzle="dolichocephalic", size_hint="medium"),
        _record("cocker_americano", "Cocker Spaniel Americano", "RETRIEVING", ["american cocker"], ear_carriage="floppy", coat_visibility="long", size_hint="small"),
        _record("cocker_inglese", "Cocker Spaniel Inglese", "RETRIEVING", ["english cocker", "cocker"], ear_carriage="floppy", coat_visibility="long", size_hint="medium"),
        _record("collie_corto", "Collie a Pelo Corto", "HERDING", ["smooth collie"], ear_carriage="semi", size_hint="medium"),
        _record("collie_lungo", "Collie a Pelo Lungo", "HERDING", ["rough collie", "collie"], ear_carriage="semi", coat_visibility="long", size_hint="medium"),
        _record("dalmata", "Dalmata", "SCENTHOUND", ["dalmatian"], ear_carriage="floppy", size_hint="medium"),
        _record("dobermann", "Dobermann", "GUARDIAN", ["doberman", "doberman pinscher"], ear_carriage="natural_drop", muzzle="mesocephalic", size_hint="large"),
        _record("dogo_argentino", "Dogo Argentino", "GUARDIAN", ["dogo"], ear_carriage="semi", size_hint="large"),
        _record("dogue_de_bordeaux", "Dogue de Bordeaux", "GUARDIAN", ["bordeaux", "french mastiff"], muzzle="brachycephalic", size_hint="giant"),
        _record("epagneul_breton", "Epagneul Breton", "RETRIEVING", ["brittany", "breton"], ear_carriage="floppy", size_hint="medium"),
        _record("fox_terrier_liscio", "Fox Terrier a Pelo Liscio", "TERRIER", ["smooth fox terrier"], ear_carriage="v_fold", size_hint="small"),
        _record("fox_terrier_ruvido", "Fox Terrier a Pelo Ruvido", "TERRIER", ["wire fox terrier"], ear_carriage="v_fold", coat_visibility="dense", size_hint="small"),
        _record("golden_retriever", "Golden Retriever", "RETRIEVING", ["golden"], ear_carriage="floppy", tail_carriage="level", muzzle="mesocephalic", coat_visibility="long", size_hint="large"),
        _record("gordon_setter", "Gordon Setter", "RETRIEVING", ["gordon"], ear_carriage="floppy", coat_visibility="long", size_hint="large"),
        _record("greyhound", "Greyhound", "SIGHTHOUND", ["levriero inglese"], ear_carriage="rose", tail_carriage="low", muzzle="dolichocephalic", size_hint="large"),
        _record("hovawart", "Hovawart", "GUARDIAN", [], ear_carriage="floppy", coat_visibility="long", size_hint="large"),
        _record("irish_terrier", "Irish Terrier", "TERRIER", [], ear_carriage="v_fold", size_hint="medium"),
        _record("jack_russell", "Jack Russell Terrier", "TERRIER", ["jack russell", "parson russell"], ear_carriage="v_fold", size_hint="small"),
        _record("labrador_retriever", "Labrador Retriever", "RETRIEVING", ["labrador", "lab"], ear_carriage="floppy", tail_carriage="level", muzzle="mesocephalic", coat_visibility="short", size_hint="large"),
        _record("lagotto", "Lagotto Romagnolo", "RETRIEVING", ["lagotto"], ear_carriage="floppy", coat_visibility="dense", size_hint="medium"),
        _record("leonberger", "Leonberger", "GUARDIAN", [], coat_visibility="long", size_hint="giant"),
        _record("levriero_afgano", "Levriero Afgano", "SIGHTHOUND", ["afghan hound", "afgano"], muzzle="dolichocephalic", coat_visibility="long", size_hint="large"),
        _record("levriero_irlandese", "Levriero Irlandese", "SIGHTHOUND", ["irish wolfhound"], muzzle="dolichocephalic", size_hint="giant"),
        _record("lhasa_apso", "Lhasa Apso", "COMPANION", ["lhasa"], coat_visibility="long", muzzle="brachycephalic", size_hint="small"),
        _record("maltese", "Maltese", "COMPANION", [], ear_carriage="floppy", coat_visibility="long", size_hint="toy"),
        _record("manchester_terrier", "Manchester Terrier", "TERRIER", ["manchester"], ear_carriage="erect", size_hint="small"),
        _record("mastiff", "Mastiff", "GUARDIAN", ["english mastiff"], muzzle="mesocephalic", size_hint="giant"),
        _record("mastino_napoletano", "Mastino Napoletano", "GUARDIAN", ["neapolitan mastiff"], muzzle="brachycephalic", size_hint="giant"),
        _record("norfolk_terrier", "Norfolk Terrier", "TERRIER", ["norfolk"], ear_carriage="drop", size_hint="small"),
        _record("norwich_terrier", "Norwich Terrier", "TERRIER", ["norwich"], ear_carriage="erect", size_hint="small"),
        _record("toller", "Nova Scotia Duck Tolling Retriever", "RETRIEVING", ["toller", "nova scotia"], ear_carriage="floppy", size_hint="medium"),
        _record("kelpie", "Pastore Australiano Kelpie", "HERDING", ["kelpie"], ear_carriage="erect", size_hint="medium"),
        _record("shetland", "Pastore Scozzese Shetland", "HERDING", ["shetland sheepdog", "sheltie"], ear_carriage="erect", coat_visibility="long", size_hint="small"),
        _record("pastore_svizzero", "Pastore Svizzero Bianco", "HERDING", ["white swiss shepherd", "berger blanc"], ear_carriage="erect", size_hint="large"),
        _record("pastore_tedesco", "Pastore Tedesco", "HERDING", ["german shepherd", "gsd"], ear_carriage="erect", tail_carriage="low", muzzle="mesocephalic", size_hint="large"),
        _record("pechinese", "Pechinese", "COMPANION", ["pekingese"], muzzle="brachycephalic", coat_visibility="long", size_hint="toy"),
        _record("piccolo_levriero", "Piccolo Levriero Italiano", "SIGHTHOUND", ["italian greyhound"], ear_carriage="rose", muzzle="dolichocephalic", size_hint="small"),
        _record("pinscher", "Pinscher", "COMPANION", ["german pinscher", "pinscher tedesco"], ear_carriage="erect", size_hint="small"),
        _record("pointer_inglese", "Pointer Inglese", "RETRIEVING", ["english pointer", "pointer"], ear_carriage="floppy", muzzle="mesocephalic", size_hint="large"),
        _record("pomerania", "Pomerania", "SPITZ", ["pomeranian", "volpino di pomerania"], ear_carriage="erect", tail_carriage="sickle", coat_visibility="dense", size_hint="toy"),
        _record("pudelpointer", "Pudelpointer", "RETRIEVING", [], ear_carriage="floppy", size_hint="medium"),
        _record("rhodesian_ridgeback", "Rhodesian Ridgeback", "GUARDIAN", ["ridgeback"], ear_carriage="floppy", size_hint="large"),
        _record("rottweiler", "Rottweiler", "GUARDIAN", ["rott"], ear_carriage="floppy", muzzle="mesocephalic", size_hint="large"),
        _record("samoiedo", "Samoiedo", "SPITZ", ["samoyed"], ear_carriage="erect", tail_carriage="sickle", coat_visibility="dense", size_hint="medium"),
        _record("san_bernardo", "San Bernardo", "GUARDIAN", ["saint bernard", "st bernard"], ear_carriage="floppy", size_hint="giant"),
        _record("schnauzer", "Schnauzer", "TERRIER", ["standard schnauzer"], ear_carriage="v_fold", coat_visibility="dense", size_hint="medium"),
        _record("schnauzer_gigante", "Schnauzer Gigante", "GUARDIAN", ["giant schnauzer"], ear_carriage="v_fold", coat_visibility="dense", size_hint="large"),
        _record("schnauzer_nano", "Schnauzer Nano", "TERRIER", ["miniature schnauzer"], ear_carriage="v_fold", coat_visibility="dense", size_hint="small"),
        _record("scottish_terrier", "Scottish Terrier", "TERRIER", ["scottie"], ear_carriage="erect", coat_visibility="dense", size_hint="small"),
        _record("segugio_forte", "Segugio Italiano a Pelo Forte", "SCENTHOUND", [], ear_carriage="floppy", coat_visibility="dense", size_hint="medium"),
        _record("segugio_raso", "Segugio Italiano a Pelo Raso", "SCENTHOUND", ["segugio italiano"], ear_carriage="floppy", size_hint="medium"),
        _record("setter_inglese", "Setter Inglese", "RETRIEVING", ["english setter"], ear_carriage="floppy", coat_visibility="long", size_hint="large"),
        _record("setter_irlandese", "Setter Irlandese", "RETRIEVING", ["irish setter"], ear_carriage="floppy", coat_visibility="long", size_hint="large"),
        _record("shar_pei", "Shar Pei", "COMPANION", ["sharpei"], muzzle="brachycephalic", size_hint="medium"),
        _record("shiba", "Shiba", "SPITZ", ["shiba inu"], ear_carriage="erect", tail_carriage="sickle", size_hint="small"),
        _record("shih_tzu", "Shih Tzu", "COMPANION", ["shih tzu"], muzzle="brachycephalic", coat_visibility="long", size_hint="small"),
        _record("siberian_husky", "Siberian Husky", "SPITZ", ["husky"], ear_carriage="erect", tail_carriage="sickle", coat_visibility="dense", size_hint="medium"),
        _record("spinone", "Spinone Italiano", "RETRIEVING", ["spinone"], ear_carriage="floppy", coat_visibility="dense", size_hint="large"),
        _record("spitz_giapponese", "Spitz Giapponese", "SPITZ", ["japanese spitz"], ear_carriage="erect", tail_carriage="sickle", coat_visibility="dense", size_hint="small"),
        _record("spitz_tedesco", "Spitz Tedesco", "SPITZ", ["german spitz"], ear_carriage="erect", tail_carriage="sickle", coat_visibility="dense", size_hint="small"),
        _record("staffordshire_bull_terrier", "Staffordshire Bull Terrier", "TERRIER", ["staffy", "staffordshire"], ear_carriage="semi", size_hint="small"),
        _record("terranova", "Terranova", "RETRIEVING", ["newfoundland"], ear_carriage="floppy", coat_visibility="long", size_hint="giant"),
        _record("tibetan_terrier", "Tibetan Terrier", "COMPANION", [], coat_visibility="long", size_hint="medium"),
        _record("volpino_italiano", "Volpino Italiano", "SPITZ", ["volpino"], ear_carriage="erect", tail_carriage="sickle", coat_visibility="dense", size_hint="small"),
        _record("weimaraner", "Weimaraner", "RETRIEVING", ["weimaraner"], ear_carriage="floppy", muzzle="mesocephalic", size_hint="large"),
        _record("corgi_cardigan", "Welsh Corgi Cardigan", "HERDING", ["cardigan corgi"], ear_carriage="erect", size_hint="small"),
        _record("corgi_pembroke", "Welsh Corgi Pembroke", "HERDING", ["pembroke", "corgi"], ear_carriage="erect", size_hint="small"),
        _record("westie", "West Highland White Terrier", "TERRIER", ["westie", "west highland"], ear_carriage="erect", coat_visibility="dense", size_hint="small"),
        _record("whippet", "Whippet", "SIGHTHOUND", [], ear_carriage="rose", tail_carriage="low", muzzle="dolichocephalic", size_hint="medium"),
        _record("yorkshire_terrier", "Yorkshire Terrier", "COMPANION", ["yorkie", "yorkshire"], ear_carriage="v_fold", coat_visibility="long", size_hint="toy"),
    ]


@lru_cache(maxsize=1)
def breed_catalog() -> tuple[BreedRecord, ...]:
    return tuple(_catalog())


@lru_cache(maxsize=1)
def _alias_index() -> dict[str, BreedRecord]:
    index: dict[str, BreedRecord] = {}
    for record in breed_catalog():
        keys = {normalize_breed_label(record.display_name), normalize_breed_label(record.id.replace("_", " "))}
        keys.update(normalize_breed_label(alias) for alias in record.aliases)
        for key in keys:
            if key:
                index[key] = record
    return index


def resolve_breed(
    label: str | None,
    *,
    is_mix: bool = False,
) -> BreedResolution:
    raw = (label or "").strip() or None
    normalized = normalize_breed_label(label)
    if is_mix or normalized in _MIX_LABELS or any(
        token in normalized.split() for token in ("mix", "misto", "meticcio", "incrocio")
    ):
        return BreedResolution(
            status="MIX",
            input_label=raw,
            is_mix=True,
            functional_group="MIX",
            confidence="HIGH" if is_mix or normalized in _MIX_LABELS else "MEDIUM",
            prior_eligible=False,
            reasons=["mix_or_unknown_breed_has_no_named_prior"],
        )
    if normalized in _UNKNOWN_LABELS:
        return BreedResolution(
            status="UNKNOWN",
            input_label=raw,
            functional_group="UNKNOWN",
            confidence="HIGH",
            prior_eligible=False,
            reasons=["unspecified_breed_has_no_named_prior"],
        )
    match = _alias_index().get(normalized)
    if match is None:
        for key, record in _alias_index().items():
            if (normalized in key or key in normalized) and abs(
                len(normalized) - len(key)
            ) <= 8:
                match = record
                break
    if match is None:
        return BreedResolution(
            status="UNKNOWN",
            input_label=raw,
            functional_group="UNKNOWN",
            confidence="LOW",
            prior_eligible=False,
            reasons=["label_not_in_curated_taxonomy"],
        )
    return BreedResolution(
        status="NAMED",
        input_label=raw,
        canonical_id=match.id,
        display_name=match.display_name,
        functional_group=match.functional_group,
        confidence="HIGH",
        morphology=match.morphology,
        prior_eligible=True,
        reasons=["resolved_from_curated_taxonomy"],
    )
