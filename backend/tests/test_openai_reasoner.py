from app.providers.openai_reasoner import chat_completion_body


def test_gpt5_mini_omits_temperature():
    body = chat_completion_body(
        "gpt-5-mini",
        [{"role": "user", "content": "{}"}],
        temperature=0.2,
    )
    assert "temperature" not in body
    assert body["model"] == "gpt-5-mini"
    assert body["response_format"] == {"type": "json_object"}


def test_gpt4_family_keeps_temperature():
    body = chat_completion_body(
        "gpt-4.1-mini",
        [{"role": "user", "content": "{}"}],
        temperature=0.2,
    )
    assert body["temperature"] == 0.2
