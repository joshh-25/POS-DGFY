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

    // Regression coverage for pr-reviewer RF-2 (PR #1676): a source filename that already carries
    // a known variant suffix must NOT get a second suffix appended -- the output is built off the
    // already-stripped skuStem, so it always normalizes to the same <SKU>__<variantKey><ext>
    // shape a bare <SKU><ext> source would produce, regardless of which (if any) suffix the
    // source filename started with.
    describe('does not double-suffix a source filename that already carries a known variant suffix (RF-2)', () => {
      it('__large source, requesting the large variant -- round-trips, never SKU__large__large', () => {
        expect(buildBulkVariantFilename('SKU__large.jpg', 'large')).toBe('SKU__large.jpg');
      });

      it('__large source, requesting a different variant -- strips the stale suffix first', () => {
        expect(buildBulkVariantFilename('SKU__large.jpg', 'medium')).toBe('SKU__medium.jpg');
        expect(buildBulkVariantFilename('SKU__large.jpg', 'thumbnail')).toBe('SKU__thumbnail.jpg');
      });

      it('__medium source -- strips the stale suffix for every requested variant', () => {
        expect(buildBulkVariantFilename('SKU__medium.jpg', 'large')).toBe('SKU__large.jpg');
        expect(buildBulkVariantFilename('SKU__medium.jpg', 'medium')).toBe('SKU__medium.jpg');
        expect(buildBulkVariantFilename('SKU__medium.jpg', 'thumbnail')).toBe('SKU__thumbnail.jpg');
      });

      it('__thumbnail source -- strips the stale suffix for every requested variant', () => {
        expect(buildBulkVariantFilename('SKU__thumbnail.jpg', 'large')).toBe('SKU__large.jpg');
        expect(buildBulkVariantFilename('SKU__thumbnail.jpg', 'medium')).toBe('SKU__medium.jpg');
        expect(buildBulkVariantFilename('SKU__thumbnail.jpg', 'thumbnail')).toBe('SKU__thumbnail.jpg');
      });

      it('a bare source and an already-__large-suffixed source for the same SKU normalize identically', () => {
        // Mirrors the real duplicate-group scenario the splitter's grouping-unit correctness
        // requirement guards: whichever of these two filenames a caller happened to select, the
        // client must derive the exact same <SKU>__large.<ext> output -- never two different
        // filenames that would parse to two different server-side SKU stems.
        expect(buildBulkVariantFilename('SKU.jpg', 'large')).toBe(buildBulkVariantFilename('SKU__large.jpg', 'large'));
        expect(buildBulkVariantFilename('SKU.jpg', 'large')).toBe('SKU__large.jpg');
      });
    });

    // Remaining, narrower known limitation (matches the server's own documented caveat,
    // pr-reviewer RF-3, PR #1641, bulkCatalogImageFilename.js) -- not fixed here, noted so client
    // and server share one understood limitation rather than diverging on it. This differs from
    // the RF-2 case above: here the SKU code *itself* legitimately contains "__large" as part of
    // its own name (not a variant suffix the client added), so stripping it is indistinguishable
    // from the variant-suffix case on the client side too -- the same ambiguity the server's own
    // parser already has for this exact filename, not a new one this function introduces.
    it('still cannot distinguish a SKU that legitimately ends in "__large" from a variant-suffixed upload', () => {
      expect(buildBulkVariantFilename('WIDGET__large.jpg', 'medium')).toBe('WIDGET__medium.jpg');
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
