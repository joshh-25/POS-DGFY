// #1809 (epic #1548), Phase 324: the single declared source of truth for whether
// resolve-web-core-reachability.js's oracle NARROWS the gating verdict (vs. is a no-op, leaving
// scripts/check-app-version-bump.js's detectChangedApps() directory-level verdict untouched).
//
// Mirrors scripts/lib/version-bump-gate-toggle.js's own established pattern (#1569/#1592) --
// one declared source of truth, read directly at runtime, nothing to keep in sync by hand. Unlike
// that module, there's only ever one consumer today (check-app-version-bump.js's
// detectChangedAppsNarrowed()) -- resolve-frontend-build-triggers.js's own trigger-resolution
// intentionally does NOT read this toggle, since narrowing there is the entire point of that
// script (it has no pre-#1809 "old verdict" to fall back to -- see that script's own header).
//
// Flip NARROWING_ENABLED back to `false` as the one-line, zero-deploy rollback if the oracle ever
// produces a live false negative (an app that should have been flagged "changed" but wasn't) --
// this restores detectChangedApps()'s original, unmodified directory-level verdict for
// runCheck()/runFloor() without reverting any other code under time pressure.
//
// Shipped `true` at #1809's own implementation time: #1695's shadow-mode evidence (4 live CI runs,
// 8 shadow verdicts, 100% agreement with ground truth -- see #1809's own plan doc §1.1) plus the
// §2.1 multi-scope-package bug fix (this flip's own prerequisite) together clear the bar to gate.
const NARROWING_ENABLED = true;

function resolveNarrowingEnabled() {
    return NARROWING_ENABLED;
}

module.exports = { NARROWING_ENABLED, resolveNarrowingEnabled };
