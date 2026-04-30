# API Docs

When to use:
1. API contracts and endpoint semantics
2. Request/response format decisions
3. Integration behavior between frontend and backend

## Current Notes
1. Tenant onboarding contract includes advisory questionnaire classification via `step_key=business_classification`.
2. `GET /onboarding/status` exposes `tenant_onboarding_progress.classification_snapshot` (`visibility_mode`, `monetization_tier`, `workflow_mode_recommendation`, `compliance_path_hint`).
3. Onboarding classifier telemetry event keys include `classifier_viewed`, `classifier_saved`, and `classifier_skipped`.
4. Company user invitations are token-first. `POST /auth/accept-invite` resolves tenant context from the landlord invitation registry and returns the same usable auth payload shape as login.
5. Admin user-management invitation actions are documented in `docs/api/specification.md`: create invite, include pending invitations, resend, copy/generate manual link, and cancel.
