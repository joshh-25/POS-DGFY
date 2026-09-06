import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const paginationSources = [
  ['F&B', 'modes/fnb/storefront/pages/FnbCatalogRoutePage.jsx'],
  ['Retail', 'modes/retail/storefront/components/RetailCatalogPagination.jsx'],
  ['Simple/MSME', 'modes/simple/storefront/components/SimpleCatalogPagination.jsx'],
  ['Services', 'modes/services/storefront/components/ServicesPaginationBar.jsx']
];

describe('storefront catalog pagination controls', () => {
  it.each(paginationSources)('uses compact, accessible arrow controls for %s', (_industry, relativePath) => {
    const source = readSource(relativePath);

    expect(source).toContain('aria-label="Previous page"');
    expect(source).toContain('aria-label="Next page"');
    expect(source).toContain('title="Previous page"');
    expect(source).toContain('title="Next page"');
    expect(source).toContain('‹');
    expect(source).toContain('›');
    expect(source).not.toMatch(/>Previous<|>Next</);
  });

  it.each(paginationSources)('anchors mobile arrows around a centered page group for %s', (_industry, relativePath) => {
    const source = readSource(relativePath);

    expect(source).toContain("gridTemplateColumns: '40px minmax(0, 1fr) 40px'");
    expect(source).toContain("gridColumn: '1'");
    expect(source).toContain("gridColumn: '2'");
    expect(source).toContain("gridColumn: '3'");
  });

  it('keeps pagination ownership independent per storefront industry', () => {
    const source = readSource('modes/fnb/storefront/pages/FnbCatalogRoutePage.jsx');

    expect(source).toContain('function FnbCatalogPagination');
    expect(source).not.toContain('CatalogPagination.jsx');
  });
});
