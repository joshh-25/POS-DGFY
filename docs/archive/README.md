---
status: authoritative
authority_level: authoritative
owner: architecture
last_reviewed: 2026-08-12
applies_to: historical_docs
topic: docs_archive_policy
---

# Archive Policy

`docs/archive` contains historical documents kept for traceability.

Rules:
1. Archived docs are not authoritative for new implementation plans.
2. If a doc is archived, its replacement must be linked from the archived doc.
3. Planning and architecture decisions must cite non-archived authoritative docs.

Current archived sets:
- Compliance remediation records (April 2026): `docs/archive/compliance/2026-04-07/`
- Deployment transition record (2026-02-19): `docs/archive/deployment/2026-02-19/`
- Exploratory Phase 32 Gemini QA artifacts (2026-02-18): `docs/archive/testing/2026-02/`
- POS hardening planning snapshots (March 2026): `docs/archive/testing/2026-03/`
- Historical reference cleanup/commit logs (March-April 2026): `docs/archive/reference/2026-03/`, `docs/archive/reference/2026-04/`
- Historical SKU expansion/storefront phased planning snapshots (March 2026): `docs/archive/reference/2026-03/`
- Dated release go/no-go checklist snapshot (April 2026): `docs/archive/testing/2026-04/`
- Release go/no-go checklist historical evidence log removed during the #375 rewrite (August 2026): `docs/archive/testing/2026-08/`
- Loose one-off status/audit notes retired from `.claude/` during #365's stale-agent-surface cleanup (August 2026): `docs/archive/reference/claude-legacy-notes/`
