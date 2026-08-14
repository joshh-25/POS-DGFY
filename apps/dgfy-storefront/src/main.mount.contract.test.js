import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Storefront mount contract', () => {
  it('reuses the existing React root instead of creating a duplicate root', () => {
    const source = readFileSync(resolve(process.cwd(), 'apps/store/src/main.jsx'), 'utf8');

    expect(source).toContain("const STOREFRONT_ROOT_KEY = '__dgfyStorefrontReactRoot__';");
    expect(source).toContain('rootElement[STOREFRONT_ROOT_KEY]');
    expect(source).toContain('storefrontRoot.render(');
  });
});
