-- Auditable receipts for the bundled Intelligence V3 registry.

insert into internal.knowledge_claim_imports (
  registry_version,
  claim_id,
  checksum,
  source_ids
)
values
  ('3.0', 'POP_VARIATION_001', '0c8b5b3e3b65b5b2bd0e9d9322908519ddc8f17af3b5e7b7df8cdb4aa0751aed', '["MORRILL_2022_SCIENCE","DARWINS_ARK_DRYAD"]'),
  ('3.0', 'POP_FUNCTION_001', '0c8b5b3e3b65b5b2bd0e9d9322908519ddc8f17af3b5e7b7df8cdb4aa0751aed', '["MORRILL_2022_SCIENCE"]'),
  ('3.0', 'POP_NO_AGGRESSION_001', '0c8b5b3e3b65b5b2bd0e9d9322908519ddc8f17af3b5e7b7df8cdb4aa0751aed', '["MORRILL_2022_SCIENCE"]'),
  ('3.0', 'MORPH_VERIFY_001', '0c8b5b3e3b65b5b2bd0e9d9322908519ddc8f17af3b5e7b7df8cdb4aa0751aed', '["MORRILL_2022_SCIENCE"]'),
  ('3.0', 'DIGEST_LONGITUDINAL_001', '0c8b5b3e3b65b5b2bd0e9d9322908519ddc8f17af3b5e7b7df8cdb4aa0751aed', '["VCA_DIARRHEA_CONTEXT"]'),
  ('3.0', 'NUTR_WEIGHT_001', '0c8b5b3e3b65b5b2bd0e9d9322908519ddc8f17af3b5e7b7df8cdb4aa0751aed', '["WSAVA_NUTRITION_2011"]'),
  ('3.0', 'NUTR_TRANSITION_001', '0c8b5b3e3b65b5b2bd0e9d9322908519ddc8f17af3b5e7b7df8cdb4aa0751aed', '["AAHA_NUTRITION_2021"]'),
  ('3.0', 'OPFF_ATTRIBUTION_001', '0c8b5b3e3b65b5b2bd0e9d9322908519ddc8f17af3b5e7b7df8cdb4aa0751aed', '["OPEN_PET_FOOD_FACTS"]');
