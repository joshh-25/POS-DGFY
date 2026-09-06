import { describe, expect, it } from 'vitest';

import {
  buildBulkVariantFilename,
  getBulkFileGroupingKey,
  parseBulkVariantFilename,
} from '../bulkVariantFilename.js';

describe('bulkVariantFilename.js (#1643, epic #265 298d)', () => {
  describe('buildBulkVariantFilename', () => {
    it('builds <SKU>__<variant><ext> from a simple filename', () => {
      expect(buildBulkVariantFilename('WIDGET-1.jpg', 'large')).toBe('WIDGET-1__large.jpg');
      expect(buildBulkVariantFilename('WIDGET-1.jpg', 'medium')).toBe('WIDGET-1__medium.jpg');
      expect(buildBulkVariantFilename('WIDGET-1.jpg', 'thumbnail')).toBe('WIDGET-1__thumbnail.jpg');
    });

    it('keeps the full stem before the last dot for multi-dot filenames', () => {
      expect(buildBulkVariantFilename('My.Photo.v2.jpg', 'large')).toBe('My.Photo.v2__large.jpg');
    });

    it('preserves case', () => {
      expect(buildBulkVariantFilename('sku-Mixed-Case.PNG', 'large')).toBe('sku-Mixed-Case__large.PNG');
    });

    it('has no extension when the original filename has none', () => {
      expect(buildBulkVariantFilename('SKU-1', 'large')).toBe('SKU-1__large');
    });

    // Known, shared limitation (matches the server's own documented caveat, pr-reviewer RF-3,
    // PR #1641, bulkCatalogImageFilename.js) -- not fixed here, noted so client and server share
    // one understood limitation rather than diverging on it.
    it('collides (does not "fix") a SKU that already legitimately ends in a variant suffix', () => {
      // A source file already named `WIDGET__large.jpg` gets re-suffixed into
      // `WIDGET__large__large.jpg`, which the server's own parser would misread as SKU `WIDGET__large`
      // with variant `large` rather than SKU `WIDGET` -- same collision the server-side utility
      // documents, deliberately left unresolved on both sides.
      expect(buildBulkVariantFilename('WIDGET__large.jpg', 'large')).toBe('WIDGET__large__large.jpg');
    });
  });

  describe('parseBulkVariantFilename', () => {
    it('returns a null variantKey for a bare filename', () => {
      expect(parseBulkVariantFilename('SKU-1.png')).toEqual({ skuStem: 'SKU-1', variantKey: null });
    });

    it('strips a known variant suffix', () => {
      expect(parseBulkVariantFilename('SKU-1__large.png')).toEqual({ skuStem: 'SKU-1', variantKey: 'large' });
      expect(parseBulkVariantFilename('SKU-1__medium.png')).toEqual({ skuStem: 'SKU-1', variantKey: 'medium' });
      expect(parseBulkVariantFilename('SKU-1__thumbnail.png')).toEqual({ skuStem: 'SKU-1', variantKey: 'thumbnail' });
    });

    it('treats an unrecognized __suffix as part of the stem, not a variant', () => {
      expect(parseBulkVariantFilename('SKU-1__extra.png')).toEqual({ skuStem: 'SKU-1__extra', variantKey: null });
    });
  });

  describe('getBulkFileGroupingKey', () => {
    it('is case-insensitive and strips a variant suffix, matching the server\'s own grouping key', () => {
      expect(getBulkFileGroupingKey('sku-1.png')).toBe('SKU-1');
      expect(getBulkFileGroupingKey('SKU-1__large.jpg')).toBe('SKU-1');
      expect(getBulkFileGroupingKey('Sku-1__Medium.png')).toBe('SKU-1');
    });

    it('groups a bare file and its explicit __large sibling under the same key', () => {
      expect(getBulkFileGroupingKey('SF-800.png')).toBe(getBulkFileGroupingKey('SF-800__large.jpg'));
    });
  });
});
