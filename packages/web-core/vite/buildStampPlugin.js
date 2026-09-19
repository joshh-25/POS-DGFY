import fs from 'node:fs';
import path from 'node:path';

/**
 * ADR 0081 Decision 4 (#1548 Wave 3, Phase 278): resolves the version this app's build should
 * stamp everywhere it's surfaced -- `import.meta.env.VITE_APP_VERSION` (wired into each app's own
 * `define` block, alongside its existing `VITE_APP_SURFACE`/`VITE_BUILD_STAMP` entries), the
 * `<meta name="dgfy-version">` tag, and `version.json` (both via `buildStampPlugin` below).
 * `APP_VERSION` is the published image tag baked in as a build-time env var (Phase 277's
 * `ARG APP_VERSION` in every app's `infrastructure/docker/<app>/Dockerfile`); the package.json
 * fallback keeps a local `vite build`/`vite dev` with no build-arg baked working the same way
 * apps/dgfy-api's healthService.js falls back to its own package.json for `runtime_sha`'s sibling
 * `version` field.
 *
 * `packages/web-core` has no `version` of its own (ADR 0081's Context explicitly excludes it and
 * `packages/shared-constants` from this versioning scheme) -- each caller passes ITS OWN app
 * directory so this always reads that app's package.json, never this package's.
 *
 * @param {string} appDir - absolute path to the calling app's own directory (each vite.config.js's
 *   own `__dirname`).
 * @param {NodeJS.ProcessEnv} [env] - injectable for tests; defaults to `process.env`.
 * @returns {string} the resolved version, or `'unknown'` if neither source is available.
 */
export const resolveAppVersion = (appDir, env = process.env) => {
    const envVersion = String(env.APP_VERSION || '').trim();
    if (envVersion) {
        return envVersion;
    }

    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
        if (typeof pkg.version === 'string' && pkg.version.trim()) {
            return pkg.version.trim();
        }
    } catch {
        // Fall through to the sentinel below -- no package.json, or it has no version field.
    }

    return 'unknown';
};

/**
 * #1977 (Phase 342): resolves the explicit release floor and candidate revision this app's
 * build should stamp alongside the version. The floor is the bare per-app `X.Y.Z`
 * (`APP_RELEASE_FLOOR`, falling back to the app's own package.json -- which carries the bare
 * floor by definition under ADR 0081 Decision 3); the revision is the candidate `rN` fragment
 * (`APP_RELEASE_REVISION`, `null` when this build carries none -- ordinary DEV behavior).
 * The `VITE_APP_RELEASE_*` aliases exist because Docker build-args arrive in the builder
 * stage under those names (see `infrastructure/docker/<app>/Dockerfile`); both spellings are
 * accepted, the non-`VITE_` one wins when both are set.
 *
 * @param {string} appDir - absolute path to the calling app's own directory (each vite.config.js's
 *   own `__dirname`).
 * @param {NodeJS.ProcessEnv} [env] - injectable for tests; defaults to `process.env`.
 * @returns {{ floor: string, revision: string|null }} the resolved floor and revision.
 */
export const resolveReleaseFloor = (appDir, env = process.env) => {
    const floorCandidates = [env.APP_RELEASE_FLOOR, env.VITE_APP_RELEASE_FLOOR];
    for (const candidate of floorCandidates) {
        const trimmed = String(candidate || '').trim();
        if (trimmed) {
            return { floor: trimmed, revision: resolveReleaseRevision(env) };
        }
    }

    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
        if (typeof pkg.version === 'string' && pkg.version.trim()) {
            return { floor: pkg.version.trim(), revision: resolveReleaseRevision(env) };
        }
    } catch {
        // Fall through to the sentinel below -- no package.json, or it has no version field.
    }

    return { floor: 'unknown', revision: resolveReleaseRevision(env) };
};

const resolveReleaseRevision = (env) => {
    const revisionCandidates = [env.APP_RELEASE_REVISION, env.VITE_APP_RELEASE_REVISION];
    for (const candidate of revisionCandidates) {
        const trimmed = String(candidate || '').trim();
        if (trimmed) {
            return trimmed;
        }
    }
    return null;
};

/**
 * Vite plugin: stamps `version` into the built output two ways, for the two consumers ADR 0081
 * Decision 5 hands this format off to (#633's Sentry release tagging, #276's PWA update toast).
 * See `docs/deployment/PWA_SURFACE_CONTRACT.md`'s "Version Observability Surface" section for the
 * full shape and who reads what.
 *
 *   1. `<meta name="dgfy-version" content="...">`, injected into the built `index.html`.
 *   2. A generated `version.json` (`{"version": "..."}`), emitted into the build output root
 *      (e.g. served at `/version.json`) -- generated at build time via Rollup's `emitFile`, not
 *      hand-committed under the app's own `public/` (that directory holds real static assets
 *      checked into git; this value is build-derived and would go stale the moment it's copied
 *      there instead of regenerated).
 *
 * #1977 (Phase 342): when `release` (`resolveReleaseFloor` above) is supplied, the plugin also
 * stamps `<meta name="dgfy-release-floor">` / `<meta name="dgfy-release-revision">` (the latter
 * only when a revision is known) and extends `version.json` to
 * `{"version": "...", "release_floor": "...", "release_revision": "..."|null}` -- explicit
 * floor/revision metadata so runtime consumers never infer the floor from an alias. Called
 * with a bare version string alone, the legacy shape is emitted unchanged.
 *
 * Build-only (`apply: 'build'`) -- doesn't run under `vite dev`, matching
 * `esCompatGuardPlugin.js`'s own build-only scope in this same directory.
 *
 * @param {string} version - the resolved version (see `resolveAppVersion`), computed once by the
 *   caller and passed in here so it's the same value used in the `define` block.
 * @param {{ floor?: string, revision?: string|null }} [release] - optional floor/revision pair.
 */
export const buildStampPlugin = (version, release) => {
    const floor = release && typeof release.floor === 'string' && release.floor.trim() ? release.floor.trim() : null;
    const revision = release && typeof release.revision === 'string' && release.revision.trim() ? release.revision.trim() : null;
    return {
        name: 'dgfy-build-stamp',
        apply: 'build',
        transformIndexHtml() {
            const tags = [
                {
                    tag: 'meta',
                    attrs: { name: 'dgfy-version', content: version },
                    injectTo: 'head'
                }
            ];
            if (floor !== null) {
                tags.push({ tag: 'meta', attrs: { name: 'dgfy-release-floor', content: floor }, injectTo: 'head' });
            }
            if (revision !== null) {
                tags.push({ tag: 'meta', attrs: { name: 'dgfy-release-revision', content: revision }, injectTo: 'head' });
            }
            return tags;
        },
        generateBundle() {
            const payload = floor === null ? { version } : { version, release_floor: floor, release_revision: revision };
            this.emitFile({
                type: 'asset',
                fileName: 'version.json',
                source: JSON.stringify(payload)
            });
        }
    };
};
