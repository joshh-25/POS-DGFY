---
status: reference
last_reviewed: 2026-03-27
---

# Cleanup Log (2026-03-27)

Scope: moderate cleanup, evidence-based only.

## Removed Files

1. `frontend/frontend_debug.log`
- Proof of irrelevance: no references in source, docs, or scripts (`rg` workspace scan).
- Rationale: local debug artifact, not used by runtime/build/test.

2. `frontend/lint_output.txt`
- Proof of irrelevance: no references in source, docs, or scripts (`rg` workspace scan).
- Rationale: stale generated lint output snapshot.

3. `frontend/debug-packaging-data.jsx`
- Proof of irrelevance: no references in source, docs, or scripts (`rg` workspace scan).
- Rationale: standalone debug helper, not imported by app entrypoints.

4. `frontend/debug-packaging.sql`
- Proof of irrelevance: no references in source, docs, or scripts (`rg` workspace scan).
- Rationale: ad hoc SQL scratch/debug file.

5. `frontend/test-api.html`
- Proof of irrelevance: no references in source, docs, or scripts (`rg` workspace scan).
- Rationale: manual API test scratch page not part of app build/runtime.

## Kept Intentionally

1. `frontend/Layout.js`
- Kept because it appears in Tailwind content configuration; removing may affect class extraction.
