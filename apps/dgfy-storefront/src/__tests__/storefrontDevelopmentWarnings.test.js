import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('storefront development warning configuration', () => {
  it('opts into the supported React Router v7 compatibility flags', () => {
    const main = readSource('main.jsx');

    expect(main).toContain('v7_startTransition: true');
    expect(main).toContain('v7_relativeSplatPath: true');
  });

  it('enables Zustand DevTools only when its browser extension exists', () => {
    const store = readSource('store/useStorefrontStore.js');

    expect(store).toContain("typeof window !== 'undefined'");
    expect(store).toContain('window.__REDUX_DEVTOOLS_EXTENSION__');
    expect(store).toContain('enabled: isDevEnvironment() && hasReduxDevtoolsExtension()');
  });
});
