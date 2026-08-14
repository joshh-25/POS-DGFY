import { sentryVitePlugin } from '@sentry/vite-plugin';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

const isEnabled = (value) => TRUE_VALUES.has(String(value ?? '').trim().toLowerCase());

const projectEnvBySurface = {
  skupervisor: 'SENTRY_PROJECT_SKUPERVISOR',
  pos: 'SENTRY_PROJECT_POS',
  store: 'SENTRY_PROJECT_STORE'
};

export const shouldUploadSentrySourceMaps = (surface, env = process.env) => {
  if (!isEnabled(env.SENTRY_UPLOAD_SOURCEMAPS)) return false;
  if (!env.SENTRY_AUTH_TOKEN) return false;
  if (!env.SENTRY_ORG) return false;
  if (!env[projectEnvBySurface[surface]]) return false;
  return true;
};

export const buildSentryVitePlugins = (surface, env = process.env) => {
  if (!shouldUploadSentrySourceMaps(surface, env)) return [];

  return [
    sentryVitePlugin({
      authToken: env.SENTRY_AUTH_TOKEN,
      org: env.SENTRY_ORG,
      project: env[projectEnvBySurface[surface]],
      url: env.SENTRY_URL || undefined,
      release: {
        name: env.VITE_SENTRY_RELEASE || env.VITE_BUILD_STAMP || env.GITHUB_SHA || undefined
      },
      sourcemaps: {
        filesToDeleteAfterUpload: ['**/*.map']
      }
    })
  ];
};

export const sentrySourcemapBuildValue = (surface, env = process.env) => (
  shouldUploadSentrySourceMaps(surface, env) ? 'hidden' : false
);
