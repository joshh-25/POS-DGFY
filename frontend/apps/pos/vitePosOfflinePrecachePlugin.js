import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PRECACHE_FILE_NAME = 'precache-manifest.json';
const CRITICAL_ASSET_PATTERN = /\.(?:css|js|webmanifest|woff2?)$/i;
const SERVICE_WORKER_FILE_NAME = 'sw.js';
export const POS_OFFLINE_BUILD_REVISION_TOKEN = '__DGFY_POS_BUILD_REVISION__';

export const collectPosOfflinePrecacheAssets = (bundle = {}) => (
  [...new Set(
    Object.values(bundle)
      .map((output) => String(output?.fileName || '').trim())
      .filter((fileName) => fileName && CRITICAL_ASSET_PATTERN.test(fileName))
  )].sort()
);

export const createPosOfflineBuildRevision = (bundle = {}, buildTimestamp = Date.now()) => {
  const buildFingerprint = Object.values(bundle)
    .map((output) => `${output?.fileName || ''}:${output?.code || output?.source || ''}`)
    .sort()
    .join('\n');
  const digest = createHash('sha256')
    .update(`${buildTimestamp}\n${buildFingerprint}`)
    .digest('hex')
    .slice(0, 16);
  return `v${digest}`;
};

export const posOfflinePrecachePlugin = () => {
  let buildRevision = '';

  return {
    name: 'dgfy-pos-offline-precache',
    apply: 'build',
    generateBundle(_outputOptions, bundle) {
      buildRevision = createPosOfflineBuildRevision(bundle);
      this.emitFile({
        type: 'asset',
        fileName: PRECACHE_FILE_NAME,
        source: `${JSON.stringify({
          version: 1,
          assets: collectPosOfflinePrecacheAssets(bundle)
        }, null, 2)}\n`
      });
    },
    async writeBundle(outputOptions) {
      const outputDirectory = outputOptions.dir || path.dirname(outputOptions.file || '');
      const serviceWorkerPath = path.resolve(outputDirectory, SERVICE_WORKER_FILE_NAME);
      const source = await readFile(serviceWorkerPath, 'utf8');
      if (!source.includes(POS_OFFLINE_BUILD_REVISION_TOKEN)) {
        throw new Error('POS service worker is missing the build revision token.');
      }
      await writeFile(
        serviceWorkerPath,
        source.replaceAll(POS_OFFLINE_BUILD_REVISION_TOKEN, buildRevision),
        'utf8'
      );
    }
  };
};
