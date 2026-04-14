---
status: reference
last_reviewed: 2026-03-30
---

# Cleanup Log (2026-03-30)

Scope: conservative cleanup after documentation synchronization.

## Removed Files

1. `frontend/Layout.js`
- Proof of irrelevance:
  - Not imported by app entrypoints (`frontend/src/main.jsx` imports `../Layout.jsx`).
  - Workspace search found no runtime imports of `Layout.js`.
  - Tailwind `content` config was the only remaining reference.
- Rationale:
  - Legacy duplicate layout component; active layout is `frontend/Layout.jsx`.
  - Keeping both increases maintenance drift and developer confusion.

## Updated For Safe Removal

1. `frontend/tailwind.config.js`
- Removed stale `./Layout.js` path from `content`.
- Ensures Tailwind scan reflects active source files only.

## Kept Intentionally

1. `frontend/Layout.jsx`
- Active layout used by current frontend entrypoint.

2. `backend/scripts/*` debug/diagnostic scripts
- Not removed in this pass because several are operational diagnostics used during local remediation and runtime checks.
- Requires a separate script-governance pass with ownership tags before deletion.

## Additional Cleanup (Same Date)

1. `docs/ai/AI_CAPABILITIES.md`
- Proof of irrelevance:
  - No in-repo references point to this file as canonical output.
  - Auto-generation script and docs point to `docs/generated/AI_CAPABILITIES.md`.
  - File content timestamp was older than generated copy.
- Rationale:
  - Prevent stale duplicate capability docs.
  - Keep one canonical generated location.

## Documentation Corrections

1. `docs/ai/AI_GUIDELINES.md`
- Fixed broken relative link:
  - `generated/AI_CAPABILITIES.md` -> `../generated/AI_CAPABILITIES.md`

2. `docs/development/PROJECT_DEVELOPMENT_GUIDE.md`
- Updated stale path reference:
  - `docs/AI_GUIDELINES.md` -> `docs/ai/AI_GUIDELINES.md`

3. `docs/MIGRATION_MAP.md`
- Corrected AI capabilities map row to reflect canonical generated path.
