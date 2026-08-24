---
status: reference
owner: engineering
last_reviewed: 2026-08-23
declaration_id: 2026-08-23-ims-settings-lint-entity-escape
classification: major
surfaces: settings
reason_codes_impacted: NONE
policy_version: 2026.08.23
verification_evidence: npm run lint (apps/dgfy-ims),npm run build:skupervisor,npm run check:compliance
rollback_note: Revert this commit. The only source change is two HTML entity escapes inside static JSX copy on the "This Store Has No Location" empty-state banner; no settings field, persisted value, form handler, or API call changed, so rollback carries no data or compliance-state risk.
preflight_result: no_breach
preflight_reason_code: ALLOWED
preflight_run_at: 2026-08-23T20:18:48+08:00
preflight_request_ref: NOT-EXECUTED-917-IMS-SETTINGS-LINT-ESCAPE
---

# IMS Settings Lint Entity Escape

## Compliance Impact Classification

Classified `major` because `scripts/check-compliance-impact.js`'s `COMPLIANCE_SENSITIVE_RULES`
hard-floors any change to `apps/dgfy-ims/Pages/Settings.jsx` at `major` with surface `settings`,
regardless of the change's actual content. That floor is an exact-path match on a file, not a
judgment about this specific diff — the same blunt-floor situation the on-branch precedent
`2026-08-22-frontend-split-develop-absorb-path-fixes.md` documents for a directory-level match.

**The actual content is not major.** The change escapes two literal `"` characters to `&quot;`
inside one block of static, already-rendered JSX text — the "Map publication is disabled for this
store" empty-state banner shown when `settings.storeHasNoLocation === true`. This clears the last 2
of 4 `react/no-unescaped-entities` errors left on this file after issue #917's first pass (the
other 2, in unrelated copy, were already fixed and merged). **No settings field, form handler,
persisted value, validation rule, API call, or user-facing behavior changed** — the rendered text
is byte-identical except for the two escaped quote characters, which HTML/JSX render identically to
the literal `"` they replace. This is not a substantive edit amortized into a real change; it is
the entity-escape fix itself, made because the rule inherited byte-for-byte from
`origin/develop:apps/dgfy-web/.eslintrc.json` is real and correctly flags it — relaxing the rule to
avoid the declaration was considered and rejected as the less principled path.

## Affected Surfaces

`settings` (via the exact-path rule above). No `pos`, `terminal`, `payments`, or `compliance`
surface logic changed — this file's compliance floor is a blanket rule on the whole Settings page,
not a marker that this specific change touches settings *logic*.

## Compliance Preconditions

None apply — no reason code, compliance policy, tenant lifecycle, or settings persistence rule
changed. `reason_codes_impacted: NONE` reflects that no reason-code-bearing decision path was
touched.

## Verification Evidence

- `npm run lint` in `apps/dgfy-ims`: the file's `react/no-unescaped-entities` error count went from
  2 to 0; the job's remaining findings are pre-existing warnings, unaffected by this change.
- `npm run build:skupervisor`: real Vite production build, succeeded, including the `es-compat-guard`
  build-time plugin pass.
- `npm run check:compliance`: PASS, confirming this declaration itself validates against the gate's
  frontmatter/section requirements.
- Manual diff review: the sole change is `"This Store Has No Location"` → `&quot;This Store Has No
  Location&quot;` at `apps/dgfy-ims/Pages/Settings.jsx:2917`, inside a `<p>` element with no
  surrounding logic change.

## Changed Files

- `apps/dgfy-ims/Pages/Settings.jsx`
