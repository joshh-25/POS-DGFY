// Bare (non-relative, non-@/) packages imported from inside packages/web-core's own source.
// web-core deliberately has no node_modules of its own (see ../README.md) -- these must
// resolve against the CONSUMING APP's node_modules instead. Plain filesystem resolve.alias
// paths (used for the @/... aliases) don't naturally reach into a symlinked package's real
// node_modules ancestry, so each of these needs its own explicit alias.
//
// Vite's resolve.alias treats string `find` values as prefix matches, so each entry here
// also covers subpath imports (e.g. 'posthog-js/dist/...'). react/react-dom/react-router-dom
// are handled separately via resolve.dedupe (and, for pos/store, explicit React pin aliases)
// -- do not add them here.
//
// Keep this in sync with packages/web-core's actual bare-package imports. A missing entry
// surfaces as "Rollup failed to resolve import "<pkg>"" pointing at a packages/web-core file.
export const WEB_CORE_RUNTIME_DEPS = [
  '@dnd-kit/core',
  '@dnd-kit/utilities',
  '@radix-ui/react-accordion',
  '@radix-ui/react-scroll-area',
  '@sentry/react',
  '@testing-library/react',
  '@testing-library/user-event',
  '@zxing/browser',
  '@zxing/library',
  'axios',
  'axios-mock-adapter',
  'clsx',
  'date-fns',
  'fuse.js',
  'katex',
  'lucide-react',
  'maplibre-gl',
  'posthog-js',
  'qrcode',
  'react-markdown',
  'recharts',
  'rehype-katex',
  'remark-gfm',
  'remark-math',
  'sonner',
  'tailwind-merge',
  'zustand',
];

// These two are also file: deps (like web-core itself), but they resolve subpaths through a
// package.json `exports` map (e.g. `@sieitzz/shared-constants/storeProfile` -> `./src/storeProfile.js`)
// rather than a flat file layout. A plain package-root alias bypasses that map and produces a
// literal (wrong) path, so alias straight to `src/` instead and let resolve.extensions supply `.js`.
export const WEB_CORE_SRC_MAPPED_DEPS = ['@sieitzz/pos-receipt', '@sieitzz/shared-constants'];

export function buildWebCoreRuntimeDepAliases(appNodeModulesDir) {
  return [
    ...WEB_CORE_RUNTIME_DEPS.map((pkg) => ({
      find: pkg,
      replacement: `${appNodeModulesDir}/${pkg}`,
    })),
    ...WEB_CORE_SRC_MAPPED_DEPS.map((pkg) => ({
      find: pkg,
      replacement: `${appNodeModulesDir}/${pkg}/src`,
    })),
  ];
}
