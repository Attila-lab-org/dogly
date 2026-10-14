"""Lossless UI projection of GPT's reading; no advice or meaning selection."""

from app.contracts.interpretation import InterpretationContract
from app.domains.behavior_intelligence import BehaviorConsumerResult


def model_behavior_result(interpretation: InterpretationContract) -> BehaviorConsumerResult:
    return BehaviorConsumerResult(
        consumer_headline=interpretation.consumer_headline,
        consumer_summary=interpretation.consumer_summary,
        dog_voice=interpretation.dog_voice,
        baseline_comparison=interpretation.baseline_comparison,
        baseline_note=interpretation.baseline_note,
        recommended_next_step=interpretation.recommended_next_step,
        what_to_watch=interpretation.what_to_watch,
        consumer_evidence=interpretation.evidence,
        consumer_alternatives=interpretation.alternatives,
        personal_memory_used=interpretation.personal_memory_used,
        composer_version="gpt-personal/v1",
    )
