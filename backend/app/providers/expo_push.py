"""Small Expo Push adapter; callers keep delivery best-effort."""

from __future__ import annotations

from typing import Any

import httpx

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_push(
    tokens: list[str],
    *,
    title: str,
    body: str,
    data: dict[str, Any],
) -> int:
    messages = [
        {
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data,
        }
        for token in tokens
        if token.startswith(("ExponentPushToken[", "ExpoPushToken["))
    ]
    if not messages:
        return 0
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            EXPO_PUSH_URL,
            headers={"Content-Type": "application/json"},
            json=messages,
        )
        response.raise_for_status()
    return len(messages)
