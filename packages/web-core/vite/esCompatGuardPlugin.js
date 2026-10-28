/**
 * Build-time backstop for the Chrome 80-84 iMin POS WebView compatibility
 * guardrail (#666 / ADR 0067).
 *
 * Layer 1 (../src/compat/chrome80Runtime.js) shims runtime methods known to
 * be reachable today. The ordinary app build catches methods Layer 1 does
 * not shim, including code added by a dependency or an evil merge. The POS
 * final-output scan also checks worker-named chunks and assets for methods
 * covered by Layer 1 and requires a verified worker bootstrap before use.
 *
 * `structuredClone` and `.toSorted(` are deliberately NOT in the deny list
 * below. `structuredClone` was #666's own first live catch (SKUpervisor's
 * lazy AI Chat chunk, via mdast-util-to-hast); `.toSorted(` was caught on
 * this guardrail's first build against the 2026-08-22 develop absorb
 * (@radix-ui/react-collection, transitively bundled via
 * @radix-ui/react-accordion/@radix-ui/react-scroll-area, reachable from
 * IMS's Items page). Both were promoted into Layer 1's shim list instead of
 * allowlisted here. That is the intended lifecycle for a denylist hit: a
 * real, shimmable find gets fixed at the source, not silenced.
 *
 * It runs inside Vite's `generateBundle` hook. In POS, the final app build
 * sees the MapLibre worker emitted by `?worker&url` as an asset and checks
 * that output after the worker banner has been applied.
 *
 * Main-thread builds check only methods not already shimmed by Layer 1. The
 * POS final-output scan checks worker-named JS chunks and assets against the
 * shim-dependent method list and requires the exact runtime source hash to
 * precede its use.
 * `.with(` remains deliberately excluded -- it is too collision-prone
 * against ordinary user-defined methods in minified output to be a safe
 * string match; a dedicated AST-based check would be needed for that one.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';

// Token -> { chromeVersion, note }. Matched as a literal substring against
// emitted JavaScript. Deliberately simple (no AST parse of output
// bundles) -- these are rare, distinctive tokens; a literal scan is enough
// to catch a real occurrence and cheap enough to run on every build.
const DENYLIST = [
  { token: 'Object.groupBy(', chromeVersion: 117 },
  { token: 'Map.groupBy(', chromeVersion: 117 },
  { token: '.toReversed(', chromeVersion: 110 },
  { token: '.toSpliced(', chromeVersion: 110 },
  { token: 'AbortSignal.timeout(', chromeVersion: 103 },
  { token: 'Array.fromAsync(', chromeVersion: 121 },
  { token: 'Promise.withResolvers(', chromeVersion: 119 }
];

// These methods are safe in the app realm only when chrome80Runtime.js has
// already run. Workers have their own global scope, so a worker using one of
// these methods must carry the exact runtime shim bootstrap at byte zero.
const MAIN_THREAD_SHIM_METHODS = [
  { token: '.replaceAll(', chromeVersion: 85 },
  { token: '.at(', chromeVersion: 92 },
  { token: 'Object.hasOwn(', chromeVersion: 93 },
  { token: '.findLast(', chromeVersion: 97 },
  { token: '.findLastIndex(', chromeVersion: 97 },
  {
    token: 'structuredClone(',
    chromeVersion: 98,
    requiresWorkerSemanticsReview: true
  },
  { token: '.toSorted(', chromeVersion: 110 }
];

const WORKER_BOOTSTRAP_PROPERTY = '__DGFY_CHROME80_WORKER_BOOTSTRAP_V1__';
const WORKER_BOOTSTRAP_END_PROPERTY = '__DGFY_CHROME80_WORKER_BOOTSTRAP_END_V1__';
const WORKER_SHIM_DEFINITION_MARKERS = [
  'Array.prototype.at',
  'String.prototype.at',
  'Object.hasOwn',
  'String.prototype.replaceAll',
  'Array.prototype.findLast',
  'Array.prototype.findLastIndex',
  'globalThis.structuredClone',
  'Array.prototype.toSorted'
];
let chrome80Runtime;

function getChrome80Runtime(runtimeShimPath) {
  if (!chrome80Runtime) {
    const source = fs.readFileSync(
      runtimeShimPath || new URL('../src/compat/chrome80Runtime.js', import.meta.url),
      'utf8'
    );
    chrome80Runtime = {
      source,
      hash: createHash('sha256').update(source).digest('hex')
    };
  }

  return chrome80Runtime;
}

function getWorkerBootstrapPrefix(runtimeShimPath) {
  const { source, hash } = getChrome80Runtime(runtimeShimPath);
  // Keep the shim's top-level declarations out of MapLibre's global lexical
  // scope, identify the exact source used, and execute it before the worker
  // bundle's entry code. The assignment survives minification; comments do not.
  return `(() => { globalThis.${WORKER_BOOTSTRAP_PROPERTY} = 'sha256:${hash}';\n${source}\nglobalThis.${WORKER_BOOTSTRAP_END_PROPERTY} = 'sha256:${hash}';\n})();\n`;
}

function getJavaScriptCode(fileName, output) {
  if (!/\.m?js$/i.test(fileName)) return null;
  if (output.type === 'chunk') return output.code;
  if (output.type !== 'asset') return null;
  if (typeof output.source === 'string') return output.source;
  if (output.source instanceof Uint8Array) return Buffer.from(output.source).toString('utf8');
  return null;
}

function isMapLibreWorkerOutput(fileName, output) {
  const identifiers = [
    fileName,
    output.name,
    output.facadeModuleId,
    ...Object.keys(output.modules ?? {})
  ];
  return identifiers.some((value) => String(value || '').includes('maplibre-gl-worker'));
}

function hasWorkerOutputName(fileName) {
  const basename = fileName.slice(fileName.lastIndexOf('/') + 1);
  const separatedWorker = /(?:^|[-_])worker(?:[-_.]|$)/i.test(basename);
  const camelCaseWorkerEntry = /Worker(?:[-_.]|$)/.test(basename);
  return /\.m?js$/i.test(basename) && (separatedWorker || camelCaseWorkerEntry);
}

function getVerifiedWorkerCode(code, runtimeShimPath) {
  const { hash } = getChrome80Runtime(runtimeShimPath);
  const propertyIndex = code.indexOf(WORKER_BOOTSTRAP_PROPERTY);
  if (propertyIndex === -1) return null;

  if (MAIN_THREAD_SHIM_METHODS.some((method) => {
    const methodIndex = code.indexOf(method.token);
    return methodIndex !== -1 && methodIndex < propertyIndex;
  })) return null;

  const startHashIndex = code.indexOf(`sha256:${hash}`, propertyIndex);
  if (startHashIndex === -1) return null;

  const endPropertyIndex = code.indexOf(WORKER_BOOTSTRAP_END_PROPERTY, startHashIndex);
  if (endPropertyIndex === -1) return null;
  const endHashIndex = code.indexOf(`sha256:${hash}`, endPropertyIndex);
  if (endHashIndex === -1) return null;

  const bootstrapCode = code.slice(propertyIndex, endPropertyIndex);
  if (WORKER_SHIM_DEFINITION_MARKERS.some((marker) => !bootstrapCode.includes(marker))) return null;

  // The end marker separates the shim's own definitions from MapLibre's
  // worker code. This keeps the guard from treating the bootstrap itself as
  // an unshimmed use (notably its structuredClone fallback definition).
  return code.slice(endHashIndex + `sha256:${hash}`.length);
}

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

export default function esCompatGuardPlugin({
  inspectWorkerOutputs = false,
  runtimeShimPath = null
} = {}) {
  return {
    name: 'es-compat-guard',
    apply: 'build',
    generateBundle(_outputOptions, bundle) {
      const violations = [];

      for (const [fileName, chunkOrAsset] of Object.entries(bundle)) {
        const code = getJavaScriptCode(fileName, chunkOrAsset);
        if (code == null) continue;

        const isWorkerOutput = inspectWorkerOutputs && hasWorkerOutputName(fileName);
        const isScannedJavaScript = chunkOrAsset.type === 'chunk' || isWorkerOutput;
        if (!isScannedJavaScript) continue;

        const finalCode = code;

        for (const { token, chromeVersion } of DENYLIST) {
          if (finalCode.includes(token) && !isAllowlisted(fileName, token)) {
            violations.push({ fileName, token, chromeVersion, workerBootstrapRequired: false });
          }
        }

        if (isWorkerOutput) {
          const workerCode = getVerifiedWorkerCode(finalCode, runtimeShimPath);
          const hasVerifiedBootstrap = workerCode !== null;
          const codeToCheck = hasVerifiedBootstrap ? workerCode : finalCode;
          for (const method of MAIN_THREAD_SHIM_METHODS) {
            if (!codeToCheck.includes(method.token)) continue;
            if (!hasVerifiedBootstrap) {
              violations.push({
                fileName,
                token: method.token,
                chromeVersion: method.chromeVersion,
                workerBootstrapRequired: true
              });
            } else if (method.requiresWorkerSemanticsReview) {
              violations.push({
                fileName,
                token: method.token,
                chromeVersion: method.chromeVersion,
                workerSemanticsReviewRequired: true
              });
            }
          }
        }
      }

      if (violations.length > 0) {
        const lines = violations.map(
          (v) => `  - ${v.fileName}: "${v.token}" (Chrome ${v.chromeVersion}+, iMin POS WebView is Chrome 80-84)` +
            (v.workerBootstrapRequired
              ? ' — worker output requires the verified chrome80Runtime.js bootstrap before it uses this method'
              : v.workerSemanticsReviewRequired
                ? ' — the existing structuredClone fallback is partial; verify worker payload types or extend the shim'
                : '')
        );
        this.error(
          `[es-compat-guard] Found ${violations.length} Chrome-80-incompatible runtime ` +
          `method(s) in the built output:\n${lines.join('\n')}\n\n` +
          'The iMin POS WebView fleet has no update path. Either avoid the method, add a ' +
          'shim to src/compat/chrome80Runtime.js if it is genuinely needed (see #666 / ' +
          'ADR 0067), or add a reviewed ALLOWLIST entry in packages/web-core/vite/esCompatGuardPlugin.js ' +
          'with a written reason if the code path is confirmed unreachable on this surface.'
        );
      }
    }
  };
}

export function createMapLibreWorkerBootstrapBanner(runtimeShimPath = null) {
  const bootstrapPrefix = getWorkerBootstrapPrefix(runtimeShimPath);
  return (chunk) => isMapLibreWorkerOutput(chunk.fileName || '', chunk) ? bootstrapPrefix : '';
}
