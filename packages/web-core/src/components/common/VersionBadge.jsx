/**
 * VersionBadge — issue #1597: surface the running `VITE_APP_VERSION` (ADR 0081 Decision 4) in
 * each frontend app's UI, always visible, so a support conversation or a live spot-check doesn't
 * have to go through `/health` or `docker buildx imagetools inspect` to find out what's deployed.
 *
 * One shared implementation, three call sites (POS/IMS/Storefront `main.jsx`) — mirrors the
 * precedent `packages/web-core/vite/buildStampPlugin.js` already set for this same version value
 * ("prefer that over three separate implementations"). Deliberately lives in this directory, not
 * under `packages/web-core/src/features/**` or any Settings page — see the implementation plan for
 * issue #1597 §4 for why (this path matches none of `check-compliance-impact.js`'s sensitive-path
 * rules, so no compliance impact declaration is required for this design).
 *
 * Mounted once at the app-shell/root level (a sibling of `<ErrorBoundary>`/`<Toaster>`), not inside
 * any page or feature module, so it renders on every route regardless of which page is active.
 */
const VersionBadge = ({ label }) => {
  const rawVersion = typeof import.meta.env.VITE_APP_VERSION === 'string'
    ? import.meta.env.VITE_APP_VERSION.trim()
    : '';
  // Matches buildStampPlugin.js's own `resolveAppVersion` sentinel so the UI never shows a blank
  // or `undefined` string when the build-time value wasn't stamped.
  const version = rawVersion || 'unknown';
  const displayValue = `v${version}`;
  const fullLabel = label ? `${label} ${displayValue}` : displayValue;

  return (
    <span
      data-testid="dgfy-version-badge"
      title={fullLabel}
      aria-label={fullLabel}
      // pointer-events-none is required for POS specifically: this is a touchscreen terminal, and
      // the badge must never intercept a tap meant for a checkout control underneath it.
      // select-text opts back in to text selection despite the parent's pointer-events, so staff
      // can still copy the version string for a support ticket without the badge fighting the
      // touch UI.
      className="fixed bottom-1 left-1 z-40 select-text text-[10px] text-slate-400 pointer-events-none"
    >
      {fullLabel}
    </span>
  );
};

export default VersionBadge;
