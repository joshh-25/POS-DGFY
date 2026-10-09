#!/usr/bin/env node
/** Dependency-free runtime metadata proof for frontend apps skipped by version-only PR routing. */

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function assertApp(appName, repoRoot) {
  const appDir = path.join(repoRoot, 'apps', appName);
  const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
  const expectedVersion = String(pkg.version || '').trim();
  if (!expectedVersion) throw new Error(`${appName}: package.json has no non-empty version`);

  const helperUrl = pathToFileURL(path.join(repoRoot, 'packages/web-core/vite/buildStampPlugin.js')).href;
  const { resolveAppVersion, resolveReleaseFloor, buildStampPlugin } = await import(helperUrl);
  const version = resolveAppVersion(appDir, {});
  const release = resolveReleaseFloor(appDir, {});
  if (version !== expectedVersion) throw new Error(`${appName}: manifest fallback resolved ${version}, expected ${expectedVersion}`);
  if (release.floor !== expectedVersion) throw new Error(`${appName}: release floor resolved ${release.floor}, expected ${expectedVersion}`);

  const plugin = buildStampPlugin(version, release);
  const htmlTags = plugin.transformIndexHtml();
  const emitted = [];
  plugin.generateBundle.call({ emitFile: (asset) => emitted.push(asset) });
  const versionTag = htmlTags.find((tag) => tag.attrs?.name === 'dgfy-version');
  const floorTag = htmlTags.find((tag) => tag.attrs?.name === 'dgfy-release-floor');
  const versionAsset = emitted.find((asset) => asset.fileName === 'version.json');
  const payload = versionAsset && JSON.parse(versionAsset.source);
  if (versionTag?.attrs?.content !== expectedVersion || floorTag?.attrs?.content !== expectedVersion
    || payload?.version !== expectedVersion || payload?.release_floor !== expectedVersion) {
    throw new Error(`${appName}: HTML and version.json metadata do not agree with the head manifest`);
  }

  const overrideVersion = `${expectedVersion}-metadata-proof`;
  const overrideFloor = expectedVersion;
  if (resolveAppVersion(appDir, { APP_VERSION: overrideVersion }) !== overrideVersion) {
    throw new Error(`${appName}: APP_VERSION did not retain precedence over the manifest fallback`);
  }
  if (resolveReleaseFloor(appDir, { APP_RELEASE_FLOOR: overrideFloor }).floor !== overrideFloor) {
    throw new Error(`${appName}: APP_RELEASE_FLOOR did not retain precedence over the manifest fallback`);
  }
  const overrideRelease = resolveReleaseFloor(appDir, {
    APP_RELEASE_FLOOR: overrideFloor,
    APP_RELEASE_REVISION: 'metadata-proof',
  });
  const overridePlugin = buildStampPlugin(overrideVersion, overrideRelease);
  const overrideTags = overridePlugin.transformIndexHtml();
  const overrideAssets = [];
  overridePlugin.generateBundle.call({ emitFile: (asset) => overrideAssets.push(asset) });
  const overridePayload = JSON.parse(overrideAssets.find((asset) => asset.fileName === 'version.json').source);
  if (overrideTags.find((tag) => tag.attrs?.name === 'dgfy-version')?.attrs?.content !== overrideVersion
    || overrideTags.find((tag) => tag.attrs?.name === 'dgfy-release-floor')?.attrs?.content !== overrideFloor
    || overridePayload.version !== overrideVersion || overridePayload.release_floor !== overrideFloor
    || overridePayload.release_revision !== 'metadata-proof') {
    throw new Error(`${appName}: environment overrides did not retain precedence in emitted metadata`);
  }
  console.log(`[metadata-proof] ${appName}: fallback=${version}, HTML/version.json agree, environment overrides pass`);
}

async function main() {
  const args = process.argv.slice(2);
  const appsIndex = args.indexOf('--apps');
  const apps = appsIndex >= 0 ? args[appsIndex + 1].split(',').filter(Boolean) : [];
  const allowed = new Set(['dgfy-ims', 'dgfy-pos', 'dgfy-storefront', 'dgfy-opis', 'dgfy-admin']);
  if (apps.some((app) => !allowed.has(app))) throw new Error('--apps contains an unsupported frontend app');
  const repoRoot = path.resolve(__dirname, '..');
  for (const app of apps) await assertApp(app, repoRoot);
  if (apps.length === 0) console.log('[metadata-proof] no frontend apps skipped for version-only changes');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[metadata-proof] FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { assertApp };
