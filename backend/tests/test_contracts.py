"""Provider contract fixture tests (spec 26): recorded JSON fixtures must
validate against the versioned Pydantic contracts — no paid calls in CI."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.contracts.digestive import StoolObservationContract
from app.contracts.interpretation import InterpretationContract
from app.contracts.observation import ObservationContract

FIXTURES = Path(__file__).resolve().parents[1] / "app" / "providers" / "fixtures"


def _interpretation_payload() -> dict:
    return json.loads((FIXTURES / "interpretation.fixture.json").read_text())


def test_observation_fixture_validates():
    data = json.loads((FIXTURES / "observation.fixture.json").read_text())
    obs = ObservationContract.model_validate(data)
    assert obs.observer_meta.schema_version


def test_interpretation_fixture_validates():
    data = json.loads((FIXTURES / "interpretation.fixture.json").read_text())
    interp = InterpretationContract.model_validate(data)
    assert interp.confidence_band is not None
    assert interp.policy_version and interp.taxonomy_version


def test_stool_observation_fixture_validates():
    data = json.loads((FIXTURES / "stool_observation.fixture.json").read_text())
    stool = StoolObservationContract.model_validate(data)
    assert stool.image_quality


# Evidence count contract (Spec V1 sez. 6.1): 3-5 bullets when a primary
# intent is present; INSUFFICIENT / abstention may have an empty list.


def test_evidence_below_minimum_rejected_for_clear_result():
    data = _interpretation_payload()
    assert data["primary_intent"] == "PLAY_INTERACTION"
    data["evidence"] = data["evidence"][:2]
    with pytest.raises(ValidationError):
        InterpretationContract.model_validate(data)


def test_evidence_above_maximum_rejected():
    data = _interpretation_payload()
    data["evidence"] = data["evidence"] * 2  # 6 items
    with pytest.raises(ValidationError):
        InterpretationContract.model_validate(data)


def test_evidence_empty_allowed_for_insufficient():
    data = _interpretation_payload()
    data["primary_intent"] = "INSUFFICIENT"
    data["confidence_band"] = "LOW"
    data["evidence"] = []
    data["alternatives"] = []
    interp = InterpretationContract.model_validate(data)
    assert interp.evidence == []


def test_evidence_empty_allowed_for_abstention_null_intent():
    data = _interpretation_payload()
    data["primary_intent"] = None
    data["confidence_band"] = "LOW"
    data["evidence"] = []
    data["alternatives"] = []
    interp = InterpretationContract.model_validate(data)
    assert interp.primary_intent is None
