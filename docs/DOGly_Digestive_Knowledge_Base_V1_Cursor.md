# DOGly — Digestive Knowledge Base V1

**Draft scientifico pronto per Cursor.** Non modifica il repository. È pensato per l'architettura attuale: observer visivo → normalizzazione/regole deterministiche → safety → contesto personale → consumer copy.

## Decisione architetturale
La conoscenza scientifica resta versionata nel repository. Supabase conserva dati personali, audit, versioni ed eval. Per il digestivo conviene un registro dedicato `digestive_knowledge_v1.json`, separato dal file generalista `dogly_intelligence_v3.json`, perché servono trigger, safety e learning rules più ricchi.

## Evidence grades
- **A** — Directly supported by professional guideline/reference or validated descriptive scale.
- **B** — Supported by peer-reviewed or academic veterinary evidence, but context/population is narrower.
- **C** — Conservative DOGly implementation/governance rule derived from A/B evidence; not a clinical conclusion itself.

## Fonti
### PURINA_FECAL_CHART_7
- **Riferimento:** Purina Institute. Purina Fecal Scoring Chart (7-point scale).
- **URL:** https://www.purinainstitute.com/sites/default/files/2024-02/fecal-chart.pdf
- **Uso DOGly:** Visible form/moisture/segmentation descriptors for scores 1-7.
- **Limite:** Pickup residue and effort to pass are not visible in a still photo.

### CAVETT_2021_JSAP
- **Riferimento:** Cavett CL et al. Consistency of faecal scoring using two canine faecal scoring systems. J Small Anim Pract. 2021;62(3):167-173.
- **URL:** https://pubmed.ncbi.nlm.nih.gov/33491796/
- **Uso DOGly:** Observer disagreement exists; experience affects agreement.
- **Limite:** Does not validate DOGly or an AI model.

### CHAUVEL_2025_PHOTO
- **Riferimento:** Chauvel C et al. Validation of photographic fecal scoring in puppies. Prev Vet Med. 2026;246:106729. Epub 2025.
- **URL:** https://pubmed.ncbi.nlm.nih.gov/41175811/
- **Uso DOGly:** Photographic scoring can agree well with in-situ scoring in the studied puppies.
- **Limite:** Specific puppy population and 13-point scale; not universal validation.

### VCA_DIARRHEA_CONTEXT
- **Riferimento:** VCA Animal Hospitals. Diarrhea Questionnaire and Checklist for Dogs.
- **URL:** https://vcahospitals.com/ho-ho-kus/know-your-pet/diarrhea-questionnaire-and-checklist-for-dogs
- **Uso DOGly:** Frequency, consistency, blood, color, mucus, foreign material, appetite, diet, meds, activity and vomiting are relevant history.
- **Limite:** Context source, not a diagnostic decision rule.

### MERCK_DIGESTIVE_DOGS
- **Riferimento:** Merck Veterinary Manual. Introduction to Digestive Disorders of Dogs.
- **URL:** https://www.merckvetmanual.com/dog-owners/digestive-disorders-of-dogs/introduction-to-digestive-disorders-of-dogs
- **Uso DOGly:** Color/consistency/frequency changes are relevant; black tarry stool can be compatible with digested blood; straining and systemic signs matter.
- **Limite:** Do not infer underlying disease or source from a photo alone.

### MERCK_WHEN_VET
- **Riferimento:** Merck Veterinary Manual. When to See a Veterinarian.
- **URL:** https://www.merckvetmanual.com/multimedia/table/when-to-see-a-veterinarian
- **Uso DOGly:** Bloody/uncontrollable diarrhea, thick black stool, severe straining and prolonged vomiting/diarrhea are escalation signals.
- **Limite:** General owner triage guidance, not a DOGly diagnosis.

### CORNELL_DIARRHEA
- **Riferimento:** Cornell University College of Veterinary Medicine. Diarrhea.
- **URL:** https://www.vet.cornell.edu/departments-centers-and-institutes/riney-canine-health-center/canine-health-topics/diarrhea
- **Uso DOGly:** Black/tarry stool, fresh blood, vomiting, reduced appetite/lethargy and persistence are reasons to seek veterinary care.
- **Limite:** General owner guidance; not individualized veterinary assessment.

### ACVS_FOREIGN_BODY
- **Riferimento:** American College of Veterinary Surgeons. Gastrointestinal Foreign Bodies.
- **URL:** https://www.acvs.org/small-animal/gastrointestinal-foreign-bodies/
- **Uso DOGly:** Foreign-body obstruction can present with vomiting, appetite loss, pain, dehydration and diarrhea; visible material alone does not prove obstruction.
- **Limite:** DOGly cannot diagnose obstruction from stool appearance.

### WSAVA_NUTRITION_2011
- **Riferimento:** WSAVA Nutritional Assessment Guidelines. Journal of Small Animal Practice, 2011.
- **URL:** https://wsava.org/wp-content/uploads/2020/01/WSAVA-Nutrition-Assessment-Guidelines-2011-JSAP.pdf
- **Uso DOGly:** Diet history, activity, weight, BCS/MCS, GI signs, supplements and weight change are relevant nutrition assessment data.
- **Limite:** Many items require veterinary exam; DOGly only compares owner-confirmed/measured data.

### AAHA_NUTRITION_2021
- **Riferimento:** 2021 AAHA Nutrition and Weight Management Guidelines for Dogs and Cats.
- **URL:** https://www.aaha.org/resources/2021-aaha-nutrition-and-weight-management-guidelines/
- **Uso DOGly:** Individualized feeding plan, amount/frequency, treats/supplements and gradual transitions are relevant.
- **Limite:** Do not generate therapeutic feeding prescriptions from photo analysis.

### AAHA_FEEDING_PLAN_2021
- **Riferimento:** AAHA. Feeding Plans for Healthy, Appropriate Weight Cats and Dogs.
- **URL:** https://www.aaha.org/resources/2021-aaha-nutrition-and-weight-management-guidelines/feeding-plans-for-healthy-appropriate-weight-cats-and-dogs/
- **Uso DOGly:** Specific feeding amount/frequency and 4-7 day transitions are useful context; gradual changes may reduce negative GI responses.
- **Limite:** Does not prove a food caused a stool change.

### WERNER_2020_CADS
- **Riferimento:** Werner M et al. Effect of amoxicillin-clavulanic acid on clinical scores... J Vet Intern Med. 2020.
- **URL:** https://pubmed.ncbi.nlm.nih.gov/32324947/
- **Uso DOGly:** CADS combines activity, appetite, vomiting, fecal consistency and defecation frequency.
- **Limite:** Do not claim DOGly reproduces CADS unless the exact instrument is implemented and validated.

## Regole globali
- No disease diagnosis from stool photo.
- No literal certainty about blood, melena, foreign material or food residue when visual evidence is ambiguous.
- No causal food verdict from temporal association.
- No treatment or medication instructions generated from photo interpretation.
- No implication that absence on a photo proves true absence.
- No use of insufficient-quality or safety-anomalous events to teach the personal normal baseline.
- No claim that DOGly reproduces a validated clinical severity index unless the exact instrument is implemented and independently validated.

## Scoring e qualità visiva
### DIG_SCORE_SCALE_001 — Grade A
**Principio:** The 1-7 fecal score is a descriptive stool-consistency/form scale, not a diagnosis.
**Quando:** fecal score is produced/displayed
**DOGly può:** Use the score to describe visible stool quality and longitudinal change.
**DOGly non può:** Do not map a score to disease, cause, treatment, or prognosis.
**Campi attuali:** fecal_score_estimate
**Fonti:** PURINA_FECAL_CHART_7

### DIG_SCORE_1_001 — Grade A
**Principio:** Very hard/dry, pellet-like or small hard masses.
**Quando:** very hard/dry and pellet-like
**DOGly può:** Score 1 compatible.
**DOGly non può:** Do not infer constipation or defecation effort.
**Campi attuali:** shape, apparent_moisture, segmentation, consistency, fecal_score_estimate
**Fonti:** PURINA_FECAL_CHART_7

### DIG_SCORE_2_001 — Grade A
**Principio:** Firm but not hard, pliable-looking, segmented stool.
**Quando:** firm/formed with clear segmentation and low apparent moisture
**DOGly può:** Score 2 compatible.
**DOGly non può:** Do not infer pickup residue/ease of passage.
**Campi attuali:** shape, apparent_moisture, segmentation, consistency, fecal_score_estimate
**Fonti:** PURINA_FECAL_CHART_7

### DIG_SCORE_3_001 — Grade A
**Principio:** Moist log-shaped stool with little/no segmentation that retains form.
**Quando:** formed/log-shaped, moist, minimally segmented
**DOGly può:** Score 3 compatible.
**DOGly non può:** Do not infer residue on pickup.
**Campi attuali:** shape, apparent_moisture, segmentation, consistency, fecal_score_estimate
**Fonti:** PURINA_FECAL_CHART_7

### DIG_SCORE_4_001 — Grade A
**Principio:** Very moist/soggy log-shaped stool losing form.
**Quando:** broadly log-shaped, very moist, partly collapsed
**DOGly può:** Score 4 compatible.
**DOGly non può:** Do not diagnose diarrhea cause.
**Campi attuali:** shape, apparent_moisture, segmentation, consistency, fecal_score_estimate
**Fonti:** PURINA_FECAL_CHART_7

### DIG_SCORE_5_001 — Grade A
**Principio:** Very moist stool with a distinct piled shape rather than a log.
**Quando:** distinct piled shape, not log-like
**DOGly può:** Score 5 compatible.
**DOGly non può:** Do not infer cause.
**Campi attuali:** shape, apparent_moisture, segmentation, consistency, fecal_score_estimate
**Fonti:** PURINA_FECAL_CHART_7

### DIG_SCORE_6_001 — Grade A
**Principio:** Textured stool with no defined shape, in piles/spots.
**Quando:** texture present but no defined form
**DOGly può:** Score 6 compatible.
**DOGly non può:** Do not name an enteric disease.
**Campi attuali:** shape, apparent_moisture, segmentation, consistency, fecal_score_estimate
**Fonti:** PURINA_FECAL_CHART_7

### DIG_SCORE_7_001 — Grade A
**Principio:** Watery stool with no texture, appearing as a flat puddle.
**Quando:** liquid/watery with no defined texture or shape
**DOGly può:** Score 7 compatible.
**DOGly non può:** Do not infer dehydration/infection/severity from photo alone.
**Campi attuali:** shape, apparent_moisture, segmentation, consistency, fecal_score_estimate
**Fonti:** PURINA_FECAL_CHART_7

### DIG_SCORE_PHOTO_LIMIT_001 — Grade C
**Principio:** A still photo cannot establish nonvisual chart criteria such as effort to pass stool or residue after pickup.
**Quando:** photo-based scoring
**DOGly può:** Use only visible primitives; reduce reliability if adjacent classes depend on nonvisual criteria.
**DOGly non può:** Never invent effort, pickup residue, odor, texture-by-touch or internal composition.
**Campi attuali:** image_quality, confidence_band
**Fonti:** PURINA_FECAL_CHART_7

### DIG_SCORE_ADJACENT_001 — Grade B
**Principio:** Fecal scoring has meaningful observer variability.
**Quando:** visible features sit near adjacent score boundary
**DOGly può:** Use deterministic tie-breaking and uncertainty/reliability rather than stochastic score flipping.
**DOGly non può:** Do not imply exactness unsupported by scoring literature.
**Campi attuali:** fecal_score_estimate, confidence_band
**Fonti:** CAVETT_2021_JSAP

### DIG_PHOTO_VALIDATION_001 — Grade B
**Principio:** Photographs can support fecal-consistency scoring, but validation is population- and scale-specific.
**Quando:** describing photo-based analysis
**DOGly può:** State that photos can support visual consistency assessment while preserving image-quality limits.
**DOGly non può:** Do not claim universal validation across all dogs/scales.
**Campi attuali:** image_quality, observation_reliability
**Fonti:** CHAUVEL_2025_PHOTO, CAVETT_2021_JSAP

## Aspetto e safety
### DIG_BLACK_TARRY_001 — Grade A
**Principio:** Black, tarry stool is clinically important because it can be compatible with digested blood.
**Quando:** melena clear OR BLACK_TARRY_APPEARANCE
**DOGly può:** Veterinary-contact guidance; describe appearance, not diagnosis.
**DOGly non può:** Do not say confirmed GI bleeding or localize source from photo.
**Campi attuali:** melena_candidate, color_family
**Fonti:** MERCK_DIGESTIVE_DOGS, MERCK_WHEN_VET, CORNELL_DIARRHEA

### DIG_BLACK_TARRY_POSSIBLE_001 — Grade C
**Principio:** A merely possible black/tarry appearance needs corroboration before becoming a safety finding.
**Quando:** melena_candidate=possible
**DOGly può:** Focused verifier; confirmed->safety, unavailable->controlled caution, not_confirmed->no strong claim.
**DOGly non può:** Do not convert first-pass uncertainty into definitive melena.
**Campi attuali:** melena_candidate, anomaly_verification
**Fonti:** MERCK_DIGESTIVE_DOGS, CAVETT_2021_JSAP

### DIG_FRESH_BLOOD_001 — Grade A
**Principio:** Visible fresh/bright red blood in stool is a reason for veterinary attention.
**Quando:** fresh_blood_candidate=clear_candidate
**DOGly può:** Recommend contacting a veterinarian while keeping wording observational.
**DOGly non può:** Do not diagnose colitis, parasites, hemorrhagic disease or another cause.
**Campi attuali:** fresh_blood_candidate
**Fonti:** VCA_DIARRHEA_CONTEXT, CORNELL_DIARRHEA, MERCK_WHEN_VET

### DIG_FRESH_BLOOD_POSSIBLE_001 — Grade C
**Principio:** A possible red/blood-like finding should be verified before it becomes a consumer safety claim.
**Quando:** fresh_blood_candidate=possible
**DOGly può:** Focused verifier required; unavailable verification keeps cautious monitor/contact guidance.
**DOGly non può:** Do not use model confidence as independent corroboration.
**Campi attuali:** fresh_blood_candidate, anomaly_verification, confidence_band
**Fonti:** CAVETT_2021_JSAP, CORNELL_DIARRHEA

### DIG_COLOR_NONRED_NONBLACK_001 — Grade B
**Principio:** Pale/tan/yellow/green/dark-brown color is worth recording, but color alone is not specific enough to assign a cause.
**Quando:** non-brown ordinary color and not confirmed red/black-tarry
**DOGly può:** Record canonical color and compare longitudinally.
**DOGly non può:** Do not diagnose liver/pancreas/infection/intolerance from color alone.
**Campi attuali:** color_family
**Fonti:** VCA_DIARRHEA_CONTEXT, MERCK_DIGESTIVE_DOGS

### DIG_MUCUS_001 — Grade B
**Principio:** Visible mucus is relevant but nonspecific on its own.
**Quando:** mucus possible/clear
**DOGly può:** Record and combine with frequency, urgency/straining, duration and other symptoms.
**DOGly non può:** Do not diagnose colitis or infection from mucus alone.
**Campi attuali:** mucus_candidate, straining_or_urgency, episode_count_7d
**Fonti:** VCA_DIARRHEA_CONTEXT

### DIG_FOREIGN_MATERIAL_001 — Grade A
**Principio:** Visible foreign material is worth recording, but does not prove GI obstruction.
**Quando:** foreign_material=clear_candidate
**DOGly può:** Raise attention and combine with vomiting/appetite/pain/ingestion context if available.
**DOGly non può:** Do not diagnose obstruction or advise inducing vomiting from stool photo.
**Campi attuali:** foreign_material_candidate, vomiting_today, appetite_reduced
**Fonti:** VCA_DIARRHEA_CONTEXT, ACVS_FOREIGN_BODY

### DIG_FOREIGN_POSSIBLE_001 — Grade C
**Principio:** Uncertain texture/debris should not be upgraded to foreign material without object-like evidence.
**Quando:** foreign_material=possible
**DOGly può:** Keep internal/monitoring unless evidence becomes clear or owner context raises concern.
**DOGly non può:** Do not create strong alert from ambiguous debris alone.
**Campi attuali:** foreign_material_candidate
**Fonti:** VCA_DIARRHEA_CONTEXT, CAVETT_2021_JSAP

### DIG_UNDIGESTED_FOOD_001 — Grade C
**Principio:** Food-like particles can be described visually but are nonspecific.
**Quando:** undigested_food possible/clear
**DOGly può:** Record as food-like material and use longitudinally/contextually.
**DOGly non può:** Do not infer malabsorption, pancreatic disease, poor digestibility or overfeeding from one photo.
**Campi attuali:** undigested_food_candidate
**Fonti:** VCA_DIARRHEA_CONTEXT, WSAVA_NUTRITION_2011

## Contesto clinicamente utile
### DIG_CONTEXT_CORE_001 — Grade B
**Principio:** Activity, appetite, vomiting, fecal consistency and defecation frequency are established context variables used together in canine acute-diarrhea severity assessment.
**Quando:** non-routine digestive change
**DOGly può:** Prefer one missing question that can change safety/interpretation.
**DOGly non può:** Do not claim DOGly is calculating CADS unless exact instrument is implemented/validated.
**Campi attuali:** vomiting_today, reduced_activity_today, appetite_reduced, consistency, episode_count_7d
**Fonti:** WERNER_2020_CADS

### DIG_VOMITING_001 — Grade A
**Principio:** Vomiting alongside loose/watery stool increases concern versus isolated stool change.
**Quando:** unformed/watery AND vomiting_today=true
**DOGly può:** Escalate attention/contact according to repetition/severity.
**DOGly non può:** Do not identify cause of vomiting/diarrhea.
**Campi attuali:** vomiting_today, consistency
**Fonti:** CORNELL_DIARRHEA, MERCK_DIGESTIVE_DOGS, WERNER_2020_CADS

### DIG_ACTIVITY_001 — Grade A
**Principio:** Reduced activity/lethargy is important context with diarrhea.
**Quando:** digestive change AND reduced_activity_today=true
**DOGly può:** Increase concern and avoid framing as isolated benign variation.
**DOGly non può:** Do not infer systemic disease from activity alone.
**Campi attuali:** reduced_activity_today
**Fonti:** CORNELL_DIARRHEA, VCA_DIARRHEA_CONTEXT, WERNER_2020_CADS

### DIG_APPETITE_001 — Grade A
**Principio:** Reduced appetite is important context with diarrhea.
**Quando:** digestive change AND appetite_reduced=true
**DOGly può:** Increase concern, especially with other red flags.
**DOGly non può:** Do not diagnose nausea/pain/obstruction/systemic disease from appetite alone.
**Campi attuali:** appetite_reduced
**Fonti:** CORNELL_DIARRHEA, VCA_DIARRHEA_CONTEXT, WERNER_2020_CADS

### DIG_FREQUENCY_001 — Grade A
**Principio:** Defecation frequency is clinically relevant and should be separate from consistency.
**Quando:** multiple events in a short window
**DOGly può:** Use episode counts to describe repetition and choose follow-up/safety context.
**DOGly non può:** Do not turn frequency alone into diagnosis.
**Campi attuali:** recent_episode_count_24h, episode_count_7d, episode_count_30d
**Fonti:** VCA_DIARRHEA_CONTEXT, WERNER_2020_CADS

### DIG_REPEATED_WATERY_001 — Grade B
**Principio:** Repeated watery stools are more concerning than one isolated soft stool.
**Quando:** watery AND recent_watery_count_24h>=1
**DOGly può:** Raise attention and ask vomiting/activity/appetite if missing.
**DOGly non può:** Do not diagnose infection/dehydration from appearance alone.
**Campi attuali:** consistency, recent_watery_count_24h
**Fonti:** VCA_DIARRHEA_CONTEXT, CORNELL_DIARRHEA, WERNER_2020_CADS

### DIG_STRAINING_001 — Grade A
**Principio:** Severe straining/urgency is relevant history and can change veterinary concern.
**Quando:** straining_or_urgency=true
**DOGly può:** Surface with blood/mucus/frequency and ability to pass stool.
**DOGly non può:** Do not localize disease or diagnose colitis/rectal disease from owner report alone.
**Campi attuali:** straining_or_urgency
**Fonti:** VCA_DIARRHEA_CONTEXT, MERCK_DIGESTIVE_DOGS, MERCK_WHEN_VET

### DIG_DURATION_001 — Grade B
**Principio:** Persistence of diarrhea over time is a reason to seek veterinary advice even when initial episode is mild.
**Quando:** loose/watery pattern persists across days
**DOGly può:** Escalate toward veterinary contact as persistence increases, especially with other signs.
**DOGly non può:** Do not hard-code universal prognosis from duration alone.
**Campi attuali:** episode_count_7d, episode_count_30d
**Fonti:** CORNELL_DIARRHEA, MERCK_WHEN_VET
**Nota:** Prefer future explicit owner-reported onset time; event counts are only a proxy.

## Alimentazione e nutrizione
### DIG_DIET_HISTORY_001 — Grade A
**Principio:** Diet history is relevant to GI assessment: main food, treats/table food, recent additions and supplements.
**Quando:** digestive state changed and nutrition context absent/incomplete
**DOGly può:** Ask for the single most useful missing nutrition item; if no food, offer Add nutrition.
**DOGly non può:** Do not imply missing diet data caused the change.
**Campi attuali:** active_food_name, has_active_food, quantity_per_day, unusual_food_48h, supplements_or_medication
**Fonti:** WSAVA_NUTRITION_2011, VCA_DIARRHEA_CONTEXT

### DIG_FOOD_CHANGE_001 — Grade A
**Principio:** A recent food change is a temporal association to track, not proof the food caused the stool change.
**Quando:** food_started_days_ago recent
**DOGly può:** Use 'coincides with' / 'happened after' and watch subsequent observations.
**DOGly non può:** Do not blame/clear/rank a product from temporal coincidence.
**Campi attuali:** food_started_days_ago, active_food_name
**Fonti:** AAHA_NUTRITION_2021, AAHA_FEEDING_PLAN_2021, VCA_DIARRHEA_CONTEXT

### DIG_DIET_TRANSITION_001 — Grade A
**Principio:** Gradual diet adjustment over roughly 4-7 days may reduce negative GI responses in healthy dogs/cats.
**Quando:** recording a planned new food/transition
**DOGly può:** Use as education for planned change, not treatment of active illness.
**DOGly non può:** Do not present 4-7 days as universally safe or as diarrhea treatment.
**Campi attuali:** food_started_days_ago
**Fonti:** AAHA_FEEDING_PLAN_2021
**Stato:** guidance_only

### DIG_FEEDING_AMOUNT_001 — Grade A
**Principio:** Feeding amount and frequency are meaningful parts of individualized nutrition history.
**Quando:** active food but quantity missing
**DOGly può:** Offer Complete nutrition and ask quantity/day.
**DOGly non può:** Do not calculate therapeutic grams from stool photo/unverified product data.
**Campi attuali:** quantity_per_day, active_food_product_id
**Fonti:** AAHA_FEEDING_PLAN_2021, WSAVA_NUTRITION_2011

### DIG_TREATS_EXTRAS_001 — Grade A
**Principio:** Treats, table foods and other extras can materially change the nutrition history.
**Quando:** persistent change and extras unknown
**DOGly può:** Use owner-confirmed extras context only when it changes interpretation.
**DOGly non può:** Do not label a treat/table food as the cause without evidence.
**Campi attuali:** unusual_food_48h
**Fonti:** WSAVA_NUTRITION_2011, VCA_DIARRHEA_CONTEXT

### DIG_MED_SUPPLEMENT_001 — Grade A
**Principio:** Medication and supplement use is relevant digestive context.
**Quando:** digestive change and medication/supplement context relevant
**DOGly può:** Record owner-reported use and surface for vet sharing when relevant.
**DOGly non può:** Do not advise stopping medication/supplements or assign causality.
**Campi attuali:** supplements_or_medication
**Fonti:** WSAVA_NUTRITION_2011, VCA_DIARRHEA_CONTEXT

### DIG_WEIGHT_CONTEXT_001 — Grade A
**Principio:** Weight/body-condition trends are nutrition context and more useful longitudinally than isolated labels.
**Quando:** weight data exists
**DOGly può:** Use measured/owner-entered weight change as context; keep BCS/MCS separate when available.
**DOGly non può:** Do not diagnose obesity/malnutrition/dehydration/disease from home weight or stool photo.
**Campi attuali:** latest_weight_kg, weight_delta_kg
**Fonti:** WSAVA_NUTRITION_2011, AAHA_NUTRITION_2021
**Nota:** BCS exists in dog_weight_events but is not currently wired into DigestiveContext.

## Longitudinale
### DIG_BASELINE_PERSONAL_001 — Grade C
**Principio:** DOGly's 'usual' should describe this dog's recent eligible observations, not a population-normal diagnosis.
**Quando:** baseline available
**DOGly può:** Compare current eligible score/consistency with dog's own eligible history.
**DOGly non può:** Do not call personal baseline medically normal or healthy.
**Campi attuali:** prior_scores, prior_consistencies
**Fonti:** PURINA_FECAL_CHART_7, CAVETT_2021_JSAP

## Learning governance
### DIG_LEARNING_QUALITY_001 — Grade C
**Principio:** Insufficient-quality image must not teach personal baseline.
**Quando:** image_quality=insufficient
**DOGly può:** Retry/reject display as appropriate; learning_eligible=false.
**DOGly non può:** Do not treat missing visual evidence as normal absence.
**Campi attuali:** image_quality, learning_eligible
**Fonti:** CHAUVEL_2025_PHOTO, CAVETT_2021_JSAP

### DIG_LEARNING_SAFETY_001 — Grade C
**Principio:** Observation carrying a meaningful safety anomaly should not become part of the dog's 'normal' baseline.
**Quando:** confirmed/clear blood, melena, foreign material or comparable safety anomaly
**DOGly può:** display_eligible may stay true; learning_eligible=false.
**DOGly non può:** Do not normalize future warnings through abnormal learning examples.
**Campi attuali:** learning_eligible, safety_flags
**Fonti:** MERCK_WHEN_VET, CORNELL_DIARRHEA, ACVS_FOREIGN_BODY

### DIG_OWNER_CONTEXT_PROVENANCE_001 — Grade C
**Principio:** Owner-reported symptoms and feeding history are context, not visual evidence.
**Quando:** owner_context_json contributes to reasoning
**DOGly può:** Keep provenance explicit; never rewrite observer facts from owner context.
**DOGly non può:** Do not claim the image showed vomiting, appetite change, medication use or diet history.
**Campi attuali:** owner_context_json
**Fonti:** VCA_DIARRHEA_CONTEXT, WSAVA_NUTRITION_2011

## Matrice di attivazione
| Situazione | Prima azione | Knowledge cards |
|---|---|---|
| Foto insufficiente | chiedi nuova foto, niente learning | DIG_SCORE_PHOTO_LIMIT_001, DIG_LEARNING_QUALITY_001 |
| Stool formed/soft senza safety | score + confronto personale | DIG_SCORE_* , DIG_BASELINE_PERSONAL_001 |
| Possible sangue/melena | focused verifier | DIG_FRESH_BLOOD_POSSIBLE_001 / DIG_BLACK_TARRY_POSSIBLE_001 |
| Clear sangue / black-tarry | veterinary contact guidance | DIG_FRESH_BLOOD_001 / DIG_BLACK_TARRY_001 |
| Watery/unformed | prima domanda su vomito, poi contesto | DIG_VOMITING_001, DIG_REPEATED_WATERY_001 |
| Nessun alimento e risultato non-routine | CTA alimentazione | DIG_DIET_HISTORY_001 |
| Alimento presente, quantità mancante | completa quantità | DIG_FEEDING_AMOUNT_001 |
| Cambio alimento recente | associazione temporale, non causa | DIG_FOOD_CHANGE_001 |
| Safety / qualità insufficiente | non insegnare baseline | DIG_LEARNING_SAFETY_001 / DIG_LEARNING_QUALITY_001 |

## Scoring 1–7: regola di implementazione
Il modello deve osservare i primitivi visibili; il codice assegna lo score. Forma, mantenimento della forma, umidità apparente, segmentazione e consistenza sono input. Criteri non visibili della chart Purina (es. residuo quando raccolto o sforzo nell'espulsione) non devono essere inventati. Se i primitivi stanno tra due classi, usare tie-break deterministico e abbassare reliability/confidence, non oscillare.

## Colore: cosa NON aggiungere alla V1
Non creare una tabella `colore → malattia`. Per V1 il colore resta descrittivo salvo segnali safety specifici (rosso/fresh-blood-like e nero/catramato). Verde, giallo, arancio, pallido/grigio si registrano e confrontano nel tempo, senza generare automaticamente una causa clinica.

## Dati utili non ancora completamente cablati
- BCS/MCS: rilevanti secondo WSAVA; BCS esiste in `dog_weight_events` ma oggi non è esposto in `DigestiveContext`.
- Durata esplicita del disturbo: i conteggi 7/30 giorni non equivalgono all'esordio riportato dal proprietario.
- Frequenza evacuazioni strutturata: gli eventi registrati non coincidono necessariamente con tutte le evacuazioni reali.
- Accesso a garbage/toys/possible ingestion: utile per foreign-body context, ma non va chiesto sempre.

## Acceptance criteria
1. Stessa immagine/versione non cambia score o safety dopo il primo risultato cacheizzato.
2. Score 1-7 spiegabile dai primitivi visivi.
3. `possible` sangue/melena richiede focused verification; errore tecnico = cautela, non silenzio.
4. Colori ordinari non producono diagnosi/causa.
5. Nessun alimento viene accusato/assolto per sola coincidenza.
6. Foto insufficiente e safety anomalies non insegnano baseline.
7. Una sola useful action: safety/follow-up > nutrition gap > contextual/no action.
8. Ogni claim attiva ha source IDs validi e test di retrieval/forbidden behavior.

## Prompt pronto per Cursor

> Leggi prima la `main` attuale e non cambiare l'architettura digestiva già stabilizzata.
>
> Integra `DOGly_Digestive_Knowledge_Registry_v1_draft.json` come **Knowledge Registry versionato del dominio digestivo**.
>
> Obiettivo: aumentare la conoscenza scientifica del Digestive Intelligence senza trasformare DOGly in un motore diagnostico e senza spostare la fonte di verità in Supabase.
>
> Prima valuta come si incastra con `backend/app/knowledge/digestive.py`, `backend/app/knowledge/intelligence_v3.py`, `backend/app/knowledge/data/dogly_intelligence_v3.json`, `backend/app/domains/digestive_observation.py`, `backend/app/domains/digestive_verification.py`, `backend/app/domains/digestive_intelligence.py`.
>
> Preferenza: registry digestivo dedicato e versionato, retrieval deterministico e source IDs auditabili. Non reinterpretare scientificamente le claim. Se una claim non è supportabile con i campi attuali, lasciala inattiva/documentata invece di inventare dati.
>
> Priorità V1: fecal score 1-7 deterministico dai primitivi visibili; photo/image-quality limitations; black/tarry e fresh-blood safety; mucus/foreign material/undigested food non diagnostici; activity/appetite/vomiting/frequency; diet history/amount/recent transition/treats/supplements; personal baseline + learning exclusions.
>
> Mantieni: observer ≠ reasoner; AI osserva e regole deterministiche decidono safety; stessa foto/versione riusa observation; display_eligible ≠ learning_eligible; owner context non sovrascrive visual evidence; una sola useful action; nessuna diagnosi/causalità da foto.
>
> Non implementare nuove terapie, dosaggi, farmaci, Wellbeing, Live Audio o Behavior Intelligence.
>
> Aggiungi test su mapping score 1-7, non-inferenza da criteri non visibili, ordinary color != diagnosis, possible vs clear blood/melena, foreign material != obstruction, recent food change != causality, insufficient/safety events != baseline learning, registry version/checksum/retrieval deterministico.
>
> Lavora direttamente su `main`, singolo commit coerente e fermati. Riporta SHA, schema registry, claim attive/inattive, test e CI.