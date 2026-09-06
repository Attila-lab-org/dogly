# DOGLY — CURSOR IMPLEMENTATION BRIEF
## AI Knowledge + Life Stage + Lifestyle + Advice Engine V2

**Repository:** `Attila-lab-org/dogly`  
**Date:** 2026-09-06  
**Mode:** implementation, not audit-only. Inspect current `main` first and preserve existing architecture.

## 0. Read these artifacts first
1. `Dogly_AI_Knowledge_Advice_Engine_V2_Enterprise.docx`
2. `dogly_knowledge_advice_engine_v2.json`
3. Existing Product Spec / AI operating docs already in the repo/project.

## 1. Product objective
Dogly must stop relying on provider pretraining as the official source of canine knowledge. The final decision must combine:

`current observation + scientific KB + life stage/age + lifestyle/routine + personal baseline + safety policy`.

Provider general knowledge is only a fallback **hypothesis generator** for uncovered cases. It must not create authoritative consumer claims.

## 2. Preserve current architecture
Current source-of-truth files already separate responsibilities:
- `backend/app/providers/gemini_observer.py`: observable facts only. **Do not add intent/advice here.**
- `backend/app/worker/handlers.py`: observer → reasoner orchestration.
- `backend/app/providers/openai_reasoner.py`: probabilistic interpretation.
- `backend/app/contracts/interpretation.py`: structured interpretation + abstention.
- `backend/app/contracts/taxonomy.py`: canonical `IntentCode`. **Do not replace this allowlist.**

Target flow:

```text
video
  -> Gemini VideoObserver
  -> ObservationContract
  -> DogContextSnapshot
  -> Scientific KB retrieval
  -> OpenAI Reasoner
  -> InterpretationContract
  -> deterministic AdviceEngine
  -> persisted result
  -> mobile result + optional outcome feedback
```

## 3. Add knowledge package
Create:

```text
backend/app/knowledge/
  __init__.py
  models.py
  registry.py
  retrieval.py
  advice.py
  data/
    dogly_knowledge_advice_v2.json
```

Copy the supplied JSON into `data/`. Validate it at load time. In staging/production, fail fast if the registry is invalid. Do not use a runtime PDF RAG for V1. Retrieval should be structured and bounded.

### Suggested models
- `ScientificEvidenceSummary`
- `KnowledgeContext`
- `DogContextSnapshot`
- `LifeStageContext` (`value`, `source`, `confidence`)
- `LifestyleFact` (`key`, `value`, `provenance`, `last_confirmed_at`)
- `AdviceCandidate` / `AdviceItem`
- `AdviceOutcomeValue = HELPED | DID_NOT_HELP | UNKNOWN | NOT_TRIED`

## 4. Extend provider boundary
Update `backend/app/providers/base.py` Reasoner protocol from:

`observation + context_bucket + policy_version + eligible_memory`

to additionally receive:
- `knowledge_context`
- `dog_context`

Do not pass full dog history. Use compact, eligible context only.

## 5. Extend evidence provenance
In `backend/app/contracts/interpretation.py`, extend `EvidenceSource` with:
- `SCIENTIFIC_KB`
- `LIFE_STAGE`
- `LIFESTYLE_BASELINE`

Keep existing `OBSERVATION`, `CONTEXT`, `PERSONAL_PATTERN`.

Do not put arbitrary scientific citations in consumer text. Persist source/card IDs for audit.

## 6. Do NOT replace IntentCode
`backend/app/contracts/taxonomy.py` is the source of truth. Keep current values such as `PLAY_INTERACTION`, `ATTENTION_REQUEST`, `OUTSIDE_REQUEST`, `ALERT_VIGILANCE`, `DISCOMFORT_AVOIDANCE`, `FEAR_INSECURITY`, `HIGH_AROUSAL`, `FRUSTRATION`, `RELAX_REST`, `RESOURCE_TENSION`, `AMBIGUOUS`, `INSUFFICIENT`.

The research JSON may contain conceptual labels, but production output must map to the repo allowlist.

Version-bump policy/schema only where required and keep replay/audit compatibility.

## 7. Build DogContextSnapshot
Create `backend/app/domains/dog_context.py`. It should assemble only relevant facts from existing sources plus the new lifestyle profile.

Minimum runtime shape:

```json
{
  "dog_id": "...",
  "age_months": 34,
  "life_stage": {"value":"YOUNG_ADULT","source":"DERIVED","confidence":"MEDIUM"},
  "size": "MEDIUM",
  "breed_label": null,
  "routine": {
    "activity": {"value":"...","provenance":"OWNER_REPORTED"},
    "sleep": {"value":"...","provenance":"OWNER_REPORTED"},
    "time_alone": null,
    "feeding": null,
    "social": null,
    "enrichment": null
  },
  "today_vs_usual": [],
  "recent_changes": [],
  "preferences": [],
  "health_context": []
}
```

### Life stage rules
- Keep current `dogs.age_stage` DB value for compatibility.
- Derive a separate runtime `LifeStageContext`.
- AAHA stages are contextual and gradual; do not hard-code senior behavior from age alone.
- When stage is uncertain, use `UNKNOWN` or `confidence=LOW/MEDIUM`.

## 8. Lifestyle persistence — minimal DB change
Before writing a migration, inspect the **actual current migration history** because this project already had numbering/history drift. Use the next valid migration only after verification.

Add owner-scoped table conceptually equivalent to:

```text
dog_lifestyle_profiles
- dog_id PK/FK dogs
- user_id FK auth.users
- routine_json jsonb
- preferences_json jsonb
- provenance_json jsonb
- last_confirmed_at timestamptz
- created_at
- updated_at
```

RLS owner-only. API/service role behavior must follow current project policy. Missing values stay unknown.

Add append-only:

```text
advice_outcomes
- id
- event_id
- dog_id
- user_id
- advice_code
- outcome HELPED|DID_NOT_HELP|UNKNOWN|NOT_TRIED
- created_at
```

Owner feedback is personal-learning evidence, not scientific truth.

## 9. Retrieval layer
`retrieval.py` receives:
- `ObservationContract`
- `ContextBucket`
- `DogContextSnapshot`

Return max ~6 evidence cards. Prefer deterministic/tag-based filtering first. Semantic ranking is optional later.

Must include:
- card ID
- evidence grade
- applicable interpretations
- modifiers
- forbidden conclusions
- source IDs

If no card applies, set knowledge coverage low; the reasoner may abstain or return a LOW-confidence exploratory hypothesis, but cannot create a new scientific rule.

## 10. Update OpenAI reasoner
Update `backend/app/providers/openai_reasoner.py` payload to include `knowledge_context` and `dog_context`.

System rules must state:
1. Scientific cards are authoritative product evidence.
2. Personal patterns can personalize but cannot override safety.
3. Life stage and lifestyle are modifiers, not deterministic causes.
4. Owner-reported facts must remain owner-reported.
5. General pretrained knowledge can only explain an uncovered observation as a tentative LOW-confidence hypothesis; it must not introduce a new consumer recommendation.
6. Abstain when evidence is insufficient.

Do not send entire research papers.

## 11. AdviceEngine must be deterministic
Create `backend/app/knowledge/advice.py`.

Input:
- `InterpretationContract`
- `DogContextSnapshot`
- `KnowledgeContext`
- safety flags

Output: max **1** consumer `AdviceItem` in V1.

Priority:
`URGENT_SAFETY > VET_ESCALATION > LOW_RISK_MANAGEMENT > DEVELOPMENT > ROUTINE > ENRICHMENT > TRAINING > MONITOR`

The action itself comes from `advice_catalog` in the supplied JSON. The LLM may generate only a short rationale using facts already in the contracts. It may not invent a new action.

Safety/contraindication filters are deterministic.

## 12. Worker integration
Modify `backend/app/worker/handlers.py` minimally:

```text
observation = observer.observe(...)
quality gate
dog_context = build_dog_context(...)
knowledge_context = retrieve_evidence(observation, context, dog_context)
interpretation = reasoner.interpret(... knowledge_context, dog_context ...)
advice = advice_engine.build(interpretation, dog_context, knowledge_context)
persist interpretation + advice audit fields
```

Do not allow advice errors to corrupt completed interpretation if a safe no-advice fallback is possible.

## 13. API and mobile
Add coherent owner-scoped APIs, naming consistent with the existing router:
- lifestyle GET/PATCH for a dog
- advice outcome POST for an event

### UX rules
Do **not** expand onboarding into a questionnaire.

Use progressive profiling:
- profile screen: `Routine e abitudini`
- Home: optional “Aiutami a conoscerlo meglio” micro-card
- analysis: at most one context question if it materially changes result/advice
- result: one card `Cosa puoi fare adesso` if AdviceEngine returns an item
- later: `Ti è sembrato utile?` → Yes / No / Non so

## 14. Scientific behavior rules that must be encoded
- Tail wag is not automatically happiness.
- Lip lick/yawn/panting are nonspecific without context.
- Breed is a weak prior, never a behavioral verdict.
- Puppy socialization must be gradual/positive and never forced.
- Reward-based training only as default Dogly training advice.
- Senior new changes in sleep/orientation/house training/activity/interactions should not be dismissed as normal aging.
- No generic exercise minutes from age/breed alone.
- Prefer change from the dog's own baseline when enough longitudinal evidence exists.
- Safety and possible pain override optimization/enrichment advice.

## 15. Tests / acceptance
Add tests for:
- KB registry validation and version
- evidence retrieval on known observation cards
- no-card coverage → LOW/abstention path
- life-stage context and unknown behavior
- owner-reported provenance preserved
- safety override suppresses enrichment/training advice
- puppy advice never forces exposure
- senior change selects vet-monitoring escalation where appropriate
- advice max 1 item
- advice code must exist in catalog
- outcome write is owner-scoped
- worker happy path with mocks
- provider failure/retry behavior unchanged
- OpenAPI drift tests updated
- migrations reset cleanly

## 16. Important non-goals
- Do not train a proprietary model in this task.
- Do not add a vector DB unless a measured need appears.
- Do not add audio-only consumer flow.
- Do not rewrite current IntentCode.
- Do not turn advice outcomes into universal scientific rules.
- Do not make veterinary diagnoses or prescribe medication.
- Do not use aversive/dominance advice.

## 17. Delivery protocol
1. Audit current `main` and list exact files/migrations you will touch.
2. Implement in small coherent commits on `main` only if that matches the current project workflow.
3. Run backend pytest + Ruff, mobile typecheck/tests, OpenAPI drift, Supabase migration reset.
4. Report exact commit SHA, files changed, tests passed, migrations created, and any blocker.
5. Do not claim production ready without E2E verification.
