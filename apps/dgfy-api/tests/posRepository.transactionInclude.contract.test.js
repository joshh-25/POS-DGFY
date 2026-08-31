import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Phase 227 (#1273). Task 1 -- buildTransactionInclude()'s `deliveryJob` include now also selects
// `delivery_run_id` so the Active Queue's frontend can pre-filter bulk "add to run" eligibility
// (F-2) without a second round trip. Structural-only: dbStore.get is stubbed to return a bare
// `{ name }` marker for whatever model name is requested, so this never touches a real DB
// connection -- it only asserts on the include descriptor buildTransactionInclude() returns.

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: (name) => ({ name }),
        getStore: () => null
    }
}));

let buildTransactionInclude;

describe('posRepository buildTransactionInclude contract', () => {
    beforeEach(async () => {
        jest.resetModules();
        ({ buildTransactionInclude } = await import('../src/modules/pos/repositories/posRepository.js'));
    });

    it('includes delivery_run_id in the deliveryJob include attributes, right after delivery_job_id', () => {
        const include = buildTransactionInclude();
        const deliveryJobInclude = include.find((entry) => entry.as === 'deliveryJob');

        expect(deliveryJobInclude).toBeTruthy();
        expect(Array.isArray(deliveryJobInclude.attributes)).toBe(true);
        expect(deliveryJobInclude.attributes).toContain('delivery_run_id');

        const jobIdIndex = deliveryJobInclude.attributes.indexOf('delivery_job_id');
        const runIdIndex = deliveryJobInclude.attributes.indexOf('delivery_run_id');
        expect(jobIdIndex).toBeGreaterThanOrEqual(0);
        expect(runIdIndex).toBe(jobIdIndex + 1);
    });

    it('does not otherwise change the deliveryJob include shape (model/as/required/nested include untouched)', () => {
        const include = buildTransactionInclude();
        const deliveryJobInclude = include.find((entry) => entry.as === 'deliveryJob');

        expect(deliveryJobInclude.model).toEqual({ name: 'DeliveryJob' });
        expect(deliveryJobInclude.required).toBe(false);
        expect(Array.isArray(deliveryJobInclude.include)).toBe(true);
        expect(deliveryJobInclude.include.length).toBeGreaterThan(0);
    });
});
