// Phase 225 (#1273/#1081): shared in-memory fake posRepository/deliveryRunRepository harness for
// deliveryRun.usecase.test.js and deliveryRunWriteThrough.usecase.test.js. Mirrors the style of
// posDeliveryAssignment.usecase.test.js's buildAssignmentRepository, extended to cover run/
// personnel/membership state.
import { jest } from '@jest/globals';
import dbStore from '../../src/utils/dbStore.js';
import { DomainError, DomainErrorCode } from '../../src/modules/shared/contracts/domainErrors.js';

export const createTransaction = () => ({
    finished: false,
    LOCK: { UPDATE: 'UPDATE' },
    commit: jest.fn(async function commit() { this.finished = true; }),
    rollback: jest.fn(async function rollback() { this.finished = true; })
});

export const runInTenantContext = (callback) => {
    const sequelize = { transaction: jest.fn(async () => createTransaction()) };
    return dbStore.run({ tenantId: 'delivery-run-test', sequelize }, callback);
};

const buildPosRepository = (state) => ({
    async findOperationReplayByKey({ operationKey, idempotencyKey }) {
        return state.replays.get(`${operationKey}:${idempotencyKey}`) || null;
    },
    async createOperationReplay(payload) {
        state.replays.set(`${payload.operation_key}:${payload.idempotency_key}`, payload);
        return payload;
    },
    async getOrderByIdForLifecycle(orderId) {
        const order = state.orders.get(Number(orderId));
        if (!order) return null;
        return { ...order, deliveryJob: order.deliveryJob ? { ...order.deliveryJob } : null };
    },
    async findOpenTerminalShift({ locationId } = {}) {
        if (!state.openShift) return null;
        return { ...state.openShift, location_id: locationId ?? state.openShift.location_id };
    },
    async updateOrderById(orderId, payload) {
        const order = state.orders.get(Number(orderId));
        if (!order) return null;
        Object.assign(order, payload);
        return { ...order };
    },
    async findActiveDeliveryPersonnelById(id) {
        const personnel = state.personnelRegistry.get(Number(id));
        return personnel ? { ...personnel } : null;
    },
    async assignDeliveryPersonnelToJob(orderId, payload) {
        const job = state.deliveryJobsByOrder.get(Number(orderId));
        if (!job) return null;
        Object.assign(job, {
            delivery_personnel_id: payload.delivery_personnel_id ?? null,
            delivery_personnel_name: payload.delivery_personnel_name ?? null,
            assigned_by: payload.assigned_by,
            assigned_shift_id: payload.assigned_shift_id,
            assigned_at: payload.assigned_at,
            ...(payload.status ? { status: payload.status } : {})
        });
        return { ...job };
    },
    async createAuditLog(payload) {
        state.audit.push(payload);
        return payload;
    }
});

const buildDeliveryRunRepository = (state) => ({
    async createRun(payload) {
        const id = state.nextRunId++;
        const run = {
            delivery_run_id: id,
            label: payload.label,
            status: payload.status || 'draft',
            location_id: payload.location_id ?? null,
            scheduled_date: payload.scheduled_date ?? null,
            notes: payload.notes ?? null,
            created_by: payload.created_by ?? null,
            updated_by: null
        };
        state.runs.set(id, run);
        state.runPersonnel.set(id, []);
        return { ...run };
    },
    async getRunById(runId) {
        const run = state.runs.get(Number(runId));
        return run ? { ...run } : null;
    },
    async updateRun(runId, payload) {
        const run = state.runs.get(Number(runId));
        if (!run) return null;
        Object.assign(run, payload);
        return { ...run };
    },
    async listRuns({ status = null, locationId = null } = {}) {
        let items = Array.from(state.runs.values());
        if (status) items = items.filter((run) => run.status === status);
        if (locationId != null) items = items.filter((run) => Number(run.location_id) === Number(locationId));
        return {
            items: items.map((run) => ({
                ...run,
                member_count: Array.from(state.deliveryJobsById.values()).filter((job) => job.delivery_run_id === run.delivery_run_id).length
            })),
            total: items.length,
            page: 1,
            limit: 20
        };
    },
    async getRunDetail(runId) {
        const run = state.runs.get(Number(runId));
        if (!run) return null;
        const personnel = (state.runPersonnel.get(Number(runId)) || []).map((row) => ({ ...row }));
        const deliveryJobs = Array.from(state.deliveryJobsById.values())
            .filter((job) => job.delivery_run_id === Number(runId))
            .map((job) => ({ ...job, transaction: { ...(state.orders.get(job.pos_transaction_id) || {}) } }));
        return { ...run, personnel, deliveryJobs };
    },
    async listRunPersonnel(runId) {
        return (state.runPersonnel.get(Number(runId)) || []).map((row) => ({ ...row }));
    },
    async replaceRunPersonnel(runId, rows) {
        const created = rows.map((row, idx) => ({
            delivery_run_personnel_id: idx + 1,
            delivery_run_id: Number(runId),
            ...row
        }));
        state.runPersonnel.set(Number(runId), created);
        return created.map((row) => ({ ...row }));
    },
    async addJobsToRun(runId, jobIds) {
        let affected = 0;
        jobIds.forEach((id) => {
            const job = state.deliveryJobsById.get(Number(id));
            if (job) {
                job.delivery_run_id = Number(runId);
                affected += 1;
            }
        });
        return affected;
    },
    async removeJobFromRun(deliveryJobId) {
        const job = state.deliveryJobsById.get(Number(deliveryJobId));
        if (!job) return null;
        job.delivery_run_id = null;
        return { ...job };
    },
    async clearDeliveryJobAssignment(deliveryJobId) {
        const job = state.deliveryJobsById.get(Number(deliveryJobId));
        if (!job) return null;
        Object.assign(job, {
            delivery_personnel_id: null,
            delivery_personnel_name: null,
            assigned_by: null,
            assigned_shift_id: null,
            assigned_at: null
        });
        return { ...job };
    },
    async getDeliveryJobByOrderId(orderId) {
        const job = state.deliveryJobsByOrder.get(Number(orderId));
        return job ? { ...job } : null;
    },
    async getDeliveryJobById(id) {
        const job = state.deliveryJobsById.get(Number(id));
        return job ? { ...job } : null;
    }
});

// RF-1 fix (PR #1276 review): a fake resolveLocationScope matching the real
// resolvePosOperationalLocationScope contract -- given a { userId: homeLocationId } map, resolves
// requestedLocationId when it matches the actor's home location, otherwise throws the same
// DomainError shape (403, reason_code POS_LOCATION_ACCESS_DENIED) the real POS location-scope
// resolver throws for a cross-location actor. Lets the location-scoping regression tests inject a
// deterministic actor-to-location mapping without touching the real DB-backed resolver.
export const createLocationScopeResolver = (homeLocationByUserId = {}) => (
    async ({ requestedLocationId = null, userId = null } = {}) => {
        const normalizedUserId = Number(userId);
        const homeLocationId = homeLocationByUserId[normalizedUserId] ?? null;

        if (requestedLocationId != null) {
            if (!homeLocationId || Number(requestedLocationId) !== Number(homeLocationId)) {
                throw new DomainError(
                    DomainErrorCode.AUTHORIZATION_FAILED,
                    'Access denied for delivery run location scope.',
                    {
                        statusCode: 403,
                        details: { reason_code: 'POS_LOCATION_ACCESS_DENIED', location_id: requestedLocationId }
                    }
                );
            }
            return { location_id: Number(requestedLocationId) };
        }

        if (!homeLocationId) {
            throw new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Delivery run operation could not resolve a location scope.',
                { statusCode: 422, details: { reason_code: 'POS_LOCATION_SCOPE_UNRESOLVED' } }
            );
        }
        return { location_id: homeLocationId };
    }
);

export const createDeliveryRunTestHarness = ({ cashierId = 12, openShiftLocationId = 7 } = {}) => {
    const state = {
        nextRunId: 1,
        runs: new Map(),
        runPersonnel: new Map(),
        orders: new Map(),
        deliveryJobsById: new Map(),
        deliveryJobsByOrder: new Map(),
        personnelRegistry: new Map(),
        replays: new Map(),
        audit: [],
        openShift: {
            pos_terminal_shift_id: 9,
            terminal_id: 'COUNTER-01',
            cashier_id: cashierId,
            location_id: openShiftLocationId,
            status: 'open'
        }
    };

    state.personnelRegistry.set(21, {
        delivery_personnel_id: 21,
        display_name: 'Branch Rider',
        phone: '09170000000',
        location_id: 7,
        is_active: true
    });

    const addOrder = ({
        orderId,
        deliveryJobId,
        locationId = 7,
        fulfillmentStatus = 'preparing',
        provider = 'manual',
        jobStatus = 'pending_dispatch',
        runId = null
    }) => {
        const job = {
            delivery_job_id: deliveryJobId,
            pos_transaction_id: orderId,
            location_id: locationId,
            provider,
            status: jobStatus,
            delivery_run_id: runId,
            delivery_personnel_id: null,
            delivery_personnel_name: null,
            assigned_by: null,
            assigned_shift_id: null,
            assigned_at: null
        };
        const order = {
            pos_transaction_id: orderId,
            order_source: 'online_store',
            order_method: 'delivery',
            fulfillment_status: fulfillmentStatus,
            location_id: locationId,
            invoice_number: `INV-${orderId}`,
            customer_name: 'Customer',
            delivery_address: 'Address',
            deliveryJob: job
        };
        state.orders.set(orderId, order);
        state.deliveryJobsById.set(deliveryJobId, job);
        state.deliveryJobsByOrder.set(orderId, job);
        return { order, job };
    };

    return {
        state,
        addOrder,
        posRepository: buildPosRepository(state),
        deliveryRunRepository: buildDeliveryRunRepository(state)
    };
};
