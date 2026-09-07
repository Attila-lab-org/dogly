from app.providers.gemini_observer import _estimate_gemini_cost
from app.providers.openai_digestive_vision import _estimate_cost
from app.providers.openai_reasoner import _estimate_openai_cost


def test_gemini_cost_counts_thinking_tokens_and_margin():
    cost = _estimate_gemini_cost(
        {
            "promptTokenCount": 1_000_000,
            "candidatesTokenCount": 100_000,
            "thoughtsTokenCount": 100_000,
        },
        input_usd_per_million=0.75,
        output_usd_per_million=3.75,
        safety_margin=1.15,
    )
    assert cost == 1.725


def test_openai_cost_uses_configured_public_rates():
    usage = {"prompt_tokens": 1_000_000, "completion_tokens": 1_000_000}
    expected = round((0.25 + 2.0) * 1.15, 6)
    assert (
        _estimate_openai_cost(
            usage,
            input_usd_per_million=0.25,
            output_usd_per_million=2.0,
            safety_margin=1.15,
        )
        == expected
    )
    assert (
        _estimate_cost(
            usage,
            input_usd_per_million=0.25,
            output_usd_per_million=2.0,
            safety_margin=1.15,
        )
        == expected
    )
