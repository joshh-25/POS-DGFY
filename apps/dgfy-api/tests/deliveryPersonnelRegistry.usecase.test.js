import { describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import {
    buildCreateDeliveryPersonnelUseCase,
    buildListDeliveryPersonnelUseCase,
    buildUpdateDeliveryPersonnelUseCase
} from '../src/modules/deliveryPersonnel/usecases/deliveryPersonnelUseCases.js';

const createTransaction = () => ({
    finished: false,
    LOCK: { UPDATE: 'UPDATE' },
    commit: jest.fn(async function commit() { this.finished = true; }),
    rollback: jest.fn(async function rollback() { this.finished = true; })
});

const plainRow = (values) => {
    const row = { ...values };
    row.get = ({ plain } = {}) => (plain ? { ...row } : row);
    return row;
};

const buildRepository = (seed = {}) => {
    const rows = new Map(seed.rows || []);
    const activeLocations = new Set(seed.activeLocationIds || [7]);
    const audit = [];
    return {
        rows,
        audit,
        async list({ includeInactive } = {}) {
            return [...rows.values()].filter((row) => includeInactive || row.is_active);
        },
        async findById(id) {
            return rows.get(id) || null;
        },
        async findActiveByDisplayName(displayName, { locationId = null } = {}) {
            const normalized = String(displayName || '').trim().toLowerCase();
            return [...rows.values()].find((row) => row.is_active
                && String(row.display_name).trim().toLowerCase() === normalized
                && (row.location_id ?? null) === (locationId ?? null)) || null;
        },
        async findActiveLocation(locationId) {
            return activeLocations.has(locationId) ? { location_id: locationId } : null;
        },
        async create(values) {
            const id = rows.size + 1;
            const row = plainRow({ delivery_personnel_id: id, ...values });
            rows.set(id, row);
            return row;
        },
        async update(row, values) {
            Object.assign(row, values);
            return row;
        },
        async createAuditLog(payload) {
            audit.push(payload);
            return payload;
        }
    };
};

describe('delivery personnel registry use cases', () => {
    it('creates a delivery personnel record and writes an audit row', async () => {
        const repository = buildRepository();
        jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize: { transaction: async () => createTransaction() } });
        const createDeliveryPersonnelUseCase = buildCreateDeliveryPersonnelUseCase({ repository });

        const result = await createDeliveryPersonnelUseCase({
            payload: { display_name: 'Juan Rider', location_id: 7 },
            actorUserId: 3
        });

        expect(result.success).toBe(true);
        expect(result.data.delivery_personnel.display_name).toBe('Juan Rider');
        expect(repository.audit).toHaveLength(1);
        expect(repository.audit[0].entity_type).toBe('delivery_personnel');
        expect(repository.audit[0].action).toBe('CREATE');
        jest.restoreAllMocks();
    });

    it('rejects a duplicate active display name in the same location scope with 409', async () => {
        const repository = buildRepository({
            rows: [[1, plainRow({ delivery_personnel_id: 1, display_name: 'Juan Rider', location_id: 7, is_active: true })]]
        });
        jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize: { transaction: async () => createTransaction() } });
        const createDeliveryPersonnelUseCase = buildCreateDeliveryPersonnelUseCase({ repository });

        const result = await createDeliveryPersonnelUseCase({
            payload: { display_name: 'Juan Rider', location_id: 7 },
            actorUserId: 3
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        jest.restoreAllMocks();
    });

    it('rejects an inactive/foreign location_id with 422', async () => {
        const repository = buildRepository({ activeLocationIds: [] });
        jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize: { transaction: async () => createTransaction() } });
        const createDeliveryPersonnelUseCase = buildCreateDeliveryPersonnelUseCase({ repository });

        const result = await createDeliveryPersonnelUseCase({
            payload: { display_name: 'Juan Rider', location_id: 99 },
            actorUserId: 3
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 404 when updating a missing id', async () => {
        const repository = buildRepository();
        jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize: { transaction: async () => createTransaction() } });
        const updateDeliveryPersonnelUseCase = buildUpdateDeliveryPersonnelUseCase({ repository });

        const result = await updateDeliveryPersonnelUseCase({
            deliveryPersonnelId: 404,
            payload: { display_name: 'Someone' },
            actorUserId: 3
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
        jest.restoreAllMocks();
    });

    it('soft-deactivates via is_active: false and the row survives', async () => {
        const repository = buildRepository({
            rows: [[1, plainRow({ delivery_personnel_id: 1, display_name: 'Juan Rider', location_id: 7, is_active: true })]]
        });
        jest.spyOn(dbStore, 'getStore').mockReturnValue({ sequelize: { transaction: async () => createTransaction() } });
        const updateDeliveryPersonnelUseCase = buildUpdateDeliveryPersonnelUseCase({ repository });

        const result = await updateDeliveryPersonnelUseCase({
            deliveryPersonnelId: 1,
            payload: { is_active: false },
            actorUserId: 3
        });

        expect(result.success).toBe(true);
        expect(result.data.delivery_personnel.is_active).toBe(false);
        expect(repository.rows.get(1).is_active).toBe(false);
        jest.restoreAllMocks();
    });

    it('lists all rows including inactive when includeInactive is true', async () => {
        const repository = buildRepository({
            rows: [
                [1, plainRow({ delivery_personnel_id: 1, display_name: 'Active Rider', is_active: true })],
                [2, plainRow({ delivery_personnel_id: 2, display_name: 'Retired Rider', is_active: false })]
            ]
        });
        const listDeliveryPersonnelUseCase = buildListDeliveryPersonnelUseCase({ repository });

        const result = await listDeliveryPersonnelUseCase({ includeInactive: true });

        expect(result.success).toBe(true);
        expect(result.data.delivery_personnel).toHaveLength(2);
    });
});
