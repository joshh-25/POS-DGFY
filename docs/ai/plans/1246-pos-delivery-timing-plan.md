# Implementation plan — #1246: surface delivery-timing fields on POS

## Investigation findings (grounding the plan)

- **No backend work needed.** `apps/dgfy-api/src/modules/tenantLocations/usecases/tenantLocationUseCases.js`
  already normalizes/validates all four fields (`scheduling_enabled`, `immediate_fulfillment_enabled`,
  `fulfillment_lead_time_min_days`, `fulfillment_lead_time_max_days`) in `normalizePayload` and
  `assertFulfillmentLeadTimeValid` (#1218). `PUT /tenant-locations/:id` is gated by
  `checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS)` (`settings:edit`) — this is also what
  IMS's Settings surface and every other `settings:edit`-gated POS panel key off, so it's the
  correct owner/admin mirror (`DEFAULT_ROLE_PERMISSIONS`: `admin` gets it via "gets everything by
  default", `manager` gets it explicitly; `is_master_admin` — POS's "owner" bit — always bypasses
  the permission list). No API surface or service change implied.
- **`packages/web-core/src/services/tenantLocationService.js`** is a thin passthrough
  (`updateTenantLocation(locationId, payload)` → `PUT /tenant-locations/:id`) already shared by both
  apps. No change needed — new fields just ride the existing payload object.
- **POS already has its own full duplicate of the location-editing form.** It is NOT the read-only
  surface the issue title might suggest — `packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`'s
  `SettingsWorkspace` → "Storefront" tab (`SETTINGS_TABS`, id `'storefront'`) already renders a full
  location create/edit form (`createDefaultLocationForm`, `locationForm` state, `handleEditLocation`,
  `handleSaveLocation`) with name/address/geo/delivery-radius/wait-time/is_open/is_primary_storefront/
  allow_out_of_stock_sales/supports_delivery/supports_pickup/supports_dine_in. It is a hand-built,
  independent re-implementation of IMS's `Settings.jsx` location form — same fields, different JSX,
  different component, no shared UI component between the two apps today. This is the existing,
  already-shipped precedent for how this exact class of duplication is handled in this codebase.
- **The four #1218 timing fields are the only fields from that IMS form NOT yet ported to POS's copy.**
  Everything else about "the fulfillment panel" already exists in POS — confirming scope is correctly
  narrowed to just the 4 timing fields per Pat's resolution.
- **Role gating precedent already exists in this exact file**: `canEditSettings` (line ~5306,
  `terminalUser?.is_master_admin === true || resolveUserPermissionList(terminalUser).includes('settings:edit')`)
  is already computed in `SettingsWorkspace` and already used to gate `PosCashierAttendanceSettingsCard`
  (`canEdit={canEditSettings}`). This is the closest POS-side equivalent to IMS's implicit
  page-level admin gate, and it's already wired to the exact backend permission
  (`PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS`) that protects the PUT endpoint — reuse it, don't invent
  a new gate.
- **IMS's own client-side validation** (`Settings.jsx` ~2399-2405) mirrors
  `assertFulfillmentLeadTimeValid` and is a plain pure computation over `locationForm` fields
  (`leadTimeRequiredMissing`, `leadTimeRangeInverted`) — no hook, no import, trivially portable.

## Open call: duplication vs. shared component — **recommend duplication, matching existing precedent**

POS's Storefront tab is *already* a hand-rolled duplicate of IMS's location form (different JSX,
different state shape, different surrounding chrome — tab strip inside a terminal workspace vs. a
full admin settings page). Introducing a shared `<LocationFulfillmentTimingFields>` component now
would:
- Fix inconsistency for 4 fields while leaving the other ~10 duplicated fields as-is — a partial,
  confusing refactor that doesn't resolve the actual duplication, just adds a one-off exception to it.
- Require reconciling two different local-state shapes (IMS's `locationForm` via
  `handleLocationFormChange`, POS's `locationForm` via inline `setLocationForm` updater callbals) into
  a shared controlled-component contract — real design work, out of proportion to 4 fields, and not
  something to do implicitly while closing #1246.
- A proper de-duplication of the whole location-settings form across IMS/POS is a defensible follow-up
  (file as a separate `pm`-shaped issue if desired) but is not this issue's scope.

**Recommendation: duplicate the 4 fields' JSX + local state into POS's existing form**, exactly as
POS already duplicates the other ~10 fields from the same IMS form. **Do** factor the one piece of
non-trivial logic — the lead-time validation predicate IMS already wrote — into a tiny shared pure
function so the "required when immediate fulfillment is off" / "max >= min" rule isn't hand-copied
into a second place with a chance to drift. Location: `packages/web-core/src/features/settings/`
(parallel to the existing `storefrontBusinessHours.js` shared-pure-logic precedent in that same
directory), e.g. `fulfillmentLeadTime.js`:

```js
// packages/web-core/src/features/settings/fulfillmentLeadTime.js
export const evaluateFulfillmentLeadTime = ({ immediate_fulfillment_enabled, fulfillment_lead_time_min_days, fulfillment_lead_time_max_days }) => {
  const minRaw = fulfillment_lead_time_min_days;
  const maxRaw = fulfillment_lead_time_max_days;
  const requiredMissing = immediate_fulfillment_enabled === false && (minRaw === '' || maxRaw === '');
  const rangeInverted = minRaw !== '' && maxRaw !== '' && Number(maxRaw) < Number(minRaw);
  return { requiredMissing, rangeInverted };
};
```

Both `apps/dgfy-ims/Pages/Settings.jsx` and POS's `TerminalOperationsWorkspace.jsx` would import this
instead of each computing it inline. (Retrofitting IMS to use it is a small, low-risk, in-scope
cleanup — same PR — not a separate migration.)

## Files to touch

1. **`packages/web-core/src/features/settings/fulfillmentLeadTime.js`** (new) — the shared pure
   validation helper above, plus a unit test file
   `packages/web-core/src/features/settings/__tests__/fulfillmentLeadTime.test.js` (mirrors sibling
   `storefrontBusinessHours.js` test coverage pattern).

2. **`packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx`** (primary
   change):
   - `createDefaultLocationForm()` (~line 596): add
     `scheduling_enabled: true, immediate_fulfillment_enabled: true, fulfillment_lead_time_min_days: '', fulfillment_lead_time_max_days: ''`.
   - `handleEditLocation` (~line 6486): populate the 4 fields from `location.*` the same way IMS does
     (`location?.scheduling_enabled !== false`, etc.; lead-time days as `String(...)` or `''` when
     `== null`).
   - `handleSaveLocation` payload build (~line 6509): add the 4 fields to `payload`, using the same
     coercion IMS uses (`!== false` for the two booleans; `'' → null` else `Number(...)` for the two
     day counts).
   - `handleSaveLocation` local validation (~line 6528, alongside the existing `localErrors` checks):
     call `evaluateFulfillmentLeadTime(payload)` from the new shared helper; push a
     `{ field: 'fulfillment_lead_time_min_days', message: '...' }`-shaped entry into `localErrors`
     when `requiredMissing` or `rangeInverted`, mirroring the existing local-error pattern
     (`openValidationModal` + `toast.error` already handle whatever's pushed here — no new plumbing).
   - JSX: add the 4 field controls to the Storefront pane, positioned after the existing
     `supports_pickup` switch (~line 8710, right before the "Bottom Action Bar Card"), reusing the
     same `Switch`/`Label`/`Input` components and Tailwind classes already used for
     `supports_delivery`/`supports_pickup` immediately above — copy structure, not the label copy
     (reuse IMS's copy verbatim for consistency: "Allow Scheduled Orders" / "Allow Immediate
     Fulfillment" / "Fulfillment Lead Time (days)" + the same helper/warning text). Gate visibility of
     the min/max day inputs on `locationForm.immediate_fulfillment_enabled === false`, matching IMS.
   - **Role gating**: wrap the 4 new controls (and, per the field-level convention already used for
     `supports_delivery`/`supports_pickup`'s `disabled={lastFulfillmentMethodLocked && ...}`) with
     `disabled={!canEditSettings}` on each `Switch`/`Input`. `canEditSettings` is already computed at
     the top of `SettingsWorkspace` (~line 5306) — no new permission plumbing required, just apply it
     to the new controls (and optionally to the pre-existing storefront fields too if Pat wants the
     gating tightened repo-wide, but that's outside #1246's stated scope — flag it as a nit, don't
     silently expand scope). Note the existing gap: none of the *other* Storefront-tab fields are
     currently `canEditSettings`-gated at all (only `PosCashierAttendanceSettingsCard` uses it today) —
     worth a one-line callout in the PR description so it doesn't look like an oversight in review, but
     out of scope to fix here since #1246 is scoped to the 4 timing fields only.

3. **`apps/dgfy-ims/Pages/Settings.jsx`** (small, in-scope cleanup, same PR): replace the inline
   `leadTimeRequiredMissing`/`leadTimeRangeInverted` computation (~line 2399-2405) with a call to the
   new shared `evaluateFulfillmentLeadTime` helper, import added near the other
   `packages/web-core/src/features/settings/*` imports already at the top of the file. Pure
   refactor, no behavior change — reduces this PR's own risk of the two copies drifting apart, since
   it's introducing the second copy.

## What does NOT change

- No new API endpoint, no `tenantLocationService.js` change, no backend usecase/validator change —
  confirmed already complete for these 4 fields (#1218).
- No `supports_delivery`/`supports_pickup`/dine-in additions to POS — explicitly out of scope per
  Pat.
- No new shared React component — duplication is the deliberate, precedent-matching call for this
  issue's scope; only the pure validation logic is shared.

## Self-verification for the execution stage (Tier 0, per `implement` SKILL.md)

- `npm run build:pos` (web-core is consumed via `file:` dep with no build step of its own, but a
  `packages/web-core` change can affect other apps too — `npm run build:skupervisor` and
  `npm run build:store` should also be run since `packages/web-core/src/features/settings/` is
  shared trunk, even though this specific new file has no other current consumer besides IMS/POS).
- No `package.json` touched → no lockfile sync needed.
- Compliance: touches `apps/dgfy-ims` (frontend, no PII/payment surface change) and
  `packages/web-core`/`apps/dgfy-pos` (POS frontend) — `frontend/src/features/pos` compliance
  impact-declaration convention noted in memory should be checked by the execution worker via
  `npm run check:compliance` before commit, per the `implement` skill's Tier 0.

## Risks / edge cases for the execution stage to watch

- `location.fulfillment_lead_time_min_days`/`max_days` come back from the API as integers or `null`
  — `handleEditLocation` must stringify/empty exactly like IMS does (`location?.field == null ? '' : String(location.field)`),
  not `location.field ?? ''` (which would render a numeric `0` correctly but is worth matching IMS's
  exact `==null` check rather than re-deriving it).
- The lead-time inputs must only render when `immediate_fulfillment_enabled === false`, same as IMS —
  don't show empty required-looking inputs when immediate fulfillment is on.
- `canEditSettings === false` should disable, not hide, the controls (consistent with how
  `PosCashierAttendanceSettingsCard` treats its own `canEdit` prop) so non-owner/admin cashiers can at
  least see current timing settings without being able to change them — confirm this against Pat's
  "fully editable (not read-only)" instruction, which is about the feature as a whole being editable
  on POS (vs. a prior read-only design), not about every role seeing an editable UI; the *visibility*
  vs *disabled* choice for non-privileged roles is a UX call worth a quick confirm with Pat if the
  execution worker wants to deviate from the `PosCashierAttendanceSettingsCard` disabled-not-hidden
  precedent.
