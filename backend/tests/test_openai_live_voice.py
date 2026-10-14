from types import SimpleNamespace

from app.providers.openai_live import (
    build_live_instructions,
    compact_live_dossier,
    openai_voice_for_gender,
)


def test_voice_gender_maps_to_best_quality_voices() -> None:
    assert openai_voice_for_gender("FEMALE") == "marin"
    assert openai_voice_for_gender("MALE") == "cedar"
    assert openai_voice_for_gender(None) == "marin"
    assert openai_voice_for_gender("nope") == "marin"


def test_live_instructions_stay_free_and_memory_aware() -> None:
    text = build_live_instructions(
        dog_name="Oreo",
        owner_name="Attila Rossi",
        previous_topic="ansia al parco",
        dossier="Dossier di questo cane\n- [DIGESTIVE] feci molli negli ultimi giorni",
    )
    assert "Oreo" in text
    assert "Attila" in text
    assert "ansia al parco" in text
    assert "libera" in text.casefold() or "non seguire uno script" in text.casefold()
    assert "mal di pancia" in text.casefold() or "malessere" in text.casefold()
    assert "quando serve" in text.casefold()
    assert "feci molli" in text
    assert "gpt-" not in text.casefold()
    assert "openai" not in text.casefold()


def test_compact_live_dossier_keeps_recent_analyses() -> None:
    context = SimpleNamespace(
        identity={"breed_label": "Meticcio", "age_stage": "adult"},
        core_facts=[{"summary": "Mangia croccantini X", "domain": "NUTRITION"}],
        stable_facts=[],
        items=[
            SimpleNamespace(
                summary="Feci molli per alcuni giorni",
                source_type="DIGESTIVE_EVENT",
            )
        ],
    )
    dossier = compact_live_dossier(context)
    assert "Meticcio" in dossier
    assert "Feci molli" in dossier
    assert "non copione" in dossier.casefold() or "non citare" in dossier.casefold()
