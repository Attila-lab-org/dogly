# DOGly Intelligence Expansion — Implementation Specification for Cursor

**Status:** Ready for implementation  
**Target:** existing `Attila-lab-org/dogly` repository  
**Execution owner:** Cursor, using the project's existing Supabase MCP / migration workflow  
**Important:** Do **not** bypass migrations by manually editing production tables.

---

## 1. Objective

Extend DOGly's current intelligence architecture so that behavior, breed/morphology, nutrition, and digestive analysis share a scalable, versioned knowledge layer without sending the full knowledge base to Gemini/OpenAI on every request.

The AI models must receive only a small, relevant `DogIntelligenceContext` assembled by the backend.

The architecture must preserve the current principles already present in the repository:

- observable facts are separated from interpretation;
- breed is a weak prior, never a behavioral verdict;
- generated text cannot downgrade deterministic safety;
- digestive/nutrition remains a separate intelligence domain from behavior;
- user-confirmed facts have explicit provenance;
- individual dog history has priority over population priors;
- scientific knowledge must be versioned and auditable;
- do not make pgvector part of the critical path in V1 unless benchmarked and justified.

---

## 2. Do not redesign what already works

Before changing anything, inspect the current repository and reuse the existing patterns for:

- `public.dogs`
- `internal.dog_profile_versions`
- behavior observations / interpretations
- `public.food_products`
- `public.feeding_periods`
- `public.fecal_events`
- `internal.digestive_observations`
- `public.digestive_baselines`
- `public.digestive_insights`
- current knowledge registry / retrieval / advice engine
- current RLS, grants, indexes, migrations and test conventions.

Do not create a second architecture for the same concepts.

---

## 3. High-level architecture

```text
Scientific sources / datasets / product catalogs
                    |
                    v
          INGESTION + NORMALIZATION
                    |
                    v
        DOGly Structured Knowledge Layer
                    |
          deterministic retrieval
                    |
                    v
         DogIntelligenceContext
        /          |            \
 current obs   dog memory   verified context
        \          |            /
                    v
              AI Reasoner
                    |
                    v
        deterministic safety/rules
                    |
                    v
             consumer result
```

The LLM must **not** query arbitrary database tables directly and must **not** receive full raw papers, full breed catalogs, or full dog history at runtime.

---

## 4. Runtime priority order

All reasoning must respect this hierarchy:

1. current observable evidence;
2. individual dog baseline and established personal patterns;
3. owner-confirmed current context;
4. life stage, health context and morphology;
5. functional lineage / breed population prior;
6. generic model pretraining knowledge.

If a lower level conflicts with a higher level, the higher level wins.

Breed may modify prior probability or observation normalization, but may never independently create:

- aggression/fear/personality conclusions;
- intent;
- diagnosis;
- safety flags;
- treatment;
- nutrition prescriptions.

---

## 5. New logical domains

Create three versioned knowledge domains.

### 5.1 Breed & Morphology Intelligence

Required concepts:

- canonical breed;
- aliases / localized labels;
- mix / unknown handling;
- functional group / lineage;
- morphology profile;
- population-level behavioral priors;
- health/activity cautions only when sourced;
- applicability constraints;
- evidence strength;
- forbidden conclusions.

Suggested tables / models:

```text
knowledge_sources
knowledge_claims
breed_taxonomy
breed_aliases
breed_morphology_profiles
breed_population_priors
functional_groups
```

### 5.2 Nutrition Intelligence

Required concepts:

- verified food product;
- external source provenance;
- calories / energy density;
- guaranteed analysis;
- ingredients;
- feeding quantity;
- treats/extras;
- body weight history;
- BCS / MCS when available;
- food transition;
- life-stage context;
- digestive tolerance history.

Suggested tables / models:

```text
nutrition_knowledge_rules
external_food_sources
food_product_external_refs
dog_nutrition_profiles
dog_body_condition_events
dog_weight_events
```

Do not duplicate existing `public.food_products` or `public.feeding_periods`; extend around them.

### 5.3 Digestive Intelligence

Keep the existing fecal pipeline and enrich the longitudinal context.

Add support for:

- 24h / 7d / 30d trend summaries;
- current-food baseline;
- previous-food baseline;
- repeated abnormalities;
- stool frequency;
- urgency/straining when owner-reported;
- appetite;
- vomiting;
- activity;
- unusual foods;
- supplements/medications as owner-confirmed context.

Do not allow correlation to become automatic causality.

---

## 6. Knowledge schema

Use small atomic claims, not long free-text breed essays.

A knowledge claim should be able to represent:

```json
{
  "claim_id": "breed_border_collie_motion_control_v1",
  "domain": "BREED_BEHAVIOR",
  "subject_type": "BREED",
  "subject_id": "border_collie",
  "claim_code": "MOTION_CONTROL_POPULATION_PRIOR",
  "statement": "Population-level evidence supports an increased prior for movement-control related behaviors in some herding lineages.",
  "strength": "MODERATE",
  "population_scope": "population_level",
  "applicability": {
    "functional_group": ["HERDING"]
  },
  "forbidden_conclusions": [
    "Do not infer intent without observable evidence.",
    "Do not infer personality from breed."
  ],
  "source_ids": ["source_x"],
  "version": "1.0",
  "active": true
}
```

Do not expose raw scientific wording directly to end users.

---

## 7. Provenance

Every imported or curated scientific fact must include:

- stable source ID;
- title;
- authors when available;
- publisher/journal;
- publication year;
- URL/DOI;
- license / permitted-use notes;
- population studied;
- evidence quality;
- what the source supports;
- what it does **not** support;
- import version;
- imported_at / reviewed_at.

Never mix external licensed datasets into proprietary tables without preserving source provenance.

---

## 8. Initial source policy

### Allowed initial implementation targets

**Darwin's Ark / Morrill dataset**
- use as a population-level statistical source;
- preserve source attribution/provenance;
- do not convert population differences into deterministic breed behavior.

**FCI taxonomy**
- use for canonical taxonomy / groups / breed organization;
- do not treat descriptive breed standards as proof of individual behavior.

**WSAVA / AAHA / FEDIAF**
- use as scientific/rule references for nutrition and veterinary context;
- do not copy protected graphics/text unless licensing allows;
- encode DOGly's own structured rules and references.

**Open Pet Food Facts**
- access through a dedicated external adapter;
- keep external provenance and retrieval timestamp;
- do not blindly merge the external database into proprietary knowledge;
- only user-confirmed product fields become durable trusted DOGly context.

### Not approved for direct production ingestion without separate licensing review

- Dog Aging Project curated data;
- DogFLW commercial training use;
- DogSpeak commercial training use;
- any non-commercial-only dataset.

---

## 9. Supabase placement

Cursor must use the project's existing Supabase MCP and migration workflow.

### Do not write production schema manually.

Create migrations in the existing `supabase/migrations` folder using the repository's next valid migration naming convention.

### Schema separation

Use:

**`internal`**
for:
- scientific knowledge;
- normalized evidence;
- external source metadata;
- import audit;
- retrieval audit;
- model/runtime-only snapshots;
- server-only nutrition/digestive reasoning state.

**`public`**
only for:
- user-owned dog data;
- user-visible verified food data;
- owner-confirmed measurements/context;
- results intended for authenticated client access.

Scientific knowledge must not be user-writable.

Follow the existing hard-fenced `internal` schema convention:
- no anon/authenticated privileges;
- backend/service role only.

---

## 10. Suggested database objects

Cursor should confirm naming against the existing code before creating anything.

Recommended server-only objects:

```text
internal.knowledge_sources
internal.knowledge_claims
internal.functional_groups
internal.breed_taxonomy
internal.breed_aliases
internal.breed_morphology_profiles
internal.breed_population_priors
internal.nutrition_knowledge_rules
internal.external_food_sources
internal.knowledge_import_runs
internal.knowledge_retrieval_audit
```

Recommended user-owned public objects only if not already represented elsewhere:

```text
public.dog_weight_events
public.dog_body_condition_events
public.dog_nutrition_profiles
public.food_product_external_refs
```

Do not duplicate fields if equivalent data already exists in another canonical table.

---

## 11. Breed resolution

Current `dogs.breed_label` is free text and must remain backward compatible.

Add a resolver layer:

```text
breed_label
   ↓
normalize alias
   ↓
canonical breed ID OR MIX / UNKNOWN
   ↓
functional group
   ↓
morphology profile
   ↓
eligible population priors
```

Do not overwrite the user's original label.

Store the resolved canonical reference separately.

For mixed dogs:
- allow one or more known breed components when owner-confirmed;
- weaken breed-specific priors;
- prefer morphology + personal history;
- unknown ancestry must not be guessed from appearance unless explicitly implemented later as a separate probabilistic feature.

---

## 12. Morphology-aware observer

Gemini may receive a **small morphology-normalization context** before video observation.

Allowed information:

- canonical/owner-confirmed breed only when available;
- size;
- ear baseline/carriage morphology;
- tail morphology/carriage baseline;
- muzzle type;
- coat/face visibility;
- body conformation relevant to observability;
- owner/vet-confirmed physical limitations.

Strict rule:

> Morphology context is only for normalizing visible anatomy. It must not be used by the observer to infer intent, emotion, personality or breed stereotypes.

The observer output contract remains observational.

---

## 13. DogIntelligenceContext

Create one central backend object used by the reasoner.

Conceptual shape:

```json
{
  "dog_identity": {},
  "life_stage": {},
  "morphology_context": {},
  "breed_population_priors": [],
  "current_observation": {},
  "personal_baseline": {},
  "eligible_personal_patterns": [],
  "owner_confirmed_context": {},
  "nutrition_context": {},
  "digestive_context": {},
  "scientific_claims": [],
  "safety_constraints": [],
  "knowledge_versions": {}
}
```

The reasoner receives **only this bounded object**.

It must not receive:
- all breed data;
- all papers;
- all dog history;
- all nutrition rules;
- the full product catalog.

---

## 14. Retrieval rules

Implement deterministic structured retrieval first.

Inputs may include:

- domain;
- observed signal;
- context;
- life stage;
- size;
- canonical breed;
- functional group;
- morphology;
- safety state;
- food context;
- digestive state.

Return only a small bounded set.

Initial target:

```text
behavior scientific claims: max 4-6
morphology cards: max 1-2
breed/functional priors: max 1-2
nutrition rules: max 3-5
digestive rules: max 3-5
personal patterns: existing bounded policy
```

Safety-relevant claims have priority over population priors.

Do **not** enable pgvector in the critical path in this phase.

Semantic/vector retrieval may be added later only after evaluation shows a real need.

---

## 15. Caching / scalability

Most dog identity context changes rarely.

Implement cached/versioned context snapshots for:

- resolved breed;
- morphology;
- functional group;
- life stage;
- stable owner-confirmed context;
- active food summary;
- personal baseline summary.

Invalidate only when relevant underlying data changes.

Do not rebuild or re-tokenize the entire dog history for every analysis.

At 100 users or 100,000 users, the model should still receive approximately the same bounded context size.

---

## 16. Open Pet Food Facts adapter

Create a provider/adapter layer, not direct client access.

Required flow:

```text
barcode
→ DOGly backend
→ external food resolver
→ Open Pet Food Facts
→ normalized candidate product
→ user confirmation
→ trusted DOGly food record
```

Persist:

- source name;
- external product ID / barcode;
- retrieved_at;
- source payload version/hash if useful;
- fields confirmed by the user.

Do not treat external collaborative data as verified until the owner confirms it.

Add caching and rate-limit handling.

---

## 17. Nutrition reasoning policy

The LLM may explain but must not independently invent a diet.

Deterministic/structured inputs should include when available:

- current weight;
- target/ideal weight if owner/vet-confirmed;
- BCS;
- MCS;
- age/life stage;
- size;
- activity;
- neuter status if already collected;
- active food;
- kcal density;
- quantity/day;
- treats/extras;
- supplements;
- weight trend;
- digestive tolerance.

No diagnosis and no prescription for medical diets without appropriate professional context.

---

## 18. Digestive reasoning policy

Preserve the current pattern:

```text
vision observation
→ deterministic safety
→ longitudinal comparison
→ bounded reasoning/explanation
```

Extend it to include:

- event frequency;
- repeated watery/soft episodes;
- appetite;
- vomiting;
- activity;
- urgency/straining;
- recent diet changes;
- treats/extras;
- supplements/medications if owner-confirmed;
- current food vs previous food history.

The model may state:
- temporal association;
- repeated pattern;
- difference from personal baseline.

The model may not state:
- proven cause;
- disease diagnosis;
- guaranteed absence of a problem based on one image.

---

## 19. Safety

Generated model text can never lower a deterministic safety state.

Breed data can never escalate safety by itself.

External product metadata can never create a medical conclusion by itself.

If confidence is insufficient, return:
- uncertainty;
- follow-up question;
- request for better capture;
- professional follow-up when deterministic rules require it.

---

## 20. Versioning

Every runtime result should be traceable to:

- observer model/version;
- reasoner model/version;
- behavior policy version;
- digestive policy version;
- breed knowledge version;
- nutrition knowledge version;
- knowledge claim IDs used;
- personal pattern IDs used;
- context snapshot version.

This is required for future model changes and regression analysis.

---

## 21. Import pipeline

Do not manually hand-enter hundreds of records in the database.

Create reproducible scripts such as:

```text
scripts/knowledge/import_darwins_ark.py
scripts/knowledge/import_breed_taxonomy.py
scripts/knowledge/seed_nutrition_rules.py
scripts/knowledge/validate_knowledge.py
```

Pipeline:

```text
source
→ download/read
→ normalize
→ validate
→ generate deterministic seed/upsert payload
→ migration/import
→ audit row
```

All imports must be idempotent.

Use stable IDs, not random IDs, for canonical knowledge records where possible.

---

## 22. Testing requirements

Before enabling the new context in production, add tests for:

- alias → canonical breed resolution;
- mix and unknown behavior;
- morphology normalization;
- breed prior never creates intent by itself;
- personal dog baseline overrides conflicting weak breed prior;
- safety is not downgraded;
- external food result requires verification;
- food source provenance preserved;
- nutrition rule retrieval bounded;
- digestive association never becomes causality;
- context size remains bounded;
- cache invalidation;
- migration/RLS/grant safety;
- idempotent import.

Add regression fixtures for at least:

- Labrador Retriever;
- Border Collie;
- German Shepherd;
- Pug/French Bulldog morphology case;
- Greyhound/Sighthound case;
- mixed/unknown dog.

---

## 23. Evaluation gate

Do not claim the new system is better merely because more knowledge was added.

Create an evaluation set covering:

- different sizes;
- erect/floppy ears;
- natural high/low tail carriage;
- short/long muzzle;
- long/short coat;
- functional groups;
- mixed dogs;
- puppies/adults/seniors;
- multiple stool qualities;
- multiple food contexts.

Measure at minimum:

- observation correctness;
- interpretation usefulness;
- abstention quality;
- safety regressions;
- false breed stereotyping;
- schema validity;
- latency;
- token/context size;
- cost.

---

## 24. Rollout

Use feature flags.

Recommended flags:

```text
BREED_INTELLIGENCE_V1
MORPHOLOGY_OBSERVER_CONTEXT_V1
NUTRITION_INTELLIGENCE_V1
DIGESTIVE_LONGITUDINAL_V3
OPEN_PET_FOOD_FACTS_V1
```

Roll out in this order:

1. schema + source provenance;
2. breed taxonomy / resolver;
3. morphology context;
4. structured breed priors;
5. nutrition knowledge;
6. external food adapter;
7. digestive longitudinal extension;
8. reasoner integration;
9. eval;
10. staged production enablement.

---

## 25. Cursor execution instructions

Cursor must:

1. inspect the latest `main` before changing files;
2. identify the current last migration and create the next migration(s);
3. preserve backward compatibility;
4. implement changes in a feature branch;
5. run existing backend/frontend tests before and after;
6. add new tests;
7. run Supabase migration locally/dev first;
8. use Supabase MCP only for the correct DOGly project;
9. do **not** point migrations at unrelated Supabase projects;
10. after DDL changes, run Supabase security/performance advisors;
11. report every created/changed table, index, policy, trigger and feature flag;
12. do not enable production features until tests/evals pass.

If the DOGly Supabase project is not visible in Cursor's Supabase MCP connection, STOP and ask the operator to connect the correct Supabase project. Do not create a new project and do not use another existing project.

---

## 26. Acceptance criteria

The implementation is accepted only when:

- scientific knowledge is server-only and not user-writable;
- runtime prompts remain bounded;
- exact source provenance is preserved;
- current behavior/digestive safety rules still pass;
- breed knowledge is weak-prior only;
- individual dog history has higher priority;
- nutrition external data requires owner verification;
- no unsupported commercial dataset is imported;
- no vector database is required for V1;
- migrations are reversible/tested according to repository convention;
- existing Dogly flows continue to work.

---

## 27. Final architecture principle

> DOGly owns the knowledge, provenance, memory, rules and safety.  
> Gemini/OpenAI observe and reason over a bounded context.  
> The model is replaceable; DOGly's intelligence layer is the product.
