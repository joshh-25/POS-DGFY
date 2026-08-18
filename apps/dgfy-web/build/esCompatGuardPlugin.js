/**
 * Build-time backstop for the Chrome 80-84 iMin POS WebView compatibility
 * guardrail (#666 / ADR 0067).
 *
 * Layer 1 (../src/compat/chrome80Runtime.js) shims the runtime methods known
 * to be reachable today. This plugin is the layer that catches everything
 * ELSE -- a method Layer 1 doesn't shim, landing from first-party code OR a
 * dependency upgrade, INCLUDING via an evil merge that never appears in a
 * reviewable PR diff (exactly how #664's `.at(-1)` shipped -- commit
 * 7047b297 appears in neither merge parent).
 *
 * `structuredClone` is deliberately NOT in the deny list below, despite
 * being one of the methods #666's own issue named -- this plugin's first
 * real build caught it live, reachable from SKUpervisor's lazy AI Chat
 * chunk (mdast-util-to-hast), and it was promoted into Layer 1's shim list
 * instead of allowlisted here. That is the intended lifecycle for a denylist
 * hit: a real, shimmable find gets fixed at the source, not silenced.
 *
 * It runs inside `vite build`'s own `generateBundle` hook, which means it
 * executes as part of `npm run build:all:parallel` -- the same command the
 * frontend Dockerfile runs, which is what `pr-frontend-build-checks.yml`
 * (the ONLY workflow that runs automatically on every PR today; ESLint does
 * not, see docs/architecture/adr/0067-*.md) already builds on every PR into
 * develop/staging/main. No CI workflow change is needed for this to gate
 * PRs -- it gates on the MERGED tree, by construction, because that's what
 * gets built.
 *
 * Scope: only methods NOT already shimmed by Layer 1. Deliberately excludes
 * `.with(` -- too collision-prone against ordinary user-defined `.with()`
 * methods in minified third-party output to be a safe string match; a
 * dedicated AST-based check would be needed for that one, and isn't built
 * here.
 */

// Token -> { chromeVersion, note }. Matched as a literal substring against
// each emitted chunk's source. Deliberately simple (no AST parse of output
// bundles) -- these are rare, distinctive tokens; a literal scan is enough
// to catch a real occurrence and cheap enough to run on every build.
const DENYLIST = [
  { token: 'Object.groupBy(', chromeVersion: 117 },
  { token: 'Map.groupBy(', chromeVersion: 117 },
  { token: '.toSorted(', chromeVersion: 110 },
  { token: '.toReversed(', chromeVersion: 110 },
  { token: '.toSpliced(', chromeVersion: 110 },
  { token: 'AbortSignal.timeout(', chromeVersion: 103 },
  { token: 'Array.fromAsync(', chromeVersion: 121 },
  { token: 'Promise.withResolvers(', chromeVersion: 119 }
];

/**
 * Reviewed escape hatch for a confirmed-safe hit (e.g. code proven
 * unreachable on the POS/store/skupervisor surfaces). Empty today -- every
 * denylist token was confirmed absent from all four apps' current dist
 * output and every bundled dependency during #666's investigation. Add an
 * entry only with a written reason, the same discipline
 * scripts/check-architecture-guardrails.js's allowlist already uses.
 *
 * Shape: { chunkPattern: RegExp, token: string, reason: string }
 */
const ALLOWLIST = [];

function isAllowlisted(chunkFileName, token) {
  return ALLOWLIST.some(
    (entry) => entry.token === token && entry.chunkPattern.test(chunkFileName)
  );
}

export default function esCompatGuardPlugin() {
  return {
    name: 'es-compat-guard',
    apply: 'build',
    generateBundle(_outputOptions, bundle) {
      const violations = [];

      for (const [fileName, chunkOrAsset] of Object.entries(bundle)) {
        if (chunkOrAsset.type !== 'chunk' || !fileName.endsWith('.js')) continue;
        const code = chunkOrAsset.code;

        for (const { token, chromeVersion } of DENYLIST) {
          if (code.includes(token) && !isAllowlisted(fileName, token)) {
            violations.push({ fileName, token, chromeVersion });
          }
        }
      }

      if (violations.length > 0) {
        const lines = violations.map(
          (v) => `  - ${v.fileName}: "${v.token}" (Chrome ${v.chromeVersion}+, iMin POS WebView is Chrome 80-84)`
        );
        this.error(
          `[es-compat-guard] Found ${violations.length} Chrome-80-incompatible runtime ` +
          `method(s) in the built output:\n${lines.join('\n')}\n\n` +
          'The iMin POS WebView fleet has no update path. Either avoid the method, add a ' +
          'shim to src/compat/chrome80Runtime.js if it is genuinely needed (see #666 / ' +
          'ADR 0067), or add a reviewed ALLOWLIST entry in build/esCompatGuardPlugin.js ' +
          'with a written reason if the code path is confirmed unreachable on this surface.'
        );
      }
    }
  };
}
