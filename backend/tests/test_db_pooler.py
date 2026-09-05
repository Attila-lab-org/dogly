from __future__ import annotations

from app.domains.db import _asyncpg_connect_args


def test_asyncpg_configuration_is_safe_for_transaction_pooler() -> None:
    options = _asyncpg_connect_args()
    name_factory = options["prepared_statement_name_func"]

    assert options["statement_cache_size"] == 0
    assert options["prepared_statement_cache_size"] == 0
    assert name_factory() != name_factory()
