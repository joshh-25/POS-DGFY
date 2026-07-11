import { jest } from '@jest/globals';
import {
    buildCreateLocationUseCase,
    buildListLocationsUseCase,
    buildGetLocationUseCase,
    buildUpdateLocationUseCase,
    buildSetPrimaryLocationUseCase,
    buildDeleteLocationUseCase
} from '../../../../src/modules/businesses/usecases/locationUseCases.js';

const makeLocation = (overrides = {}) => ({
    id: 1,
    name: 'Main Branch',
    address_line: '123 Main St',
    latitude: null,
    longitude: null,
    is_active: true,
    is_primary: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides
});

const makeBusiness = (overrides = {}) => ({
    id: 'biz-1',
    business_handle: 'acme-store',
    legal_name: 'Acme Inc.',
    display_name: 'Acme Store',
    status: 'active',
    ...overrides
});

const makeMembership = (overrides = {}) => ({
    id: 1,
    account_id: 'acct-1',
    business_id: 'biz-1',
    role: 'owner',
    status: 'active',
    ...overrides
});

const baseLocationRepository = (overrides = {}) => ({
    create: jest.fn().mockResolvedValue(makeLocation()),
    findById: jest.fn().mockResolvedValue(makeLocation()),
    findByName: jest.fn().mockResolvedValue(null),
    findAll: jest.fn().mockResolvedValue([makeLocation()]),
    findPrimary: jest.fn().mockResolvedValue(makeLocation()),
    update: jest.fn().mockResolvedValue(makeLocation({ name: 'Updated Name' })),
    updatePrimary: jest.fn().mockResolvedValue(makeLocation({ is_primary: true })),
    delete: jest.fn().mockResolvedValue(makeLocation({ is_active: false })),
    restore: jest.fn().mockResolvedValue(makeLocation({ is_active: true })),
    ...overrides
});

const baseBusinessRepository = (overrides = {}) => ({
    findById: jest.fn().mockResolvedValue(makeBusiness()),
    getMembership: jest.fn().mockResolvedValue(makeMembership()),
    ...overrides
});

describe('buildCreateLocationUseCase', () => {
    it('creates the first location for a business (auto-primary via repository)', async () => {
        const repository = baseLocationRepository({ findAll: jest.fn().mockResolvedValue([]) });
        const businessRepository = baseBusinessRepository();
        const useCase = buildCreateLocationUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            name: 'Main Branch',
            address_line: '123 Main St'
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
            businessId: 'biz-1',
            name: 'Main Branch',
            address_line: '123 Main St'
        }));
        expect(result.data.location.is_primary).toBe(true);
        expect(repository.updatePrimary).not.toHaveBeenCalled();
    });

    it('promotes a non-first location to primary when setAsPrimary is true', async () => {
        const repository = baseLocationRepository({
            findAll: jest.fn().mockResolvedValue([makeLocation()]),
            create: jest.fn().mockResolvedValue(makeLocation({ id: 2, is_primary: false })),
            updatePrimary: jest.fn().mockResolvedValue(makeLocation({ id: 2, is_primary: true }))
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildCreateLocationUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            name: 'Second Branch',
            address_line: '456 Second St',
            setAsPrimary: true
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.updatePrimary).toHaveBeenCalledWith('biz-1', 2);
        expect(result.data.location.is_primary).toBe(true);
    });

    it('rejects missing name/address_line', async () => {
        const repository = baseLocationRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildCreateLocationUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1', name: '', address_line: '' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects a non-owner requester with HTTP 403', async () => {
        const repository = baseLocationRepository();
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeMembership({ role: 'member' }))
        });
        const useCase = buildCreateLocationUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-2',
            name: 'Main Branch',
            address_line: '123 Main St'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
        expect(result.error.statusCode).toBe(403);
        expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects a non-member requester (no membership) with HTTP 403', async () => {
        const repository = baseLocationRepository();
        const businessRepository = baseBusinessRepository({ getMembership: jest.fn().mockResolvedValue(null) });
        const useCase = buildCreateLocationUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-2',
            name: 'Main Branch',
            address_line: '123 Main St'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
    });

    it('returns NOT_FOUND when the business does not exist', async () => {
        const repository = baseLocationRepository();
        const businessRepository = baseBusinessRepository({ findById: jest.fn().mockResolvedValue(null) });
        const useCase = buildCreateLocationUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'missing',
            requestingAccountId: 'acct-1',
            name: 'Main Branch',
            address_line: '123 Main St'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('returns NO_TENANT_DATABASE (404) when the registry has no row for this business (Wave 7)', async () => {
        const tenantError = new Error('No tenant database is registered for this business.');
        tenantError.name = 'TenantDatabaseUnavailableError';
        tenantError.reason = 'missing';
        const repository = baseLocationRepository({ findAll: jest.fn().mockRejectedValue(tenantError) });
        const businessRepository = baseBusinessRepository();
        const useCase = buildCreateLocationUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            name: 'Main Branch',
            address_line: '123 Main St'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
        expect(result.error.statusCode).toBe(404);
        expect(result.error.details.error_code).toBe('NO_TENANT_DATABASE');
    });

    it('returns a stable SERVICE_UNAVAILABLE (503) failure — never an uncaught exception — for a still-provisioning tenant database', async () => {
        const tenantError = new Error('Tenant database is still provisioning.');
        tenantError.name = 'TenantDatabaseUnavailableError';
        tenantError.reason = 'provisioning';
        const repository = baseLocationRepository({ findAll: jest.fn().mockRejectedValue(tenantError) });
        const businessRepository = baseBusinessRepository();
        const useCase = buildCreateLocationUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            name: 'Main Branch',
            address_line: '123 Main St'
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(result.error.statusCode).toBe(503);
        expect(result.error.details.error_code).toBe('TENANT_DATABASE_UNAVAILABLE');
        expect(result.error.details.reason).toBe('provisioning');
    });

    it('returns a stable SERVICE_UNAVAILABLE (503) failure for an unreachable tenant database, not an uncaught exception', async () => {
        const tenantError = new Error('Unable to reach the tenant database for this business.');
        tenantError.name = 'TenantDatabaseUnavailableError';
        tenantError.reason = 'unreachable';
        const repository = baseLocationRepository({ findAll: jest.fn().mockRejectedValue(tenantError) });
        const businessRepository = baseBusinessRepository();
        const useCase = buildCreateLocationUseCase({ repository, businessRepository });

        await expect(useCase({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            name: 'Main Branch',
            address_line: '123 Main St'
        })).resolves.toEqual(expect.objectContaining({ success: false }));
    });
});

describe('buildListLocationsUseCase', () => {
    it('returns an empty list', async () => {
        const repository = baseLocationRepository({ findAll: jest.fn().mockResolvedValue([]) });
        const businessRepository = baseBusinessRepository();
        const useCase = buildListLocationsUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(true);
        expect(result.data.locations).toEqual([]);
    });

    it('returns SERVICE_UNAVAILABLE (503) for an inactive (non-active status) tenant registry entry', async () => {
        const tenantError = new Error('Tenant database is not active.');
        tenantError.name = 'TenantDatabaseUnavailableError';
        tenantError.reason = 'inactive';
        const repository = baseLocationRepository({ findAll: jest.fn().mockRejectedValue(tenantError) });
        const businessRepository = baseBusinessRepository();
        const useCase = buildListLocationsUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(result.error.details.reason).toBe('inactive');
    });

    it('returns SERVICE_UNAVAILABLE (503) for an active-but-unverified tenant registry entry', async () => {
        const tenantError = new Error('Tenant database has not been verified.');
        tenantError.name = 'TenantDatabaseUnavailableError';
        tenantError.reason = 'unverified';
        const repository = baseLocationRepository({ findAll: jest.fn().mockRejectedValue(tenantError) });
        const businessRepository = baseBusinessRepository();
        const useCase = buildListLocationsUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(result.error.details.reason).toBe('unverified');
    });

    it('returns multiple locations', async () => {
        const repository = baseLocationRepository({
            findAll: jest.fn().mockResolvedValue([makeLocation(), makeLocation({ id: 2, is_primary: false })])
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildListLocationsUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(true);
        expect(result.data.locations).toHaveLength(2);
    });

    it('filters out inactive locations by default', async () => {
        const repository = baseLocationRepository({
            findAll: jest.fn().mockResolvedValue([
                makeLocation({ id: 1, is_active: true }),
                makeLocation({ id: 2, is_active: false, is_primary: false })
            ])
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildListLocationsUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1' });

        expect(result.data.locations).toHaveLength(1);
        expect(result.data.locations[0].id).toBe(1);
    });

    it('includes inactive locations when includeInactive is true', async () => {
        const repository = baseLocationRepository({
            findAll: jest.fn().mockResolvedValue([
                makeLocation({ id: 1, is_active: true }),
                makeLocation({ id: 2, is_active: false, is_primary: false })
            ])
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildListLocationsUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', requestingAccountId: 'acct-1', includeInactive: true });

        expect(result.data.locations).toHaveLength(2);
    });
});

describe('buildGetLocationUseCase', () => {
    it('returns the location for a member', async () => {
        const repository = baseLocationRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildGetLocationUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', locationId: 1, requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(true);
        expect(result.data.location.id).toBe(1);
    });

    it('returns NOT_FOUND for a missing location', async () => {
        const repository = baseLocationRepository({ findById: jest.fn().mockResolvedValue(null) });
        const businessRepository = baseBusinessRepository();
        const useCase = buildGetLocationUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', locationId: 99, requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('rejects a non-member (access control)', async () => {
        const repository = baseLocationRepository();
        const businessRepository = baseBusinessRepository({ getMembership: jest.fn().mockResolvedValue(null) });
        const useCase = buildGetLocationUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', locationId: 1, requestingAccountId: 'acct-2' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
    });
});

describe('buildUpdateLocationUseCase', () => {
    it('updates a location (full)', async () => {
        const repository = baseLocationRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildUpdateLocationUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            locationId: 1,
            requestingAccountId: 'acct-1',
            updates: { name: 'Updated Name', address_line: '999 New St', latitude: 14.5, longitude: 121.0 }
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.update).toHaveBeenCalledWith('biz-1', 1, expect.objectContaining({
            name: 'Updated Name',
            address_line: '999 New St',
            latitude: 14.5,
            longitude: 121.0
        }));
    });

    it('supports a partial update (only name)', async () => {
        const repository = baseLocationRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildUpdateLocationUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            locationId: 1,
            requestingAccountId: 'acct-1',
            updates: { name: 'Just Renamed' }
        });

        expect(result.isSuccess).toBe(true);
        expect(repository.update).toHaveBeenCalledWith('biz-1', 1, { name: 'Just Renamed' });
    });

    it('rejects an empty name', async () => {
        const repository = baseLocationRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildUpdateLocationUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            locationId: 1,
            requestingAccountId: 'acct-1',
            updates: { name: '   ' }
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(repository.update).not.toHaveBeenCalled();
    });

    it('rejects a non-numeric latitude', async () => {
        const repository = baseLocationRepository();
        const businessRepository = baseBusinessRepository();
        const useCase = buildUpdateLocationUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            locationId: 1,
            requestingAccountId: 'acct-1',
            updates: { latitude: 'not-a-number' }
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns NOT_FOUND for a missing location', async () => {
        const repository = baseLocationRepository({ findById: jest.fn().mockResolvedValue(null) });
        const businessRepository = baseBusinessRepository();
        const useCase = buildUpdateLocationUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            locationId: 99,
            requestingAccountId: 'acct-1',
            updates: { name: 'Whatever' }
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('rejects a non-owner requester', async () => {
        const repository = baseLocationRepository();
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeMembership({ role: 'member' }))
        });
        const useCase = buildUpdateLocationUseCase({ repository, businessRepository });

        const result = await useCase({
            businessId: 'biz-1',
            locationId: 1,
            requestingAccountId: 'acct-2',
            updates: { name: 'Whatever' }
        });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
    });
});

describe('buildSetPrimaryLocationUseCase', () => {
    it('switches primary to the target location', async () => {
        const repository = baseLocationRepository({
            findById: jest.fn().mockResolvedValue(makeLocation({ id: 2, is_primary: false })),
            updatePrimary: jest.fn().mockResolvedValue(makeLocation({ id: 2, is_primary: true }))
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildSetPrimaryLocationUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', locationId: 2, requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(true);
        expect(repository.updatePrimary).toHaveBeenCalledWith('biz-1', 2);
        expect(result.data.location.is_primary).toBe(true);
    });

    it('returns NOT_FOUND for a missing location', async () => {
        const repository = baseLocationRepository({ findById: jest.fn().mockResolvedValue(null) });
        const businessRepository = baseBusinessRepository();
        const useCase = buildSetPrimaryLocationUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', locationId: 99, requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
        expect(repository.updatePrimary).not.toHaveBeenCalled();
    });

    it('rejects setting an inactive location as primary', async () => {
        const repository = baseLocationRepository({
            findById: jest.fn().mockResolvedValue(makeLocation({ id: 2, is_active: false, is_primary: false }))
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildSetPrimaryLocationUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', locationId: 2, requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(repository.updatePrimary).not.toHaveBeenCalled();
    });

    it('rejects a non-owner requester', async () => {
        const repository = baseLocationRepository();
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeMembership({ role: 'member' }))
        });
        const useCase = buildSetPrimaryLocationUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', locationId: 1, requestingAccountId: 'acct-2' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
    });
});

describe('buildDeleteLocationUseCase', () => {
    it('soft-deletes a location (is_active=false) when other active locations remain', async () => {
        const existing = makeLocation({ id: 2, is_primary: false });
        const repository = baseLocationRepository({
            findById: jest.fn().mockResolvedValue(existing),
            findAll: jest.fn().mockResolvedValue([makeLocation({ id: 1 }), existing]),
            delete: jest.fn().mockResolvedValue({ ...existing, is_active: false })
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildDeleteLocationUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', locationId: 2, requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(true);
        expect(repository.delete).toHaveBeenCalledWith('biz-1', 2);
        expect(result.data.location.is_active).toBe(false);
    });

    it('refuses to delete the last remaining active location', async () => {
        const onlyLocation = makeLocation({ id: 1 });
        const repository = baseLocationRepository({
            findById: jest.fn().mockResolvedValue(onlyLocation),
            findAll: jest.fn().mockResolvedValue([onlyLocation])
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildDeleteLocationUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', locationId: 1, requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.statusCode).toBe(409);
        expect(repository.delete).not.toHaveBeenCalled();
    });

    it('auto-promotes the next active location to primary when deleting the primary', async () => {
        const primary = makeLocation({ id: 1, is_primary: true });
        const secondary = makeLocation({ id: 2, is_primary: false });
        const repository = baseLocationRepository({
            findById: jest.fn().mockResolvedValue(primary),
            findAll: jest.fn().mockResolvedValue([primary, secondary]),
            delete: jest.fn().mockResolvedValue({ ...primary, is_active: false }),
            updatePrimary: jest.fn().mockResolvedValue({ ...secondary, is_primary: true })
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildDeleteLocationUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', locationId: 1, requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(true);
        expect(repository.updatePrimary).toHaveBeenCalledWith('biz-1', 2);
    });

    it('does not attempt to promote a new primary when the deleted location was not primary', async () => {
        const primary = makeLocation({ id: 1, is_primary: true });
        const secondary = makeLocation({ id: 2, is_primary: false });
        const repository = baseLocationRepository({
            findById: jest.fn().mockResolvedValue(secondary),
            findAll: jest.fn().mockResolvedValue([primary, secondary]),
            delete: jest.fn().mockResolvedValue({ ...secondary, is_active: false })
        });
        const businessRepository = baseBusinessRepository();
        const useCase = buildDeleteLocationUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', locationId: 2, requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(true);
        expect(repository.updatePrimary).not.toHaveBeenCalled();
    });

    it('returns NOT_FOUND for a missing location', async () => {
        const repository = baseLocationRepository({ findById: jest.fn().mockResolvedValue(null) });
        const businessRepository = baseBusinessRepository();
        const useCase = buildDeleteLocationUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', locationId: 99, requestingAccountId: 'acct-1' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('rejects a non-owner requester', async () => {
        const repository = baseLocationRepository();
        const businessRepository = baseBusinessRepository({
            getMembership: jest.fn().mockResolvedValue(makeMembership({ role: 'member' }))
        });
        const useCase = buildDeleteLocationUseCase({ repository, businessRepository });

        const result = await useCase({ businessId: 'biz-1', locationId: 1, requestingAccountId: 'acct-2' });

        expect(result.isSuccess).toBe(false);
        expect(result.error.code).toBe('AUTHORIZATION_FAILED');
        expect(repository.delete).not.toHaveBeenCalled();
    });
});
