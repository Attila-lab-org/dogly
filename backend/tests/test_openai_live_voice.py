from app.providers.openai_live import (
    build_live_instructions,
    openai_voice_for_gender,
)


def test_voice_gender_maps_to_best_quality_voices() -> None:
    assert openai_voice_for_gender("FEMALE") == "marin"
    assert openai_voice_for_gender("MALE") == "cedar"
    assert openai_voice_for_gender(None) == "marin"
    assert openai_voice_for_gender("nope") == "marin"


def test_live_instructions_stay_spoken_and_safe() -> None:
    text = build_live_instructions(
        dog_name="Oreo",
        owner_name="Attila Rossi",
        previous_topic="ansia al parco",
    )
    assert "Oreo" in text
    assert "Attila" in text
    assert "ansia al parco" in text
    assert "veterinario" in text.casefold()
    assert "gpt-" not in text.casefold()
    assert "openai" not in text.casefold()
    assert "non rifiutare" in text.casefold() or "NON rifiutare" in text
    assert "parole umane" in text.casefold()
