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

// RF-1 fix (PR #1280 review): `sequelize.transaction` now needs to answer both call shapes the
// production code actually uses -- the bare `sequelize.transaction()` that opens the outer,
// unmanaged transaction, and the managed `sequelize.transaction({ transaction }, callback)` used
// per member as a savepoint. The savepoint variant snapshots the relevant state maps before running
// the callback and, on the callback throwing, restores every touched order/job object IN PLACE
// (Object.assign onto the same reference, not a map-entry swap) so `state.orders`,
// `state.deliveryJobsById`, and `state.deliveryJobsByOrder` -- which all three hold the very same
// job object for a given order -- stay consistent after a rollback, exactly mirroring what a real
// `ROLLBACK TO SAVEPOINT` does to the row your read pointer already has open.
const snapshotState = (state) => ({
    orders: new Map(Array.from(state.orders.entries()).map(([id, row]) => [id, { ...row }])),
    deliveryJobsByOrder: new Map(Array.from(state.deliveryJobsByOrder.entries()).map(([id, row]) => [id, { ...row }]))
});

const restoreState = (state, snapshot) => {
    snapshot.orders.forEach((snapshotRow, id) => {
        const current = state.orders.get(id);
        if (current) Object.assign(current, snapshotRow);
    });
    snapshot.deliveryJobsByOrder.forEach((snapshotRow, id) => {
        const current = state.deliveryJobsByOrder.get(id);
        if (current) Object.assign(current, snapshotRow);
    });
};

export const runInTenantContext = (callback, { state = null } = {}) => {
    const sequelize = {
        transaction: jest.fn((...args) => {
            const callbackFn = args.find((arg) => typeof arg === 'function');
            if (!callbackFn) {
                // Bare `sequelize.transaction()` -- the outer, unmanaged transaction.
                return Promise.resolve(createTransaction());
            }
            // Managed style -- `sequelize.transaction(callback)` or
            // `sequelize.transaction(options, callback)` (the per-member savepoint shape).
            const savepointTxn = createTransaction();
            const snapshot = state ? snapshotState(state) : null;
            return (async () => {
                try {
                    const result = await callbackFn(savepointTxn);
                    await savepointTxn.commit();
                    return result;
                } catch (error) {
                    if (snapshot) restoreState(state, snapshot);
                    await savepointTxn.rollback();
                    throw error;
                }
            })();
        })
    };
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
        // RF-1 fix (PR #1280 review): lets a test inject a genuine write-layer failure (a
        // transient DB error, a lock timeout) for one specific member, distinct from the
        // guard/transition rejections every other fan-out test already covers.
        const failure = state.writeFailures?.get(Number(orderId));
        if (failure === 'updateOrderById') {
            throw new Error(`Injected write failure for order ${orderId} (updateOrderById)`);
        }
        const order = state.orders.get(Number(orderId));
        if (!order) return null;
        Object.assign(order, payload);
        return { ...order };
    },
    // Phase 228 (#1273/#1271): dispatch advances the job to `assigned` via this method (mirrors
    // posRepository.js's real updateDeliveryJobByOrderId -- lookup by pos_transaction_id).
    async updateDeliveryJobByOrderId(orderId, payload) {
        const failure = state.writeFailures?.get(Number(orderId));
        if (failure === 'updateDeliveryJobByOrderId') {
            throw new Error(`Injected write failure for order ${orderId} (updateDeliveryJobByOrderId)`);
        }
        const job = state.deliveryJobsByOrder.get(Number(orderId));
        if (!job) return null;
        Object.assign(job, payload);
        return { ...job };
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
            // Phase 260 (#1489): scheduled_date_end makes the run span a date range.
            scheduled_date_end: payload.scheduled_date_end ?? null,
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
        // RF-1 fix (PR #1280 review): orderId -> 'updateOrderById' | 'updateDeliveryJobByOrderId',
        // set via `injectWriteFailure` below to simulate a genuine write-layer error for that one
        // member's dispatch write step.
        writeFailures: new Map(),
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
        runId = null,
        // Phase 228 (#1273/#1271): dispatch-only fields -- a run member with a completed personnel
        // assignment (the normal post-Phase-225/227 state) passes these so isDeliveryAssignmentComplete
        // holds; leave unset (the pre-Phase-228 default) to exercise DELIVERY_ASSIGNMENT_REQUIRED.
        deliveryPersonnelId = null,
        deliveryPersonnelName = null,
        assignedBy = null,
        assignedShiftId = null,
        assignedAt = null,
        orderMethod = 'delivery',
        orderSource = 'online_store'
    }) => {
        const job = {
            delivery_job_id: deliveryJobId,
            pos_transaction_id: orderId,
            location_id: locationId,
            provider,
            status: jobStatus,
            delivery_run_id: runId,
            delivery_personnel_id: deliveryPersonnelId,
            delivery_personnel_name: deliveryPersonnelName,
            assigned_by: assignedBy,
            assigned_shift_id: assignedShiftId,
            assigned_at: assignedAt
        };
        const order = {
            pos_transaction_id: orderId,
            order_source: orderSource,
            order_method: orderMethod,
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
        // RF-1 fix (PR #1280 review): injects a write-layer failure for `orderId`'s dispatch write
        // step -- `method` is 'updateOrderById' (default) or 'updateDeliveryJobByOrderId'.
        injectWriteFailure: (orderId, method = 'updateOrderById') => {
            state.writeFailures.set(Number(orderId), method);
        },
        posRepository: buildPosRepository(state),
        deliveryRunRepository: buildDeliveryRunRepository(state)
    };
};
