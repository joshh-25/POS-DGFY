import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import {
  createPosOfflineBuildRevision,
  POS_OFFLINE_BUILD_REVISION_TOKEN
} from '../../../../../../apps/dgfy-pos/vitePosOfflinePrecachePlugin.js';

const frontendRoot = process.cwd();
const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
// apps/dgfy-pos and apps/dgfy-storefront (issue #322 split) are siblings of apps/dgfy-ims,
// not nested under it.
const posServiceWorkerPath = path.resolve(frontendRoot, '../dgfy-pos/public/sw.js');
const skupervisorServiceWorkerPath = path.resolve(frontendRoot, 'public/sw.js');
const storeServiceWorkerPath = path.resolve(frontendRoot, '../dgfy-storefront/public/sw.js');
const posMainPath = path.resolve(frontendRoot, '../dgfy-pos/src/main.jsx');
const posPrecachePluginPath = path.resolve(frontendRoot, '../dgfy-pos/vitePosOfflinePrecachePlugin.js');
const posViteConfigPath = path.resolve(frontendRoot, '../dgfy-pos/vite.config.js');

const readSource = (filePath) => fs.readFileSync(filePath, 'utf8');

describe('service worker caching contracts', () => {
  it('keeps POS service worker runtime caching bounded and API-safe', () => {
    const source = readSource(posServiceWorkerPath);
    expect(source).toContain("const BYPASS_PATH_PREFIXES = ['/api/', '/uploads/'];");
    expect(source).toContain(`const CACHE_VERSION = '${POS_OFFLINE_BUILD_REVISION_TOKEN}';`);
    expect(source).toContain('const STATIC_CACHEABLE_DESTINATIONS = new Set');
    expect(source).toContain('const MAX_RUNTIME_CACHE_ENTRIES = 120;');
    expect(source).toContain('if (!shouldHandleRuntimeRequest(event.request, requestUrl)) return;');
    expect(source).toContain("if (request.mode === 'navigate')");
    expect(source).toContain("event.respondWith(staleWhileRevalidateRuntime(event.request));");
    expect(source).toContain('cacheControl.includes(\'no-store\')');
    expect(source).toContain("const PRECACHE_MANIFEST_URL = `${BASE_PATH}precache-manifest.json`;");
    expect(source).toContain("await shellCache.addAll([...REQUIRED_SHELL_ASSETS, PRECACHE_MANIFEST_URL, ...assetUrls]);");
    expect(source).toContain('const precached = await shellCache.match(request, { ignoreVary: true });');
    // Chunk-load recovery (issue #182): a script response must be verified
    // as script-like before it's ever served from cache or written to one,
    // and a cached entry that fails that check is purged rather than
    // replayed on every subsequent request.
    expect(source).toContain('const SCRIPT_CONTENT_TYPE_PATTERN =');
    expect(source).toContain("if (request?.destination === 'script' && !isScriptLikeResponse(response)) return false;");
    expect(source).toContain('if (isCacheableResponse(response, request)) {');
    expect(source).toContain('if (precached) await shellCache.delete(request, { ignoreVary: true });');
  });

  it('emits a deterministic POS build manifest for critical JavaScript, CSS, fonts, and the web manifest', () => {
    const pluginSource = readSource(posPrecachePluginPath);
    const viteSource = readSource(posViteConfigPath);
    expect(pluginSource).toContain("const PRECACHE_FILE_NAME = 'precache-manifest.json';");
    expect(pluginSource).toContain("const CRITICAL_ASSET_PATTERN = /\\.(?:css|js|webmanifest|woff2?)$/i;");
    expect(pluginSource).toContain('assets: collectPosOfflinePrecacheAssets(bundle)');
    expect(viteSource).toContain('plugins: [react(), esCompatGuardPlugin(), posOfflinePrecachePlugin(),');
    expect(viteSource).toContain('...buildSentryVitePlugins(appSurface)');
  });

  it('creates a distinct POS worker revision for each production build', () => {
    const bundle = {
      app: { fileName: 'assets/index-abc.js', code: 'console.log("app")' }
    };
    expect(createPosOfflineBuildRevision(bundle, 1)).toMatch(/^v[a-f0-9]{16}$/);
    expect(createPosOfflineBuildRevision(bundle, 1)).toBe(createPosOfflineBuildRevision(bundle, 1));
    expect(createPosOfflineBuildRevision(bundle, 2)).not.toBe(createPosOfflineBuildRevision(bundle, 1));
  });

  it('keeps SKUpervisor service worker from caching map proxy resources', () => {
    const source = readSource(skupervisorServiceWorkerPath);
    expect(source).toContain("const BYPASS_PATH_PREFIXES = ['/api/', '/uploads/', '/openfreemap', '/osm'];");
    expect(source).toContain('const STATIC_CACHEABLE_DESTINATIONS = new Set');
    expect(source).toContain('const MAX_RUNTIME_CACHE_ENTRIES = 120;');
    expect(source).toContain('if (!shouldHandleRuntimeRequest(event.request, requestUrl)) return;');
    expect(source).toContain("if (request.mode === 'navigate')");
    expect(source).toContain("event.respondWith(staleWhileRevalidateRuntime(event.request));");
    expect(source).toContain('cacheControl.includes(\'no-store\')');
    expect(source).toContain('const SCRIPT_CONTENT_TYPE_PATTERN =');
    expect(source).toContain("if (request?.destination === 'script' && !isScriptLikeResponse(response)) return false;");
    expect(source).toContain('if (isCacheableResponse(response, request)) {');
  });

  it('keeps Storefront service worker runtime caching bounded and API-safe', () => {
    const source = readSource(storeServiceWorkerPath);
    expect(source).toContain("const BYPASS_PATH_PREFIXES = ['/api/', '/uploads/', '/openfreemap'];");
    expect(source).toContain('const STATIC_CACHEABLE_DESTINATIONS = new Set');
    expect(source).toContain('const MAX_RUNTIME_CACHE_ENTRIES = 120;');
    expect(source).toContain('if (!shouldHandleRuntimeRequest(event.request, requestUrl)) return;');
    expect(source).toContain("if (request.mode === 'navigate')");
    expect(source).toContain("event.respondWith(staleWhileRevalidateRuntime(event.request));");
    expect(source).toContain('cacheControl.includes(\'no-store\')');
    expect(source).toContain('const SCRIPT_CONTENT_TYPE_PATTERN =');
    expect(source).toContain("if (request?.destination === 'script' && !isScriptLikeResponse(response)) return false;");
    expect(source).toContain('if (isCacheableResponse(response, request)) {');
  });

  it('registers POS service worker with BASE_URL-aware script URL and scope', () => {
    const source = readSource(posMainPath);
    expect(source).toContain('const appBasePath = String(import.meta.env.BASE_URL || \'/\')');
    expect(source).toContain('const serviceWorkerUrl = appBasePath === \'/\' ? \'/sw.js\' : `${appBasePath}/sw.js`;');
    expect(source).toContain('scope: appBasePath === \'/\' ? \'/\' : `${appBasePath}/`');
  });

  it('never auto-applies a waiting update -- only a user tap or a natural transition (#990, 2026-08-28)', () => {
    const serviceWorkerSource = readSource(posServiceWorkerPath);
    const installStart = serviceWorkerSource.indexOf("self.addEventListener('install'");
    const messageStart = serviceWorkerSource.indexOf("self.addEventListener('message'");
    const installSource = serviceWorkerSource.slice(installStart, messageStart);
    const mainSource = readSource(posMainPath);
    const layoutSource = readSource(path.resolve(webCoreRoot, 'src/features/pos/components/TerminalPageLayout.jsx'));

    expect(installSource).not.toContain('skipWaiting');
    expect(serviceWorkerSource).toContain("event?.data?.type === 'SKIP_WAITING'");
    expect(mainSource).toContain("registration.addEventListener('updatefound'");
    expect(mainSource).toContain("navigator.serviceWorker.addEventListener('controllerchange'");
    expect(mainSource).toContain('getPosUpdateSafetyState()');
    // The waiting worker is discovered and the notice shown -- never
    // auto-applied on discovery. showUpdateNotice is called, not
    // applyWaitingWorker, from handleWaitingWorker.
    expect(mainSource).toContain('const handleWaitingWorker = (worker) => {');
    expect(mainSource).toMatch(/const handleWaitingWorker = \(worker\) => \{[\s\S]*?showUpdateNotice\(\);[\s\S]*?\};/);
    expect(mainSource).toContain('activate: applyWaitingWorker');
    expect(layoutSource).toContain('{notice.activate ? (');
    expect(mainSource).toContain('A POS update is ready.');
    expect(mainSource).not.toContain("toast.info('POS update ready'");
    expect(mainSource).not.toContain("toast.dismiss('pos-service-worker-update-ready'");
    expect(mainSource).not.toContain("registration.waiting.postMessage({ type: 'SKIP_WAITING' });");
    // No more deferral/safety-gate state -- these were the mechanism that
    // decided *whether* to auto-apply; there is no more "whether" left to
    // decide, so they must not still be present as dead code.
    expect(mainSource).not.toContain('updateDeferredBySafety');
    expect(mainSource).not.toContain('canForceActivation');
    expect(mainSource).not.toContain('const CHECKOUT_SAFETY_REASONS = new Set([');
  });

  it('gives the notice message context, without ever gating whether it shows or activates (#1118 RF-1, still true)', () => {
    const mainSource = readSource(posMainPath);
    const safetySource = readSource(path.resolve(webCoreRoot, 'src/features/pos/utils/posUpdateSafety.js'));

    expect(mainSource).toContain('hasCheckoutOwnedSafetyReason,');
    expect(mainSource).toContain('const applyWaitingWorker = () => {');
    expect(mainSource).toContain('const describeNotice = (reasons) => (');
    expect(mainSource).toContain('A POS update is ready. Updating now will end the current transaction.');
    // hasCheckoutOwnedSafetyReason is still the single source of truth for
    // "is a transaction in progress" -- confirmed behaviorally (not just by
    // string match) in posUpdateSafety.test.js's own suite for it.
    expect(safetySource).toContain('export const hasCheckoutOwnedSafetyReason = (reasons = []) => (');
  });

  it('silently applies a waiting update on a natural transition pulse -- login, logout, switch, or reunlock (#990, 2026-08-28)', () => {
    const mainSource = readSource(posMainPath);
    const transitionSource = readSource(path.resolve(webCoreRoot, 'src/features/pos/utils/posUpdateTransition.js'));
    const terminalPageSource = readSource(path.resolve(webCoreRoot, 'src/features/pos/pages/TerminalPage.jsx'));

    expect(transitionSource).toContain("export const POS_UPDATE_TRANSITION_EVENT = 'dgfy-pos:update-transition';");
    expect(transitionSource).toContain('export const publishPosUpdateTransition = (');
    expect(mainSource).toContain("import { POS_UPDATE_TRANSITION_EVENT } from '../../../packages/web-core/src/features/pos/utils/posUpdateTransition.js';");
    expect(mainSource).toMatch(/window\.addEventListener\(POS_UPDATE_TRANSITION_EVENT, \(\) => \{\s*applyWaitingWorker\(\);\s*\}\);/);
    // TerminalPage publishes the pulse whenever `locked` actually changes
    // (login succeeding, logging out) -- not on every render, only a real
    // change -- and whenever terminalStartupLoading starts (company switch,
    // admin re-unlock), never on an idle screen with nothing changing.
    expect(terminalPageSource).toContain("import { publishPosUpdateTransition } from '../utils/posUpdateTransition.js';");
    expect(terminalPageSource).toContain('const previousLockedRef = useRef(locked);');
    expect(terminalPageSource).toContain('if (previousLockedRef.current === locked) return;');
    expect(terminalPageSource).toContain('const previousStartupLoadingRef = useRef(terminalStartupLoading);');
    expect(terminalPageSource).toContain('if (previousStartupLoadingRef.current === terminalStartupLoading) return;');
    expect(terminalPageSource).toContain('if (!terminalStartupLoading) return;');

    // Both pulse effects must be declared after terminalStartupLoading is
    // computed (they depend on it / sit alongside it).
    const startupLoadingIndex = terminalPageSource.indexOf('const terminalStartupLoading = !terminalStartupReady || (');
    const pulseIndex = terminalPageSource.indexOf('publishPosUpdateTransition();');
    expect(startupLoadingIndex).toBeGreaterThan(-1);
    expect(pulseIndex).toBeGreaterThan(startupLoadingIndex);
  });

  it('renders the service-worker update prompt as an inline POS notice', () => {
    const layoutSource = readSource(path.resolve(webCoreRoot, 'src/features/pos/components/TerminalPageLayout.jsx'));
    const noticeSource = readSource(path.resolve(webCoreRoot, 'src/features/pos/utils/posUpdateNotice.js'));

    expect(layoutSource).toContain('data-testid="pos-update-ready-notice"');
    expect(layoutSource).toContain('fixed right-3 top-3');
    expect(layoutSource).toContain('bg-white');
    expect(layoutSource).toContain('shadow-[0_8px_24px_rgba(15,23,42,0.16)]');
    expect(layoutSource).toContain("import { Bell, Info, Menu, UserRound } from 'lucide-react';");
    expect(layoutSource).toContain('POS_UPDATE_NOTICE_EVENT');
    expect(layoutSource).toContain('readPosUpdateNoticeState()');
    expect(noticeSource).toContain("export const POS_UPDATE_NOTICE_EVENT = 'dgfy-pos:update-notice';");
    expect(noticeSource).toContain('window.dispatchEvent(new Event(POS_UPDATE_NOTICE_EVENT));');
  });

  it('removes stale root-scoped workers before mounting the local POS app', () => {
    const source = readSource(posMainPath);
    expect(source).toContain('const resetStaleDevelopmentServiceWorkers = async () => {');
    expect(source).toContain('await navigator.serviceWorker.getRegistrations()');
    expect(source).toContain('registration.unregister()');
    expect(source).toContain("cacheName.startsWith('sku-admin-') || cacheName.startsWith('sku-pos-')");
    expect(source).toContain('if (await resetStaleDevelopmentServiceWorkers()) return;');
  });
});
