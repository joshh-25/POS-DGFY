import { LocationRepository } from '../../../src/modules/businesses/repositories/locationRepository.js';

/**
 * Integration tests for LocationRepository (Wave 3.5, Task 7).
 *
 * DEVIATION FROM THE PLAN'S LITERAL TASK 7 SPEC ("All tests use real test
 * database"): this repository's persistence is an in-memory Map keyed by
 * businessId, NOT a real dgfy_business_* MySQL database — see
 * ../../../src/modules/businesses/repositories/locationRepository.js's doc
 * comment for the full rationale (no TenantConnector/BusinessDatabaseRegistry
 * exists yet; both are explicitly Wave 4 scope; no business tenant-database
 * provisioning flow exists anywhere in this codebase; auto-provisioning
 * schema from live API code would violate this project's migration-runner-
 * only schema constraint). This suite therefore exercises the REAL
 * production repository class directly (not a mock), verifying its actual
 * behavior — including genuine, structural tenant isolation via
 * businessId-keyed storage — without requiring a MySQL server. Unlike
 * ../accounts/accountRepository.test.js and
 * ../businesses/businessRepository.test.js, this suite is NOT gated behind
 * an integration env var: it has no external dependency to gate against.
 */
describe('LocationRepository (in-memory, businessId-scoped — Wave 3.5 bridging strategy)', () => {
    let repository;

    beforeEach(() => {
        repository = new LocationRepository();
    });

    describe('create', () => {
        it('auto-assigns is_primary=true for the first location of a business', async () => {
            const location = await repository.create({
                businessId: 'biz-A',
                name: 'Main Branch',
                address_line: '123 Main St'
            });

            expect(location.id).toBe(1);
            expect(location.is_primary).toBe(true);
            expect(location.is_active).toBe(true);
        });

        it('does NOT auto-assign is_primary for a second location', async () => {
            await repository.create({ businessId: 'biz-A', name: 'Main Branch', address_line: '123 Main St' });
            const second = await repository.create({ businessId: 'biz-A', name: 'Second Branch', address_line: '456 Second St' });

            expect(second.is_primary).toBe(false);
        });

        it('assigns independent auto-increment ids per business', async () => {
            const a1 = await repository.create({ businessId: 'biz-A', name: 'A1', address_line: 'Addr A1' });
            const b1 = await repository.create({ businessId: 'biz-B', name: 'B1', address_line: 'Addr B1' });
            const a2 = await repository.create({ businessId: 'biz-A', name: 'A2', address_line: 'Addr A2' });

            expect(a1.id).toBe(1);
            expect(b1.id).toBe(1);
            expect(a2.id).toBe(2);
        });
    });

    describe('findById / findAll', () => {
        it('finds a location by id, scoped to its business', async () => {
            const created = await repository.create({ businessId: 'biz-A', name: 'Main Branch', address_line: '123 Main St' });

            const found = await repository.findById('biz-A', created.id);

            expect(found).toEqual(created);
        });

        it('returns null for a location id that exists in a different business', async () => {
            const created = await repository.create({ businessId: 'biz-A', name: 'Main Branch', address_line: '123 Main St' });

            const found = await repository.findById('biz-B', created.id);

            expect(found).toBeNull();
        });

        it('findAll returns every location for a business, including inactive ones', async () => {
            const first = await repository.create({ businessId: 'biz-A', name: 'A1', address_line: 'Addr A1' });
            await repository.create({ businessId: 'biz-A', name: 'A2', address_line: 'Addr A2' });
            await repository.delete('biz-A', first.id);

            const all = await repository.findAll('biz-A');

            expect(all).toHaveLength(2);
        });

        it('findByName is case-insensitive and scoped to businessId', async () => {
            await repository.create({ businessId: 'biz-A', name: 'Main Branch', address_line: '123 Main St' });

            const found = await repository.findByName('biz-A', 'MAIN branch');
            const notFoundInOtherBusiness = await repository.findByName('biz-B', 'Main Branch');

            expect(found).not.toBeNull();
            expect(notFoundInOtherBusiness).toBeNull();
        });
    });

    describe('update', () => {
        it('applies a partial update and bumps updated_at', async () => {
            const created = await repository.create({ businessId: 'biz-A', name: 'Main Branch', address_line: '123 Main St' });

            const updated = await repository.update('biz-A', created.id, { name: 'Renamed Branch' });

            expect(updated.name).toBe('Renamed Branch');
            expect(updated.address_line).toBe('123 Main St');
            expect(updated.updated_at.getTime()).toBeGreaterThanOrEqual(created.updated_at.getTime());
        });

        it('returns null when updating a location in the wrong business', async () => {
            const created = await repository.create({ businessId: 'biz-A', name: 'Main Branch', address_line: '123 Main St' });

            const updated = await repository.update('biz-B', created.id, { name: 'Hacked' });

            expect(updated).toBeNull();
        });
    });

    describe('updatePrimary', () => {
        it('clears the previous primary and sets the new one', async () => {
            const first = await repository.create({ businessId: 'biz-A', name: 'A1', address_line: 'Addr A1' });
            const second = await repository.create({ businessId: 'biz-A', name: 'A2', address_line: 'Addr A2' });

            const updated = await repository.updatePrimary('biz-A', second.id);
            const refreshedFirst = await repository.findById('biz-A', first.id);

            expect(updated.is_primary).toBe(true);
            expect(refreshedFirst.is_primary).toBe(false);
        });

        it('ensures exactly one primary location per business after multiple switches', async () => {
            const first = await repository.create({ businessId: 'biz-A', name: 'A1', address_line: 'Addr A1' });
            const second = await repository.create({ businessId: 'biz-A', name: 'A2', address_line: 'Addr A2' });

            await repository.updatePrimary('biz-A', second.id);
            await repository.updatePrimary('biz-A', first.id);

            const all = await repository.findAll('biz-A');
            const primaries = all.filter((location) => location.is_primary);
            expect(primaries).toHaveLength(1);
            expect(primaries[0].id).toBe(first.id);
        });
    });

    describe('delete / restore (soft delete)', () => {
        it('soft-deletes: is_active becomes false, record remains in findAll', async () => {
            const first = await repository.create({ businessId: 'biz-A', name: 'A1', address_line: 'Addr A1' });
            await repository.create({ businessId: 'biz-A', name: 'A2', address_line: 'Addr A2' });

            const deleted = await repository.delete('biz-A', first.id);
            const all = await repository.findAll('biz-A');

            expect(deleted.is_active).toBe(false);
            expect(all).toHaveLength(2);
            expect(all.find((location) => location.id === first.id).is_active).toBe(false);
        });

        it('restore() reactivates a soft-deleted location', async () => {
            const first = await repository.create({ businessId: 'biz-A', name: 'A1', address_line: 'Addr A1' });
            await repository.delete('biz-A', first.id);

            const restored = await repository.restore('biz-A', first.id);

            expect(restored.is_active).toBe(true);
        });
    });

    describe('tenant isolation', () => {
        it('locations created for Business A are never visible when querying Business B', async () => {
            await repository.create({ businessId: 'biz-A', name: 'A Branch', address_line: 'A Addr' });
            await repository.create({ businessId: 'biz-A', name: 'A Branch 2', address_line: 'A Addr 2' });
            await repository.create({ businessId: 'biz-B', name: 'B Branch', address_line: 'B Addr' });

            const businessALocations = await repository.findAll('biz-A');
            const businessBLocations = await repository.findAll('biz-B');

            expect(businessALocations).toHaveLength(2);
            expect(businessBLocations).toHaveLength(1);
            expect(businessBLocations.some((location) => location.name.startsWith('A Branch'))).toBe(false);
        });

        it('findPrimary is scoped per business', async () => {
            const aPrimary = await repository.create({ businessId: 'biz-A', name: 'A Branch', address_line: 'A Addr' });
            const bPrimary = await repository.create({ businessId: 'biz-B', name: 'B Branch', address_line: 'B Addr' });

            const primaryA = await repository.findPrimary('biz-A');
            const primaryB = await repository.findPrimary('biz-B');

            expect(primaryA.id).toBe(aPrimary.id);
            expect(primaryB.id).toBe(bPrimary.id);
        });
    });
});
