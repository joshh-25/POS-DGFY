import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(__dirname, '../../../..');
const repositoryRoot = path.resolve(webCoreRoot, '../..');
const posEntrySource = fs.readFileSync(
  path.join(repositoryRoot, 'apps/dgfy-pos/src/main.jsx'),
  'utf8'
);
const sharedStyles = fs.readFileSync(path.join(webCoreRoot, 'src/index.css'), 'utf8');
const catalogWorkflowSource = fs.readFileSync(
  path.join(webCoreRoot, 'src/features/pos/hooks/usePosCatalogWorkflow.js'),
  'utf8'
);

describe('iMin POS performance profile contract', () => {
  it('installs one runtime profile before the POS application mounts', () => {
    const installIndex = posEntrySource.indexOf('installIminPerformanceProfile();');
    const mountIndex = posEntrySource.indexOf('const mountApp =');

    expect(installIndex).toBeGreaterThan(-1);
    expect(mountIndex).toBeGreaterThan(installIndex);
  });

  it('removes full-screen blur and paint-heavy overlay motion only under the iMin marker', () => {
    expect(sharedStyles).toContain('html.dgfy-imin-performance [data-dialog-overlay="true"]');
    expect(sharedStyles).toContain('html.dgfy-imin-performance [class~="backdrop-blur-sm"]');
    expect(sharedStyles).toContain('html.dgfy-imin-performance [class~="backdrop-blur-md"]');
    expect(sharedStyles).toContain('html.dgfy-imin-performance [class~="backdrop-blur-xl"]');
    expect(sharedStyles).toContain('html.dgfy-imin-performance [class~="backdrop-blur-2xl"]');
    expect(sharedStyles).toContain('html.dgfy-imin-performance [class~="backdrop-blur-3xl"]');
    expect(sharedStyles).toContain('backdrop-filter: none !important;');
    expect(sharedStyles).toContain('html.dgfy-imin-performance .animate-pos-overlay-fade-in');
    expect(sharedStyles).toContain('html.dgfy-imin-performance .animate-float');
  });

  it('disables every continuously-looping animation on the item-save-in-flight overlay', () => {
    expect(sharedStyles).toContain('html.dgfy-imin-performance .animate-shimmer');
    expect(sharedStyles).toContain('html.dgfy-imin-performance .animate-pulse-ring');
    expect(sharedStyles).toContain('html.dgfy-imin-performance .animate-spin-slow');
    expect(sharedStyles).toContain('html.dgfy-imin-performance .animate-spin-reverse');
    expect(sharedStyles).toContain('html.dgfy-imin-performance [class~="animate-ping"]');
    expect(sharedStyles).toContain('html.dgfy-imin-performance .dot-1');
    expect(sharedStyles).toContain('html.dgfy-imin-performance .dot-2');
    expect(sharedStyles).toContain('html.dgfy-imin-performance .dot-3');
  });

  it('keeps search typing urgent while catalog requests follow the deferred query', () => {
    expect(catalogWorkflowSource).toContain('const deferredSearch = useDeferredValue(search);');
    expect(catalogWorkflowSource).toContain('buildCatalogRequestKey(deferredSearch, selectedLocationId)');
    expect(catalogWorkflowSource).toContain('buildCatalogRequestParams(deferredSearch, selectedLocationId)');
  });
});
