import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';
import { validateReviewMerchantTenderReconciliation } from '../src/validators/posValidator.js';

const routeSource = fs.readFileSync(path.resolve(process.cwd(), 'src/routes/pos.js'), 'utf8');

describe('POS merchant tender reconciliation route contract', () => {
    it('keeps read and review manager-only through close-day permission', () => {
        expect(routeSource).toContain("router.get('/terminal/shifts/:id/merchant-tender-reconciliation', checkPermission(PERMISSIONS.POS.actions.CLOSE_DAY_POS)");
        expect(routeSource).toContain("router.post('/terminal/shifts/:id/merchant-tender-reconciliation', checkPermission(PERMISSIONS.POS.actions.CLOSE_DAY_POS)");
    });

    it('accepts only non-negative observed tender totals and strips client-owned financial fields', () => {
        const req = { body: {
            idempotency_key: 'manager-review-001',
            observed_breakdown: { gcash: 750, maya: 0, card: 300, bank_transfer: 200 },
            review_note: 'Reviewed against store statements.',
            expected_total: 1,
            reviewed_by: 1
        } };
        const res = { status: () => res, json: () => res };
        let nextCalled = false;

        validateReviewMerchantTenderReconciliation(req, res, () => { nextCalled = true; });

        expect(nextCalled).toBe(true);
        expect(req.validatedData).not.toHaveProperty('expected_total');
        expect(req.validatedData).not.toHaveProperty('reviewed_by');
        expect(req.validatedData.observed_breakdown.gcash).toBe(750);
    });
});
