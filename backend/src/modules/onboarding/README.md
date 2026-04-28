# Onboarding Module

Tenant master-admin onboarding lifecycle module.

## Responsibilities
- Resolve tenant onboarding status snapshot
- Persist onboarding step progress (idempotent)
- Normalize business questionnaire payload for advisory classification
- Complete onboarding with readiness validation
- Trigger storefront sync on completion

## Contracts
- Repository contract: `getStatus`, `saveStep`, `complete`
- State values: `not_started | in_progress | completed`
- Step keys: `business_profile | brand_assets | business_classification | readiness`
- Advisory classification snapshot fields:
  - `visibility_mode` (`ghost | catalog | inquiry | transaction`)
  - `monetization_tier` (`tier_0 | tier_1 | tier_2 | tier_3`)
  - `workflow_mode_recommendation` (`msme | manufacturing`)
  - `business_mode_template_recommendation` (`retail | services | manufacturing | food_manufacturing | fnb | hospitality | healthcare | ticketing_transport | logistics_distribution | education_institutions | msme`)
  - `compliance_path_hint` (`regulated_ready | assisted_compliance | informal_observe`)
