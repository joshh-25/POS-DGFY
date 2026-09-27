import { describe, expect, it } from '@jest/globals';
import {
    markRetainedParkedSaleLines,
    validateParkedSaleSnapshotRevision
} from '../src/modules/pos/domain/parkedSaleLinePolicy.js';

const originalLine = (overrides = {}) => ({
    line_key: 'parked-line-1',
    item_id: 7,
    item_name: 'Coffee',
    quantity: 1,
    base_sale_price: 100,
    sale_price: 100,
    line_modifiers: [],
    ...overrides
});

describe('parked-sale original line policy', () => {
    it('marks retained original lines without marking a separate replacement line', () => {
        const snapshot = markRetainedParkedSaleLines({
            previousSnapshot: { lines: [originalLine()] },
            snapshot: {
                lines: [
                    originalLine(),
                    originalLine({ line_key: 'replacement-line', sale_price: 120, base_sale_price: 120 })
                ]
            }
        });

        expect(snapshot.lines[0]).toEqual(expect.objectContaining({ parked_snapshot_line: true }));
        expect(snapshot.lines[1]).not.toHaveProperty('parked_snapshot_line');
    });

    it('matches a retained original when resume rebuilds its line reference', () => {
        const snapshot = markRetainedParkedSaleLines({
            previousSnapshot: { lines: [originalLine()] },
            snapshot: {
                lines: [originalLine({ line_key: 'rebuilt-line-1', line_ref: 'rebuilt-ref-1' })]
            }
        });

        expect(snapshot.lines[0]).toEqual(expect.objectContaining({
            line_key: 'rebuilt-line-1',
            parked_snapshot_line: true
        }));
    });

    it('rejects removal of an original parked line', () => {
        expect(validateParkedSaleSnapshotRevision({
            previousSnapshot: { lines: [originalLine()] },
            nextSnapshot: { lines: [] },
            currentItems: []
        })).toEqual(expect.objectContaining({
            reasonCode: 'PARKED_SALE_ORIGINAL_LINE_REMOVED'
        }));
    });

    it('allows removal of an original parked line when an auditable reason is supplied', () => {
        expect(validateParkedSaleSnapshotRevision({
            previousSnapshot: { lines: [originalLine()] },
            nextSnapshot: { lines: [] },
            currentItems: [],
            removedLineReasons: [{
                line_ref: 'parked-line-1',
                item_id: 7,
                reason: 'Customer removed item'
            }]
        })).toBeNull();
    });

    it('allows an original quantity increase when the current price is unchanged', () => {
        expect(validateParkedSaleSnapshotRevision({
            previousSnapshot: { lines: [originalLine()] },
            nextSnapshot: { lines: [originalLine({ quantity: 2 })] },
            currentItems: [{ item_id: 7, status: 'active', default_sale_price: 100 }]
        })).toBeNull();
    });

    it('rejects an original quantity increase after price drift', () => {
        expect(validateParkedSaleSnapshotRevision({
            previousSnapshot: { lines: [originalLine()] },
            nextSnapshot: { lines: [originalLine({ quantity: 2 })] },
            currentItems: [{ item_id: 7, status: 'active', default_sale_price: 120 }]
        })).toEqual(expect.objectContaining({
            reasonCode: 'PARKED_SALE_ORIGINAL_LINE_PRICE_DRIFT'
        }));
    });

    it('rejects an original line when its item identity changes', () => {
        expect(validateParkedSaleSnapshotRevision({
            previousSnapshot: { lines: [originalLine()] },
            nextSnapshot: { lines: [originalLine({ item_id: 8 })] },
            currentItems: []
        })).toEqual(expect.objectContaining({
            reasonCode: 'PARKED_SALE_ORIGINAL_LINE_CHANGED',
            itemId: 7,
            lineRef: 'parked-line-1'
        }));
    });

    it('keeps a changed-price replacement as a separate line', () => {
        expect(validateParkedSaleSnapshotRevision({
            previousSnapshot: { lines: [originalLine()] },
            nextSnapshot: {
                lines: [
                    originalLine(),
                    originalLine({ line_key: 'new-line-1', quantity: 1, sale_price: 120, base_sale_price: 120 })
                ]
            },
            currentItems: [{ item_id: 7, status: 'active', default_sale_price: 120 }]
        })).toBeNull();
    });
});
