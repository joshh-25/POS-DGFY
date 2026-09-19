// Phase 225 (#1273/#1081): delivery run use cases -- create/list/get/update a run, replace its
// personnel roster, add members in bulk, and remove a single member with conditional-clear
// removal semantics. See PHASE-225-PLAN.md sections 1 and 4 for the full design rationale,
// especially why the write-through here calls applyDeliveryPersonnelAssignment with
// advanceJobStatus:false (fields now, job status stays pending_dispatch until Phase 228 dispatch)
// rather than reusing buildAssignDeliveryPersonnelUseCase verbatim.
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapPosUseCaseError } from './posUseCaseError.js';
import dbStore from '../../../utils/dbStore.js';
import {
    buildDeliveryRunLoadingSummary,
    serializeDeliveryRun,
    serializeDeliveryRunMember,
    serializeDeliveryRunRemittance,
    serializeDeliveryRunRemittanceVariance
} from '../serializers/deliveryRunSerializer.js';
import { resolveWorkflowCapabilitySettings } from '../../shared/utils/workflowCapabilitySettingsCache.js';
import { normalizeWorkflowMode } from '../../shared/constants/workflowModes.js';
import { recordDgfyOrderActivity } from '../../dgfy/utils/customerActivityRecorder.js';
import logger from '../../../config/logger.js';
import { PERMISSIONS } from '../../../config/permissions.js';
import { hasEffectivePermission } from '../../../utils/userPermissions.js';
import { assertStaffAssignment } from '../../staff/index.js';
import {
    applyDeliveryPersonnelAssignment,
    findOperationReplayEntry,
    persistOperationReplay,
    assertOpenShiftForPosMutation,
    resolvePosOperationalLocationScope,
    parsePositiveInt,
    hashPayload,
    normalizeOptionalIdempotencyKey,
    OPERATION_REPLAY_STATUS,
    serializeReplayFailure,
    toSerializable,
    POS_OPERATION_KEYS,
    ONLINE_ORDER_SOURCE,
    normalizeOnlineFulfillmentStatus,
    validateOnlineOrderTransition,
    buildOnlineOrderShiftAttributionPayload
} from './posUseCases.js';

const RUN_LOCKED_STATUSES = Object.freeze(['dispatched', 'completed']);
const RUN_MUTATION_BLOCKED_STATUSES = Object.freeze(['dispatched', 'completed', 'cancelled']);
const RUN_UPDATABLE_STATUSES = Object.freeze(['draft', 'scheduled', 'cancelled']);

// Phase 260 (#1489): maximum span a delivery run's scheduled_date/scheduled_date_end range may
// cover, inclusive of both endpoints. Placeholder -- #1489's own text doesn't specify a number;
// 31 was chosen as a conservative default (a run spanning over a month almost certainly indicates
// a data-entry mistake) and can be revisited once real usage patterns exist.
const MAX_DELIVERY_RUN_SPAN_DAYS = 31;

// RF-1 fix (PR #1500 review): normalizes a scheduled_date/scheduled_date_end value into a DATEONLY
// ('YYYY-MM-DD') string before calculateDeliveryRunSpanDays does day-span arithmetic on it. On a
// real HTTP request, createDeliveryRunSchema/updateDeliveryRunSchema's `Joi.date().iso()` hands the
// use case an actual JS Date object -- unit tests that called the use case directly with plain
// 'YYYY-MM-DD' strings never exercised that path. A Date object interpolated straight into the
// `${value}T00:00:00.000Z` template below stringifies via its default `toString()` (e.g. "Wed Sep
// 03 2026 00:00:00 GMT+0000 (Coordinated Universal Time)"), which `new Date(...)` can't parse --
// producing `Invalid Date` on both sides and `NaN` for the span, and `NaN > MAX_DELIVERY_RUN_SPAN_
// DAYS` is `false`, so the documented 31-day cap silently never fires. Sequelize DATEONLY columns
// round-trip as plain strings, so a value read back from the DB (the `run.scheduled_date`/
// `run.scheduled_date_end` merge in buildUpdateDeliveryRunUseCase) already arrives as a string and
// passes through this unchanged.
const toDateOnlyString = (value) => {
    if (value instanceof Date) {
        const year = value.getUTCFullYear();
        const month = String(value.getUTCMonth() + 1).padStart(2, '0');
        const day = String(value.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return String(value).slice(0, 10);
};

// Inclusive day-count between two DATEONLY ('YYYY-MM-DD') values, e.g. same day -> 1. Accepts a
// DATEONLY string or a Date object for either argument -- see toDateOnlyString above.
const calculateDeliveryRunSpanDays = (startDate, endDate) => {
    const start = toDateOnlyString(startDate);
    const end = toDateOnlyString(endDate);
    return Math.round(
        (new Date(`${end}T00:00:00.000Z`) - new Date(`${start}T00:00:00.000Z`)) / 86400000
    ) + 1;
};

// Phase 228 (#1273/#1271): dispatch's own locked-status set. Deliberately NOT reusing
// RUN_LOCKED_STATUSES/RUN_MUTATION_BLOCKED_STATUSES above -- both correctly treat `dispatched` as
// locked for every other run mutation (personnel/membership edits), but dispatch is the one place
// a `dispatched` run must remain mutable: re-dispatch is the retry path for stragglers (D-3). Do
// not "fix" this by folding it back into the shared constants above.
const RUN_DISPATCH_BLOCKED_STATUSES = Object.freeze(['completed', 'cancelled']);

// #1272 (2026-08-31, Pat's posted decision), retail-only, run-level, evaluated BEFORE the fan-out:
// dispatch refuses to start at all -- writes nothing -- if any member's order fulfillment_status is
// earlier than `packed`. This is a precondition on the dispatch endpoint only; ONLINE_FULFILLMENT_
// TRANSITIONS (posUseCases.js) is not touched by this gate, so F&B (workflow mode !== 'retail'),
// which skips this check entirely, is unaffected by construction.
const PRE_PACKED_FULFILLMENT_STATUSES = Object.freeze(['placed', 'confirmed', 'preparing']);
const DELIVERY_RUN_LOADING_STATES = Object.freeze(['pending', 'loaded', 'not_loaded', 'exception']);

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const isDuplicateConstraintError = (error) => (
    error?.name === 'SequelizeUniqueConstraintError'
    || error?.parent?.code === 'ER_DUP_ENTRY'
    || error?.original?.code === 'ER_DUP_ENTRY'
);

const isDeliveryAssignmentComplete = (deliveryJob) => {
    const hasPersonnel = Boolean(
        parsePositiveInt(deliveryJob?.delivery_personnel_id)
        || String(deliveryJob?.delivery_personnel_name || '').trim()
    );
    return Boolean(
        hasPersonnel
        && parsePositiveInt(deliveryJob?.assigned_by)
        && parsePositiveInt(deliveryJob?.assigned_shift_id)
        && deliveryJob?.assigned_at
    );
};

const getSequelize = () => dbStore.getStore()?.sequelize || dbStore.get('sequelize');

const findAccountablePersonnelRow = (personnelRows = []) => (
    personnelRows.find((row) => Boolean(row.is_accountable)) || null
);

// Resolves the run's currently accountable person into the shape applyDeliveryPersonnelAssignment
// expects for its `personnel` argument -- either the live registry row (for a registered courier)
// or a synthesized third-party descriptor (for a free-text name). Mirrors the branch in
// buildAssignDeliveryPersonnelUseCase (posUseCases.js) that does the same for the per-order path.
const resolveRunAccountablePersonnel = async ({ posRepository, accountableRow, locationId, transaction }) => {
    const hasRegisteredPersonnel = Boolean(parsePositiveInt(accountableRow.delivery_personnel_id));
    const deliveryPersonnelName = String(accountableRow.delivery_personnel_name || '').trim();

    if (hasRegisteredPersonnel) {
        const personnel = await posRepository.findActiveDeliveryPersonnelById(accountableRow.delivery_personnel_id, {
            locationId,
            transaction,
            lock: true
        });
        if (!personnel) {
            throw new DomainError(
                DomainErrorCode.RESOURCE_NOT_FOUND,
                'Active delivery personnel was not found for the run location.',
                {
                    statusCode: 404,
                    details: { reason_code: 'DELIVERY_PERSONNEL_NOT_AVAILABLE' }
                }
            );
        }
        return { personnel, hasRegisteredPersonnel: true, deliveryPersonnelName: '' };
    }

    return {
        personnel: {
            delivery_personnel_id: null,
            display_name: deliveryPersonnelName,
            phone: null,
            location_id: locationId,
            is_active: true,
            is_third_party: true
        },
        hasRegisteredPersonnel: false,
        deliveryPersonnelName
    };
};

const personnelIdentityMatches = (deliveryJob, accountableRow) => {
    const jobPersonnelId = parsePositiveInt(deliveryJob.delivery_personnel_id);
    const accountablePersonnelId = parsePositiveInt(accountableRow?.delivery_personnel_id);
    if (jobPersonnelId || accountablePersonnelId) {
        return Boolean(jobPersonnelId) && jobPersonnelId === accountablePersonnelId;
    }
    const jobName = String(deliveryJob.delivery_personnel_name || '').trim().toLowerCase();
    const accountableName = String(accountableRow?.delivery_personnel_name || '').trim().toLowerCase();
    return Boolean(jobName) && jobName === accountableName;
};

export const buildCreateDeliveryRunUseCase = ({
    deliveryRunRepository,
    resolveLocationScope = resolvePosOperationalLocationScope
}) => {
    return async ({ payload = {}, user = {} } = {}) => {
        const actorUserId = parsePositiveInt(user?.user_id);
        const label = String(payload?.label || '').trim();

        if (!actorUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }
        if (!label) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'label is required',
                { statusCode: 422 }
            ));
        }
        // end < start is already impossible here -- createDeliveryRunSchema's
        // `.min(Joi.ref('scheduled_date'))` rejected it before this use case ever runs. Only the
        // max-span check remains this use case's job.
        if (payload?.scheduled_date && payload?.scheduled_date_end) {
            const spanDays = calculateDeliveryRunSpanDays(payload.scheduled_date, payload.scheduled_date_end);
            if (spanDays > MAX_DELIVERY_RUN_SPAN_DAYS) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    `Delivery run schedule cannot exceed ${MAX_DELIVERY_RUN_SPAN_DAYS} days`,
                    { statusCode: 422, details: { reason_code: 'DELIVERY_RUN_RANGE_TOO_LONG' } }
                ));
            }
        }

        try {
            const locationScope = await resolveLocationScope({
                requestedLocationId: payload?.location_id ?? null,
                userId: actorUserId,
                operationLabel: 'Delivery run creation',
                allowNullWhenUnresolved: true
            });

            const run = await deliveryRunRepository.createRun({
                label,
                scheduled_date: payload?.scheduled_date ?? null,
                scheduled_date_end: payload?.scheduled_date_end ?? null,
                transportation_label: payload?.transportation_label ?? null,
                location_id: locationScope.location_id ?? null,
                notes: payload?.notes ?? null,
                created_by: actorUserId
            });

            return ok(serializeDeliveryRun(run, { members: [] }));
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to create delivery run'));
        }
    };
};

// RF-1 fix (PR #1276 review): list/get must resolve the actor's own operational location scope
// -- the same resolvePosOperationalLocationScope mechanism buildAssignDeliveryPersonnelUseCase's
// siblings already use for this purpose (see buildListActiveDeliveryPersonnelUseCase for the
// closest precedent) -- so a POS user can never read a run belonging to a location they aren't
// authorized for.
export const buildListDeliveryRunsUseCase = ({
    deliveryRunRepository,
    resolveLocationScope = resolvePosOperationalLocationScope
}) => {
    return async ({ query = {}, user = {} } = {}) => {
        const actorUserId = parsePositiveInt(user?.user_id);
        if (!actorUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }

        const requestedLocationId = query?.location_id == null ? null : parsePositiveInt(query.location_id);
        if (query?.location_id != null && !requestedLocationId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'location_id must be a positive integer',
                { statusCode: 422 }
            ));
        }

        try {
            const locationScope = await resolveLocationScope({
                requestedLocationId,
                userId: actorUserId,
                operationLabel: 'Delivery run list'
            });

            const { items, total, page, limit } = await deliveryRunRepository.listRuns({
                status: query?.status || null,
                scheduledDateFrom: query?.scheduled_date_from || null,
                scheduledDateTo: query?.scheduled_date_to || null,
                locationId: locationScope.location_id,
                page: query?.page || 1,
                limit: query?.limit || 20
            });

            return ok({
                items: items.map((run) => serializeDeliveryRun(run, { memberCount: run.member_count })),
                pagination: { total, page, limit }
            });
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to list delivery runs'));
        }
    };
};

export const buildGetDeliveryRunUseCase = ({
    deliveryRunRepository,
    resolveLocationScope = resolvePosOperationalLocationScope
}) => {
    return async ({ deliveryRunId, user = {} } = {}) => {
        const runId = parsePositiveInt(deliveryRunId);
        const actorUserId = parsePositiveInt(user?.user_id);
        if (!runId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'deliveryRunId must be a positive integer',
                { statusCode: 400 }
            ));
        }
        if (!actorUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }

        try {
            const run = await deliveryRunRepository.getRunDetail(runId);
            if (!run) {
                return fail(new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Delivery run was not found.',
                    { statusCode: 404, details: { reason_code: 'DELIVERY_RUN_NOT_FOUND' } }
                ));
            }

            // A run with no location scope (allowed at creation for an unresolved multi-location
            // actor) is not location-gated -- otherwise require the actor be authorized for the
            // run's own location, same standard denial every other POS use case throws.
            if (run.location_id != null) {
                await resolveLocationScope({
                    requestedLocationId: run.location_id,
                    userId: actorUserId,
                    operationLabel: 'Delivery run retrieval'
                });
            }

            return ok(serializeDeliveryRun(run));
        } catch (error) {
            return fail(mapPosUseCaseError(error, 'Failed to retrieve delivery run'));
        }
    };
};

export const buildUpdateDeliveryRunUseCase = ({
    deliveryRunRepository,
    resolveLocationScope = resolvePosOperationalLocationScope
}) => {
    return async ({ deliveryRunId, payload = {}, user = {} } = {}) => {
        const runId = parsePositiveInt(deliveryRunId);
        const actorUserId = parsePositiveInt(user?.user_id);

        if (!runId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'deliveryRunId must be a positive integer',
                { statusCode: 400 }
            ));
        }
        if (!actorUserId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }
        if (payload?.status && !RUN_UPDATABLE_STATUSES.includes(payload.status)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `status must be one of: ${RUN_UPDATABLE_STATUSES.join(', ')}`,
                { statusCode: 422 }
            ));
        }

        let transaction = null;
        try {
            const sequelize = getSequelize();
            transaction = await sequelize.transaction();

            const run = await deliveryRunRepository.getRunById(runId, { transaction, lock: true });
            if (!run) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Delivery run was not found.',
                    { statusCode: 404, details: { reason_code: 'DELIVERY_RUN_NOT_FOUND' } }
                );
            }
            if (run.location_id != null) {
                await resolveLocationScope({
                    requestedLocationId: run.location_id,
                    userId: actorUserId,
                    operationLabel: 'Delivery run update',
                    transaction
                });
            }
            if (RUN_LOCKED_STATUSES.includes(run.status)) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This delivery run can no longer be edited.',
                    { statusCode: 409, details: { reason_code: 'DELIVERY_RUN_LOCKED', status: run.status } }
                );
            }

            const updatePayload = { updated_by: actorUserId };
            if (payload?.label !== undefined) updatePayload.label = String(payload.label).trim();
            if (payload?.scheduled_date !== undefined) updatePayload.scheduled_date = payload.scheduled_date;
            if (payload?.scheduled_date_end !== undefined) updatePayload.scheduled_date_end = payload.scheduled_date_end;
            if (payload?.notes !== undefined) updatePayload.notes = payload.notes;
            if (payload?.transportation_label !== undefined) updatePayload.transportation_label = payload.transportation_label;
            if (payload?.status !== undefined) updatePayload.status = payload.status;

            // Range invariant against the MERGED effective state (existing row + this patch) --
            // a PATCH touching only one of scheduled_date/scheduled_date_end must still be checked
            // against whichever value the other field already holds in the DB. createDeliveryRunSchema's
            // Joi.ref cross-check can't see this because a same-request rule only sees fields present
            // in that one request; this is the use case's job instead, against the row locked above.
            const effectiveStart = updatePayload.scheduled_date !== undefined
                ? updatePayload.scheduled_date
                : run.scheduled_date;
            const effectiveEnd = updatePayload.scheduled_date_end !== undefined
                ? updatePayload.scheduled_date_end
                : run.scheduled_date_end;
            if (effectiveStart && effectiveEnd && effectiveEnd < effectiveStart) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'scheduled_date_end must not be before scheduled_date',
                    { statusCode: 422, details: { reason_code: 'DELIVERY_RUN_RANGE_INVALID' } }
                );
            }
            if (effectiveStart && effectiveEnd) {
                const spanDays = calculateDeliveryRunSpanDays(effectiveStart, effectiveEnd);
                if (spanDays > MAX_DELIVERY_RUN_SPAN_DAYS) {
                    throw new DomainError(
                        DomainErrorCode.VALIDATION_FAILED,
                        `Delivery run schedule cannot exceed ${MAX_DELIVERY_RUN_SPAN_DAYS} days`,
                        { statusCode: 422, details: { reason_code: 'DELIVERY_RUN_RANGE_TOO_LONG' } }
                    );
                }
            }

            const updatedRun = await deliveryRunRepository.updateRun(runId, updatePayload, { transaction });
            await transaction.commit();

            const runDetail = await deliveryRunRepository.getRunDetail(runId);
            return ok(serializeDeliveryRun(runDetail || updatedRun));
        } catch (error) {
            if (transaction && !transaction.finished) await transaction.rollback();
            return fail(mapPosUseCaseError(error, 'Failed to update delivery run'));
        }
    };
};

export const buildSetDeliveryRunPersonnelUseCase = ({
    posRepository,
    deliveryRunRepository,
    resolveLocationScope = resolvePosOperationalLocationScope
}) => {
    return async ({ deliveryRunId, payload = {}, user = {}, auditContext = {} } = {}) => {
        const runId = parsePositiveInt(deliveryRunId);
        const cashierId = parsePositiveInt(user?.user_id);
        const personnelInput = Array.isArray(payload?.personnel) ? payload.personnel : [];
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const requestHash = hashPayload({
            delivery_run_id: runId,
            personnel: personnelInput
        });

        if (!runId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'deliveryRunId must be a positive integer',
                { statusCode: 400 }
            ));
        }
        if (!cashierId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }
        if (!idempotencyKey) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'idempotency_key is required for delivery run personnel changes',
                { statusCode: 422 }
            ));
        }
        const accountableCount = personnelInput.filter((row) => row?.is_accountable).length;
        if (personnelInput.length === 0 || accountableCount !== 1) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'Exactly one personnel row must be marked is_accountable',
                { statusCode: 422 }
            ));
        }

        let transaction = null;
        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_PERSONNEL,
                idempotencyKey,
                requestHash
            });
            if (replay) return ok(replay);

            const sequelize = getSequelize();
            transaction = await sequelize.transaction();
            const transactionReplay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_PERSONNEL,
                idempotencyKey,
                requestHash,
                transaction
            });
            if (transactionReplay) {
                await transaction.commit();
                return ok(transactionReplay);
            }

            const run = await deliveryRunRepository.getRunById(runId, { transaction, lock: true });
            if (!run) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Delivery run was not found.',
                    { statusCode: 404, details: { reason_code: 'DELIVERY_RUN_NOT_FOUND' } }
                );
            }
            if (run.location_id != null) {
                await resolveLocationScope({
                    requestedLocationId: run.location_id,
                    userId: cashierId,
                    operationLabel: 'Delivery run personnel set',
                    transaction
                });
            }
            if (RUN_LOCKED_STATUSES.includes(run.status)) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This delivery run can no longer be edited.',
                    { statusCode: 409, details: { reason_code: 'DELIVERY_RUN_LOCKED', status: run.status } }
                );
            }

            const runLocationId = parsePositiveInt(run.location_id);
            const previousPersonnelRows = await deliveryRunRepository.listRunPersonnel(runId, { transaction, lock: true });
            const previousAccountableRow = findAccountablePersonnelRow(previousPersonnelRows);

            const resolvedRows = [];
            for (const row of personnelInput) {
                const deliveryPersonnelId = parsePositiveInt(row?.delivery_personnel_id);
                const deliveryPersonnelName = String(row?.delivery_personnel_name || '').trim();
                if (deliveryPersonnelId) {
                    const registryEntry = await posRepository.findActiveDeliveryPersonnelById(deliveryPersonnelId, {
                        locationId: runLocationId,
                        transaction,
                        lock: true
                    });
                    if (!registryEntry) {
                        throw new DomainError(
                            DomainErrorCode.RESOURCE_NOT_FOUND,
                            'Active delivery personnel was not found for the run location.',
                            { statusCode: 404, details: { reason_code: 'DELIVERY_PERSONNEL_NOT_AVAILABLE' } }
                        );
                    }
                    resolvedRows.push({
                        delivery_personnel_id: deliveryPersonnelId,
                        delivery_personnel_name: null,
                        is_accountable: Boolean(row.is_accountable),
                        created_by: cashierId,
                        updated_by: cashierId
                    });
                } else {
                    resolvedRows.push({
                        delivery_personnel_id: null,
                        delivery_personnel_name: deliveryPersonnelName,
                        is_accountable: Boolean(row.is_accountable),
                        created_by: cashierId,
                        updated_by: cashierId
                    });
                }
            }

            const createdPersonnel = await deliveryRunRepository.replaceRunPersonnel(runId, resolvedRows, { transaction });
            const newAccountableRow = findAccountablePersonnelRow(createdPersonnel);

            const updatedMembers = [];
            const unchangedMembers = [];

            if (previousAccountableRow && newAccountableRow && runLocationId) {
                const runDetail = await deliveryRunRepository.getRunDetail(runId, { transaction });
                const memberJobs = Array.isArray(runDetail?.deliveryJobs) ? runDetail.deliveryJobs : [];

                const jobsToReassign = memberJobs.filter((job) => (
                    String(job.status || '').trim().toLowerCase() === 'pending_dispatch'
                    && personnelIdentityMatches(job, previousAccountableRow)
                ));
                const jobsPastPendingDispatch = memberJobs.filter((job) => (
                    String(job.status || '').trim().toLowerCase() !== 'pending_dispatch'
                ));

                if (jobsToReassign.length > 0) {
                    const activeShift = await assertOpenShiftForPosMutation({
                        posRepository,
                        cashierId,
                        locationId: runLocationId,
                        transaction,
                        lock: true
                    });
                    const { personnel, hasRegisteredPersonnel, deliveryPersonnelName } = await resolveRunAccountablePersonnel({
                        posRepository,
                        accountableRow: newAccountableRow,
                        locationId: runLocationId,
                        transaction
                    });

                    for (const job of jobsToReassign) {
                        const { updatedDeliveryJob } = await applyDeliveryPersonnelAssignment({
                            posRepository,
                            orderId: job.pos_transaction_id,
                            deliveryJob: job,
                            personnel,
                            hasRegisteredPersonnel,
                            deliveryPersonnelName,
                            cashierId,
                            activeShift,
                            orderLocationId: runLocationId,
                            advanceJobStatus: false,
                            auditContext,
                            transaction
                        });
                        updatedMembers.push({ pos_transaction_id: job.pos_transaction_id, delivery_job: toSerializable(updatedDeliveryJob) });
                    }
                }

                jobsPastPendingDispatch.forEach((job) => {
                    unchangedMembers.push({
                        pos_transaction_id: job.pos_transaction_id,
                        reason_code: 'DELIVERY_JOB_ASSIGNMENT_LOCKED'
                    });
                });
            }

            await posRepository.createAuditLog({
                user_id: cashierId,
                entity_type: 'delivery_run',
                entity_id: runId,
                action: 'UPDATE',
                changes: {
                    event: 'delivery_run_personnel_set',
                    delivery_run_id: runId,
                    personnel: toSerializable(createdPersonnel)
                },
                ip_address: auditContext.ipAddress || null,
                user_agent: auditContext.userAgent || null
            }, { transaction });

            const runDetail = await deliveryRunRepository.getRunDetail(runId, { transaction });
            const responsePayload = {
                run: serializeDeliveryRun(runDetail),
                updated_members: updatedMembers,
                unchanged_members: unchangedMembers,
                idempotency: {
                    key: idempotencyKey,
                    request_fingerprint: requestHash,
                    outcome: 'processed',
                    idempotent_replay: false
                }
            };
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_PERSONNEL,
                idempotencyKey,
                requestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload,
                createdBy: cashierId,
                transaction
            });
            await transaction.commit();
            return ok({ ...responsePayload, idempotent_replay: false, replay_outcome: 'processed' });
        } catch (error) {
            if (transaction && !transaction.finished) await transaction.rollback();
            if (error instanceof DomainError && idempotencyKey) {
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_PERSONNEL,
                    idempotencyKey,
                    requestHash,
                    replayStatus: OPERATION_REPLAY_STATUS.BLOCKED,
                    responsePayload: serializeReplayFailure(error),
                    createdBy: cashierId
                });
            }
            return fail(mapPosUseCaseError(error, 'Failed to set delivery run personnel'));
        }
    };
};

export const buildAddDeliveryRunMembersUseCase = ({
    posRepository,
    deliveryRunRepository,
    resolveLocationScope = resolvePosOperationalLocationScope
}) => {
    return async ({ deliveryRunId, payload = {}, user = {}, auditContext = {} } = {}) => {
        const runId = parsePositiveInt(deliveryRunId);
        const cashierId = parsePositiveInt(user?.user_id);
        const orderIds = Array.from(new Set((Array.isArray(payload?.pos_transaction_ids) ? payload.pos_transaction_ids : [])
            .map(parsePositiveInt)
            .filter(Boolean)));
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const requestHash = hashPayload({
            delivery_run_id: runId,
            pos_transaction_ids: orderIds
        });

        if (!runId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'deliveryRunId must be a positive integer',
                { statusCode: 400 }
            ));
        }
        if (!cashierId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }
        if (orderIds.length === 0) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'pos_transaction_ids must include at least one positive integer',
                { statusCode: 422 }
            ));
        }
        if (!idempotencyKey) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'idempotency_key is required for delivery run membership changes',
                { statusCode: 422 }
            ));
        }

        let transaction = null;
        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_MEMBERSHIP,
                idempotencyKey,
                requestHash
            });
            if (replay) return ok(replay);

            const sequelize = getSequelize();
            transaction = await sequelize.transaction();
            const transactionReplay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_MEMBERSHIP,
                idempotencyKey,
                requestHash,
                transaction
            });
            if (transactionReplay) {
                await transaction.commit();
                return ok(transactionReplay);
            }

            // Step 1: lock the run.
            const run = await deliveryRunRepository.getRunById(runId, { transaction, lock: true });
            if (!run) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Delivery run was not found.',
                    { statusCode: 404, details: { reason_code: 'DELIVERY_RUN_NOT_FOUND' } }
                );
            }
            // Step 1b: the actor must be authorized for the run's own location -- distinct from,
            // and prior to, the per-order run-location-vs-order-location check in step 4 below,
            // which only validates the *order's* data, never the actor.
            if (run.location_id != null) {
                await resolveLocationScope({
                    requestedLocationId: run.location_id,
                    userId: cashierId,
                    operationLabel: 'Delivery run membership add',
                    transaction
                });
            }

            // Step 2: at-least-one-accountable is enforced before a member job is added
            // (ADR 0034, 2026-08-31 amendment).
            const personnelRows = await deliveryRunRepository.listRunPersonnel(runId, { transaction, lock: true });
            const accountableRow = findAccountablePersonnelRow(personnelRows);
            if (!accountableRow) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'The delivery run needs an accountable person before members can be added.',
                    { statusCode: 409, details: { reason_code: 'DELIVERY_RUN_ACCOUNTABLE_REQUIRED' } }
                );
            }

            // Step 3.
            if (RUN_MUTATION_BLOCKED_STATUSES.includes(run.status)) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This delivery run no longer accepts new members.',
                    { statusCode: 409, details: { reason_code: 'DELIVERY_RUN_LOCKED', status: run.status } }
                );
            }

            const runLocationId = parsePositiveInt(run.location_id);

            // Step 4: validate the whole batch, all-or-nothing, before any write.
            const validatedEntries = [];
            for (const orderId of orderIds) {
                const order = await posRepository.getOrderByIdForLifecycle(orderId, { transaction, lock: true });
                if (!order || order.order_source !== ONLINE_ORDER_SOURCE || order.order_method !== 'delivery') {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        `Order ${orderId} is not an online delivery order.`,
                        { statusCode: 409, details: { reason_code: 'DELIVERY_ORDER_REQUIRED', pos_transaction_id: orderId } }
                    );
                }
                const deliveryJob = order.deliveryJob;
                if (!deliveryJob) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        `Order ${orderId} does not have a delivery job.`,
                        { statusCode: 409, details: { reason_code: 'DELIVERY_JOB_REQUIRED', pos_transaction_id: orderId } }
                    );
                }
                if (String(deliveryJob.provider || '').trim().toLowerCase() !== 'manual') {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        `Order ${orderId}'s delivery job is not a manual delivery job.`,
                        { statusCode: 409, details: { reason_code: 'MANUAL_DELIVERY_JOB_REQUIRED', pos_transaction_id: orderId } }
                    );
                }
                const currentJobStatus = String(deliveryJob.status || '').trim().toLowerCase();
                const existingRunId = parsePositiveInt(deliveryJob.delivery_run_id);
                const alreadyInThisRun = existingRunId === runId;
                if (!alreadyInThisRun && currentJobStatus !== 'pending_dispatch') {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        `Order ${orderId}'s delivery job is no longer pending dispatch.`,
                        {
                            statusCode: 409,
                            details: { reason_code: 'DELIVERY_JOB_ASSIGNMENT_LOCKED', pos_transaction_id: orderId, current_status: currentJobStatus }
                        }
                    );
                }
                if (existingRunId && existingRunId !== runId) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        `Order ${orderId} already belongs to a different delivery run.`,
                        {
                            statusCode: 409,
                            details: { reason_code: 'DELIVERY_JOB_ALREADY_IN_RUN', pos_transaction_id: orderId, delivery_run_id: existingRunId }
                        }
                    );
                }
                // Deliberately not checked: order.fulfillment_status. Membership is keyed on
                // delivery_jobs only (ADR 0034, 2026-08-31 amendment) -- an order still `preparing`
                // (never reaching `packed`) is exactly as eligible as one that is.
                const orderLocationId = parsePositiveInt(order.location_id);
                if (!runLocationId || orderLocationId !== runLocationId) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        `Order ${orderId}'s location does not match the delivery run's location.`,
                        { statusCode: 409, details: { reason_code: 'DELIVERY_RUN_LOCATION_MISMATCH', pos_transaction_id: orderId } }
                    );
                }

                validatedEntries.push({ orderId, deliveryJob, orderLocationId, alreadyInThisRun });
            }

            // Step 5: open shift once for the whole batch.
            const activeShift = await assertOpenShiftForPosMutation({
                posRepository,
                cashierId,
                locationId: runLocationId,
                transaction,
                lock: true
            });

            const { personnel, hasRegisteredPersonnel, deliveryPersonnelName } = await resolveRunAccountablePersonnel({
                posRepository,
                accountableRow,
                locationId: runLocationId,
                transaction
            });

            // Step 6: membership write.
            const jobIdsToAdd = validatedEntries
                .filter((entry) => !entry.alreadyInThisRun)
                .map((entry) => entry.deliveryJob.delivery_job_id);
            if (jobIdsToAdd.length > 0) {
                await deliveryRunRepository.addJobsToRun(runId, jobIdsToAdd, { transaction });
            }

            // Step 7: write-through, per job.
            const added = [];
            const skipped = [];
            for (const entry of validatedEntries) {
                if (entry.alreadyInThisRun) {
                    skipped.push({
                        pos_transaction_id: entry.orderId,
                        reason_code: 'DELIVERY_JOB_ALREADY_IN_RUN',
                        idempotent_no_op: true
                    });
                    continue;
                }
                const { updatedDeliveryJob } = await applyDeliveryPersonnelAssignment({
                    posRepository,
                    orderId: entry.orderId,
                    deliveryJob: entry.deliveryJob,
                    personnel,
                    hasRegisteredPersonnel,
                    deliveryPersonnelName,
                    cashierId,
                    activeShift,
                    orderLocationId: entry.orderLocationId,
                    advanceJobStatus: false,
                    auditContext,
                    transaction
                });
                added.push({ pos_transaction_id: entry.orderId, delivery_job: toSerializable(updatedDeliveryJob) });
            }

            await posRepository.createAuditLog({
                user_id: cashierId,
                entity_type: 'delivery_run',
                entity_id: runId,
                action: 'UPDATE',
                changes: {
                    event: 'delivery_run_members_added',
                    delivery_run_id: runId,
                    pos_transaction_ids: orderIds,
                    accountable_delivery_personnel_id: hasRegisteredPersonnel ? accountableRow.delivery_personnel_id : null,
                    accountable_delivery_personnel_name: hasRegisteredPersonnel ? null : deliveryPersonnelName
                },
                ip_address: auditContext.ipAddress || null,
                user_agent: auditContext.userAgent || null
            }, { transaction });

            const runDetail = await deliveryRunRepository.getRunDetail(runId, { transaction });
            const responsePayload = {
                run: serializeDeliveryRun(runDetail),
                added,
                skipped,
                idempotency: {
                    key: idempotencyKey,
                    request_fingerprint: requestHash,
                    outcome: 'processed',
                    idempotent_replay: false
                }
            };
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_MEMBERSHIP,
                idempotencyKey,
                requestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload,
                createdBy: cashierId,
                transaction
            });
            await transaction.commit();
            return ok({ ...responsePayload, idempotent_replay: false, replay_outcome: 'processed' });
        } catch (error) {
            if (transaction && !transaction.finished) await transaction.rollback();
            if (error instanceof DomainError && idempotencyKey) {
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_MEMBERSHIP,
                    idempotencyKey,
                    requestHash,
                    replayStatus: OPERATION_REPLAY_STATUS.BLOCKED,
                    responsePayload: serializeReplayFailure(error),
                    createdBy: cashierId
                });
            }
            return fail(mapPosUseCaseError(error, 'Failed to add members to the delivery run'));
        }
    };
};

export const buildRemoveDeliveryRunMemberUseCase = ({
    posRepository,
    deliveryRunRepository,
    resolveLocationScope = resolvePosOperationalLocationScope
}) => {
    return async ({ deliveryRunId, posTransactionId, user = {}, auditContext = {} } = {}) => {
        const runId = parsePositiveInt(deliveryRunId);
        const orderId = parsePositiveInt(posTransactionId);
        const cashierId = parsePositiveInt(user?.user_id);

        if (!runId || !orderId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'deliveryRunId and posTransactionId must be positive integers',
                { statusCode: 400 }
            ));
        }
        if (!cashierId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }

        let transaction = null;
        try {
            const sequelize = getSequelize();
            transaction = await sequelize.transaction();

            const run = await deliveryRunRepository.getRunById(runId, { transaction, lock: true });
            if (!run) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Delivery run was not found.',
                    { statusCode: 404, details: { reason_code: 'DELIVERY_RUN_NOT_FOUND' } }
                );
            }
            if (run.location_id != null) {
                await resolveLocationScope({
                    requestedLocationId: run.location_id,
                    userId: cashierId,
                    operationLabel: 'Delivery run member removal',
                    transaction
                });
            }

            const deliveryJob = await deliveryRunRepository.getDeliveryJobByOrderId(orderId, { transaction, lock: true });
            if (!deliveryJob || parsePositiveInt(deliveryJob.delivery_run_id) !== runId) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'This order is not a member of the delivery run.',
                    { statusCode: 404, details: { reason_code: 'DELIVERY_RUN_MEMBER_NOT_FOUND' } }
                );
            }

            const personnelRows = await deliveryRunRepository.listRunPersonnel(runId, { transaction, lock: true });
            const accountableRow = findAccountablePersonnelRow(personnelRows);

            const jobStatus = String(deliveryJob.status || '').trim().toLowerCase();
            const isRunOwned = jobStatus === 'pending_dispatch'
                && accountableRow
                && personnelIdentityMatches(deliveryJob, accountableRow);

            let assignmentCleared = false;
            let reasonCode = null;
            let updatedDeliveryJob = deliveryJob;

            if (jobStatus !== 'pending_dispatch') {
                reasonCode = 'DELIVERY_JOB_ASSIGNMENT_LOCKED';
            } else if (!isRunOwned) {
                reasonCode = 'DELIVERY_ASSIGNMENT_NOT_RUN_OWNED';
            }

            // Always: delivery_jobs.delivery_run_id = NULL -- that is the removal.
            updatedDeliveryJob = await deliveryRunRepository.removeJobFromRun(deliveryJob.delivery_job_id, { transaction, lock: true });

            if (isRunOwned) {
                updatedDeliveryJob = await deliveryRunRepository.clearDeliveryJobAssignment(deliveryJob.delivery_job_id, { transaction, lock: true });
                assignmentCleared = true;
            }

            await posRepository.createAuditLog({
                user_id: cashierId,
                entity_type: 'delivery_job',
                entity_id: parsePositiveInt(deliveryJob.delivery_job_id) || null,
                action: 'UPDATE',
                changes: {
                    event: 'delivery_run_member_removed',
                    delivery_run_id: runId,
                    pos_transaction_id: orderId,
                    assignment_cleared: assignmentCleared,
                    reason_code: reasonCode
                },
                ip_address: auditContext.ipAddress || null,
                user_agent: auditContext.userAgent || null
            }, { transaction });

            await transaction.commit();

            return ok({
                delivery_job: toSerializable(updatedDeliveryJob),
                assignment_cleared: assignmentCleared,
                reason_code: reasonCode
            });
        } catch (error) {
            if (transaction && !transaction.finished) await transaction.rollback();
            return fail(mapPosUseCaseError(error, 'Failed to remove delivery run member'));
        }
    };
};

export const buildUpdateDeliveryRunMemberLoadingUseCase = ({
    posRepository,
    deliveryRunRepository,
    resolveLocationScope = resolvePosOperationalLocationScope
}) => {
    return async ({ deliveryRunId, posTransactionId, payload = {}, user = {}, auditContext = {} } = {}) => {
        const runId = parsePositiveInt(deliveryRunId);
        const orderId = parsePositiveInt(posTransactionId);
        const cashierId = parsePositiveInt(user?.user_id);
        const loadingState = String(payload?.loading_state || '').trim().toLowerCase();
        const exceptionReason = String(payload?.exception_reason || '').trim() || null;
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const requestHash = hashPayload({
            delivery_run_id: runId,
            pos_transaction_id: orderId,
            loading_state: loadingState,
            exception_reason: exceptionReason
        });

        if (!runId || !orderId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'deliveryRunId and posTransactionId must be positive integers',
                { statusCode: 400 }
            ));
        }
        if (!cashierId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }
        if (!idempotencyKey) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'idempotency_key is required for delivery run loading changes',
                { statusCode: 422 }
            ));
        }
        if (!DELIVERY_RUN_LOADING_STATES.includes(loadingState)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                `loading_state must be one of: ${DELIVERY_RUN_LOADING_STATES.join(', ')}`,
                { statusCode: 422 }
            ));
        }
        if (loadingState === 'exception' && !exceptionReason) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'exception_reason is required when loading_state is exception',
                { statusCode: 422, details: { reason_code: 'DELIVERY_RUN_LOADING_REASON_REQUIRED' } }
            ));
        }

        let transaction = null;
        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_MEMBER_LOADING,
                idempotencyKey,
                requestHash
            });
            if (replay) return ok(replay);

            const sequelize = getSequelize();
            transaction = await sequelize.transaction();
            const transactionReplay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_MEMBER_LOADING,
                idempotencyKey,
                requestHash,
                transaction
            });
            if (transactionReplay) {
                await transaction.commit();
                return ok(transactionReplay);
            }

            const run = await deliveryRunRepository.getRunById(runId, { transaction, lock: true });
            if (!run) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Delivery run was not found.',
                    { statusCode: 404, details: { reason_code: 'DELIVERY_RUN_NOT_FOUND' } }
                );
            }
            if (run.location_id != null) {
                await resolveLocationScope({
                    requestedLocationId: run.location_id,
                    userId: cashierId,
                    operationLabel: 'Delivery run member loading update',
                    transaction
                });
            }
            if (RUN_DISPATCH_BLOCKED_STATUSES.includes(run.status)) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This delivery run can no longer be updated.',
                    { statusCode: 409, details: { reason_code: 'DELIVERY_RUN_LOCKED', status: run.status } }
                );
            }

            const deliveryJob = await deliveryRunRepository.getDeliveryJobByOrderId(orderId, { transaction, lock: true });
            if (!deliveryJob || parsePositiveInt(deliveryJob.delivery_run_id) !== runId) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'This order is not a member of the delivery run.',
                    { statusCode: 404, details: { reason_code: 'DELIVERY_RUN_MEMBER_NOT_FOUND' } }
                );
            }

            const updatedDeliveryJob = await deliveryRunRepository.updateDeliveryJobLoading(
                deliveryJob.delivery_job_id,
                {
                    loading_state: loadingState,
                    loading_exception_reason: loadingState === 'exception' ? exceptionReason : null,
                    loading_marked_by: cashierId,
                    loading_marked_at: new Date()
                },
                { transaction, lock: true }
            );
            const runDetail = await deliveryRunRepository.getRunDetail(runId, { transaction });
            const updatedMember = Array.isArray(runDetail?.deliveryJobs)
                ? runDetail.deliveryJobs.find((job) => Number(job.pos_transaction_id) === orderId)
                : null;
            const responseMember = serializeDeliveryRunMember(updatedMember || { ...updatedDeliveryJob, transaction: deliveryJob.transaction });

            await posRepository.createAuditLog({
                user_id: cashierId,
                entity_type: 'delivery_job',
                entity_id: parsePositiveInt(deliveryJob.delivery_job_id),
                action: 'UPDATE',
                changes: {
                    event: 'delivery_run_member_loading_marked',
                    pos_transaction_id: orderId,
                    previous_state: deliveryJob.loading_state || 'pending',
                    current_state: loadingState,
                    has_exception_reason: Boolean(loadingState === 'exception' && exceptionReason)
                },
                ip_address: auditContext.ipAddress || null,
                user_agent: auditContext.userAgent || null
            }, { transaction });

            const responsePayload = {
                ...responseMember,
                idempotency: {
                    key: idempotencyKey,
                    request_fingerprint: requestHash,
                    outcome: 'processed',
                    idempotent_replay: false
                }
            };
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_MEMBER_LOADING,
                idempotencyKey,
                requestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload,
                createdBy: cashierId,
                transaction
            });
            await transaction.commit();
            return ok({ ...responsePayload, idempotent_replay: false, replay_outcome: 'processed' });
        } catch (error) {
            if (transaction && !transaction.finished) await transaction.rollback();
            if (error instanceof DomainError && idempotencyKey) {
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_MEMBER_LOADING,
                    idempotencyKey,
                    requestHash,
                    replayStatus: OPERATION_REPLAY_STATUS.BLOCKED,
                    responsePayload: serializeReplayFailure(error),
                    createdBy: cashierId
                });
            }
            return fail(mapPosUseCaseError(error, 'Failed to update delivery run member loading'));
        }
    };
};

export const buildConfirmDeliveryRunLoadingUseCase = ({
    posRepository,
    deliveryRunRepository,
    resolveLocationScope = resolvePosOperationalLocationScope
}) => {
    return async ({ deliveryRunId, payload = {}, user = {}, auditContext = {} } = {}) => {
        const runId = parsePositiveInt(deliveryRunId);
        const cashierId = parsePositiveInt(user?.user_id);
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const requestHash = hashPayload({ delivery_run_id: runId });

        if (!runId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'deliveryRunId must be a positive integer',
                { statusCode: 400 }
            ));
        }
        if (!cashierId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }
        if (!idempotencyKey) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'idempotency_key is required for delivery run loading confirmation',
                { statusCode: 422 }
            ));
        }

        let transaction = null;
        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_LOADING_CONFIRM,
                idempotencyKey,
                requestHash
            });
            if (replay) return ok(replay);

            const sequelize = getSequelize();
            transaction = await sequelize.transaction();
            const transactionReplay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_LOADING_CONFIRM,
                idempotencyKey,
                requestHash,
                transaction
            });
            if (transactionReplay) {
                await transaction.commit();
                return ok(transactionReplay);
            }

            const run = await deliveryRunRepository.getRunById(runId, { transaction, lock: true });
            if (!run) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Delivery run was not found.',
                    { statusCode: 404, details: { reason_code: 'DELIVERY_RUN_NOT_FOUND' } }
                );
            }
            if (run.location_id != null) {
                await resolveLocationScope({
                    requestedLocationId: run.location_id,
                    userId: cashierId,
                    operationLabel: 'Delivery run loading confirmation',
                    transaction
                });
            }
            if (RUN_DISPATCH_BLOCKED_STATUSES.includes(run.status)) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This delivery run can no longer be confirmed.',
                    { statusCode: 409, details: { reason_code: 'DELIVERY_RUN_LOCKED', status: run.status } }
                );
            }

            const runDetail = await deliveryRunRepository.getRunDetail(runId, { transaction });
            const memberJobs = Array.isArray(runDetail?.deliveryJobs) ? runDetail.deliveryJobs : [];
            if (memberJobs.length === 0) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'The delivery run has no members to confirm.',
                    { statusCode: 409, details: { reason_code: 'DELIVERY_RUN_EMPTY' } }
                );
            }

            const loadingSummary = buildDeliveryRunLoadingSummary(memberJobs);
            const confirmedAt = new Date();
            await deliveryRunRepository.updateRun(runId, {
                loading_confirmed_by: cashierId,
                loading_confirmed_at: confirmedAt,
                updated_by: cashierId
            }, { transaction });

            await posRepository.createAuditLog({
                user_id: cashierId,
                entity_type: 'delivery_run',
                entity_id: runId,
                action: 'UPDATE',
                changes: {
                    event: 'delivery_run_loading_confirmed',
                    loading_summary: loadingSummary
                },
                ip_address: auditContext.ipAddress || null,
                user_agent: auditContext.userAgent || null
            }, { transaction });

            const refreshedRunDetail = await deliveryRunRepository.getRunDetail(runId, { transaction });
            const responsePayload = {
                ...serializeDeliveryRun(refreshedRunDetail),
                loading_summary: loadingSummary,
                idempotency: {
                    key: idempotencyKey,
                    request_fingerprint: requestHash,
                    outcome: 'processed',
                    idempotent_replay: false
                }
            };
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_LOADING_CONFIRM,
                idempotencyKey,
                requestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload,
                createdBy: cashierId,
                transaction
            });
            await transaction.commit();
            return ok({ ...responsePayload, idempotent_replay: false, replay_outcome: 'processed' });
        } catch (error) {
            if (transaction && !transaction.finished) await transaction.rollback();
            if (error instanceof DomainError && idempotencyKey) {
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_LOADING_CONFIRM,
                    idempotencyKey,
                    requestHash,
                    replayStatus: OPERATION_REPLAY_STATUS.BLOCKED,
                    responsePayload: serializeReplayFailure(error),
                    createdBy: cashierId
                });
            }
            return fail(mapPosUseCaseError(error, 'Failed to confirm delivery run loading'));
        }
    };
};

// Phase 228 (#1273/#1271): best-effort delivery run dispatch. One outer transaction; every member
// job is classified read-only against the guard chain below before any write happens for it, and
// only the whole call's genuine infra failures roll back the transaction -- a per-order
// classification failure is recorded in `failed` and the loop moves on (see PHASE-228 spec item 3;
// no per-order SAVEPOINT, matching this codebase's existing pattern).
//
// Idempotency is two-layered (D-4): (1) the durable POS_OPERATION_KEYS.DELIVERY_RUN_DISPATCH replay,
// hashed on { delivery_run_id } only -- NOT the member list, so a legitimate retry with a different
// member set (a stuck member removed in between) still replays correctly; (2) inside the fan-out, a
// member already `out_for_delivery` is detected before the transition validator and pushed to
// `skipped` with `idempotent_no_op: true` regardless of idempotency key -- this is what actually
// makes re-running the endpoint a no-op.
export const buildDispatchDeliveryRunUseCase = ({
    posRepository,
    deliveryRunRepository,
    resolveLocationScope = resolvePosOperationalLocationScope,
    resolveWorkflowSettings = resolveWorkflowCapabilitySettings,
    activityRecorder = recordDgfyOrderActivity
}) => {
    return async ({ deliveryRunId, payload = {}, user = {}, auditContext = {} } = {}) => {
        const runId = parsePositiveInt(deliveryRunId);
        const cashierId = parsePositiveInt(user?.user_id);
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const requestHash = hashPayload({ delivery_run_id: runId });

        if (!runId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'deliveryRunId must be a positive integer',
                { statusCode: 400 }
            ));
        }
        if (!cashierId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }
        if (!idempotencyKey) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'idempotency_key is required for delivery run dispatch',
                { statusCode: 422 }
            ));
        }

        let transaction = null;
        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_DISPATCH,
                idempotencyKey,
                requestHash
            });
            if (replay) return ok(replay);

            const sequelize = getSequelize();
            transaction = await sequelize.transaction();
            const transactionReplay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_DISPATCH,
                idempotencyKey,
                requestHash,
                transaction
            });
            if (transactionReplay) {
                await transaction.commit();
                return ok(transactionReplay);
            }

            // Precondition 1: run exists.
            const run = await deliveryRunRepository.getRunById(runId, { transaction, lock: true });
            if (!run) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Delivery run was not found.',
                    { statusCode: 404, details: { reason_code: 'DELIVERY_RUN_NOT_FOUND' } }
                );
            }
            // Preserve broad POS behavior while requiring a live run assignment for the
            // narrower delivery_runs:act capability.
            const hasPermissionContext = Array.isArray(user?.permissions)
                || Object.prototype.hasOwnProperty.call(user || {}, 'role')
                || Object.prototype.hasOwnProperty.call(user || {}, 'is_master_admin')
                || user?.staffRole !== undefined;
            const hasBroadPosTransaction = !hasPermissionContext
                || hasEffectivePermission(user, PERMISSIONS.POS.actions.TRANSACT_POS);
            if (!hasBroadPosTransaction) {
                await assertStaffAssignment({ user, resourceType: 'delivery_run', resourceId: runId, transaction });
            }
            if (run.location_id != null) {
                await resolveLocationScope({
                    requestedLocationId: run.location_id,
                    userId: cashierId,
                    operationLabel: 'Delivery run dispatch',
                    transaction
                });
            }

            // Precondition 2: `dispatched` is deliberately absent from this set -- see
            // RUN_DISPATCH_BLOCKED_STATUSES's own comment above.
            if (RUN_DISPATCH_BLOCKED_STATUSES.includes(run.status)) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This delivery run can no longer be dispatched.',
                    { statusCode: 409, details: { reason_code: 'DELIVERY_RUN_LOCKED', status: run.status } }
                );
            }

            // Precondition 3: an accountable person must be set.
            const personnelRows = await deliveryRunRepository.listRunPersonnel(runId, { transaction, lock: true });
            const accountableRow = findAccountablePersonnelRow(personnelRows);
            if (!accountableRow) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'The delivery run needs an accountable person before it can be dispatched.',
                    { statusCode: 409, details: { reason_code: 'DELIVERY_RUN_ACCOUNTABLE_REQUIRED' } }
                );
            }

            // Precondition 4: the run must have members.
            const runDetail = await deliveryRunRepository.getRunDetail(runId, { transaction });
            const memberJobs = Array.isArray(runDetail?.deliveryJobs) ? runDetail.deliveryJobs : [];
            if (memberJobs.length === 0) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'The delivery run has no members to dispatch.',
                    { statusCode: 409, details: { reason_code: 'DELIVERY_RUN_EMPTY' } }
                );
            }

            // Precondition 5 (#1272): the packing gate, retail-only.
            const { mode: workflowMode } = await resolveWorkflowSettings();
            if (normalizeWorkflowMode(workflowMode) === 'retail') {
                const unpacked = memberJobs
                    .map((job) => ({
                        pos_transaction_id: job.pos_transaction_id,
                        fulfillment_status: String(job.transaction?.fulfillment_status || '').trim()
                    }))
                    .filter((entry) => PRE_PACKED_FULFILLMENT_STATUSES.includes(entry.fulfillment_status));
                if (unpacked.length > 0) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'Every member order must be packed before the run can be dispatched.',
                        { statusCode: 409, details: { reason_code: 'DELIVERY_RUN_UNPACKED_MEMBERS', unpacked } }
                    );
                }
            }

            // Precondition 6: one open-shift check for the whole run.
            const runLocationId = parsePositiveInt(run.location_id);
            const activeShift = hasBroadPosTransaction ? await assertOpenShiftForPosMutation({
                posRepository,
                cashierId,
                locationId: runLocationId,
                transaction,
                lock: true
            }) : null;

            // Fan-out: classify every member (read-only) before writing anything for it.
            const dispatched = [];
            const skipped = [];
            const failed = [];

            for (const job of memberJobs) {
                const orderId = job.pos_transaction_id;
                const order = job.transaction || null;

                if (!order || order.order_source !== ONLINE_ORDER_SOURCE || order.order_method !== 'delivery') {
                    failed.push({
                        pos_transaction_id: orderId,
                        reason_code: 'DELIVERY_ORDER_REQUIRED',
                        message: `Order ${orderId} is not an online delivery order.`,
                        details: {}
                    });
                    continue;
                }
                const orderLocationId = parsePositiveInt(order.location_id);
                if (!runLocationId || orderLocationId !== runLocationId) {
                    failed.push({
                        pos_transaction_id: orderId,
                        reason_code: 'DELIVERY_RUN_LOCATION_MISMATCH',
                        message: `Order ${orderId}'s location does not match the delivery run's location.`,
                        details: {}
                    });
                    continue;
                }
                if (!job.delivery_job_id) {
                    failed.push({
                        pos_transaction_id: orderId,
                        reason_code: 'DELIVERY_JOB_REQUIRED',
                        message: `Order ${orderId} does not have a delivery job.`,
                        details: {}
                    });
                    continue;
                }
                if (String(job.provider || '').trim().toLowerCase() !== 'manual') {
                    failed.push({
                        pos_transaction_id: orderId,
                        reason_code: 'MANUAL_DELIVERY_JOB_REQUIRED',
                        message: `Order ${orderId}'s delivery job is not a manual delivery job.`,
                        details: {}
                    });
                    continue;
                }

                const currentStatus = normalizeOnlineFulfillmentStatus(order.fulfillment_status);
                const jobStatus = String(job.status || '').trim().toLowerCase();

                if (currentStatus === 'out_for_delivery') {
                    // D-4 layer 2: already dispatched, this call or a prior one -- idempotent no-op.
                    // Still finish advancing the job to `assigned` if it was somehow left behind at
                    // `pending_dispatch` with a complete assignment.
                    skipped.push({
                        pos_transaction_id: orderId,
                        reason_code: 'ALREADY_DISPATCHED',
                        idempotent_no_op: true
                    });
                    if (jobStatus === 'pending_dispatch' && isDeliveryAssignmentComplete(job)) {
                        await posRepository.updateDeliveryJobByOrderId(orderId, { status: 'assigned' }, {
                            transaction,
                            lock: true
                        });
                    }
                    continue;
                }

                if (!isDeliveryAssignmentComplete(job)) {
                    failed.push({
                        pos_transaction_id: orderId,
                        reason_code: 'DELIVERY_ASSIGNMENT_REQUIRED',
                        message: `Order ${orderId}'s delivery job does not have a completed personnel assignment.`,
                        details: {}
                    });
                    continue;
                }
                if (jobStatus !== 'pending_dispatch') {
                    failed.push({
                        pos_transaction_id: orderId,
                        reason_code: 'DELIVERY_JOB_ASSIGNMENT_LOCKED',
                        message: `Order ${orderId}'s delivery job is no longer pending dispatch.`,
                        details: { current_status: jobStatus }
                    });
                    continue;
                }

                try {
                    validateOnlineOrderTransition({
                        currentStatus,
                        nextStatus: 'out_for_delivery',
                        orderMethod: order.order_method
                    });
                } catch (transitionError) {
                    const lifecycleDetails = transitionError?.details?.order_lifecycle || {};
                    failed.push({
                        pos_transaction_id: orderId,
                        reason_code: lifecycleDetails.reason_code || 'ORDER_STATUS_TRANSITION_INVALID',
                        message: transitionError.message,
                        details: lifecycleDetails
                    });
                    continue;
                }

                const updatePayload = {
                    fulfillment_status: 'out_for_delivery',
                    ...buildOnlineOrderShiftAttributionPayload({ order, activeShift })
                };

                // RF-1 fix (PR #1280 review): the two writes below are wrapped in their own
                // per-member savepoint (a nested transaction inside the outer one) rather than
                // running bare against `transaction`. Without this, a write failure for member N
                // (a transient DB error, a lock timeout -- not just a validation rejection, which
                // is already caught above) would propagate to the outer catch and roll back every
                // member already dispatched earlier in this same loop, defeating the best-effort
                // contract for everyone rather than just the one problem order. On any error here,
                // only this member's savepoint rolls back -- neither its order nor its job is
                // changed -- and the loop continues with the remaining members.
                let updatedOrder;
                try {
                    const sequelize = getSequelize();
                    await sequelize.transaction({ transaction }, async (memberSavepoint) => {
                        updatedOrder = await posRepository.updateOrderById(orderId, updatePayload, {
                            transaction: memberSavepoint,
                            lock: true
                        });
                        await posRepository.updateDeliveryJobByOrderId(orderId, { status: 'assigned' }, {
                            transaction: memberSavepoint,
                            lock: true
                        });
                    });
                } catch (writeError) {
                    failed.push({
                        pos_transaction_id: orderId,
                        reason_code: 'DISPATCH_WRITE_FAILED',
                        message: `Order ${orderId} could not be dispatched due to a write failure.`,
                        details: { error_message: writeError?.message || String(writeError) }
                    });
                    continue;
                }

                dispatched.push({ pos_transaction_id: orderId, order: toSerializable(updatedOrder) });
            }

            // D-3: the run flips to `dispatched` if at least one member ends the call
            // `out_for_delivery` (newly transitioned or already there) -- never "all". Zero
            // successes leaves run status untouched; this endpoint never 409s at the run level for
            // that -- the per-order `failed` report IS the result.
            const previousRunStatus = run.status;
            const successCount = dispatched.length + skipped.length;
            let currentRunStatus = previousRunStatus;
            if (successCount > 0 && previousRunStatus !== 'dispatched') {
                await deliveryRunRepository.updateRun(runId, {
                    status: 'dispatched',
                    updated_by: cashierId
                }, { transaction });
                currentRunStatus = 'dispatched';
            }

            const dispatchedIds = new Set(dispatched.map((entry) => entry.pos_transaction_id));
            const dispatchedJobs = memberJobs.filter((job) => dispatchedIds.has(job.pos_transaction_id));
            const loadingWarning = {
                unloaded_pos_transaction_ids: dispatchedJobs
                    .filter((job) => ['pending', 'not_loaded'].includes(String(job.loading_state || 'pending').trim().toLowerCase()))
                    .map((job) => job.pos_transaction_id),
                exception_pos_transaction_ids: dispatchedJobs
                    .filter((job) => String(job.loading_state || 'pending').trim().toLowerCase() === 'exception')
                    .map((job) => job.pos_transaction_id)
            };

            // Phase 338 (#1927): additive per-member warning collection. The legacy
            // `loading_warning` above only covers members dispatched by this exact call and
            // collapses `pending`/`not_loaded` into one bucket, so neither the POS UI nor the
            // mobile dispatcher (dgfy-mobile#177) can render which outstanding members need
            // attention without re-fetching the run. `warnings` names every run member whose
            // dispatch-time loading state is still non-terminal (`pending`, `not_loaded`, or
            // `exception`) -- deliberately the whole dispatch-time member snapshot, not just
            // this call's newly transitioned members, per #1927's "every member left in a
            // non-terminal loading state" wording. This is a superset of ADR 0034's
            // warn-only clause (dispatched orders in those categories are always included),
            // so no ADR change is needed. Warn-only: building this array never blocks or
            // reclassifies `dispatched`/`skipped`/`failed`, and it is persisted as part of
            // the replay payload below so same-key replays return the identical array.
            const warnings = memberJobs
                .map((job) => {
                    const loadingState = String(job.loading_state || 'pending').trim().toLowerCase() || 'pending';
                    const entry = {
                        pos_transaction_id: job.pos_transaction_id,
                        loading_state: loadingState
                    };
                    if (loadingState === 'exception') {
                        entry.exception_reason = job.loading_exception_reason ?? null;
                    }
                    return { entry, unresolved: loadingState !== 'loaded' };
                })
                .filter(({ unresolved }) => unresolved)
                .map(({ entry }) => entry)
                .sort((left, right) => left.pos_transaction_id - right.pos_transaction_id);

            await posRepository.createAuditLog({
                user_id: cashierId,
                entity_type: 'delivery_run',
                entity_id: runId,
                action: 'UPDATE',
                changes: {
                    event: 'delivery_run_dispatched',
                    delivery_run_id: runId,
                    dispatched_pos_transaction_ids: dispatched.map((entry) => entry.pos_transaction_id),
                    skipped_pos_transaction_ids: skipped.map((entry) => entry.pos_transaction_id),
                    failed_pos_transaction_ids: failed.map((entry) => entry.pos_transaction_id),
                    loading_warning_unloaded_count: loadingWarning.unloaded_pos_transaction_ids.length,
                    loading_warning_exception_count: loadingWarning.exception_pos_transaction_ids.length,
                    warnings_count: warnings.length,
                    previous_status: previousRunStatus,
                    current_status: currentRunStatus
                },
                ip_address: auditContext.ipAddress || null,
                user_agent: auditContext.userAgent || null
            }, { transaction });

            for (const entry of dispatched) {
                await posRepository.createAuditLog({
                    user_id: cashierId,
                    entity_type: 'delivery_job',
                    entity_id: null,
                    action: 'UPDATE',
                    changes: {
                        event: 'delivery_run_member_dispatched',
                        delivery_run_id: runId,
                        pos_transaction_id: entry.pos_transaction_id
                    },
                    ip_address: auditContext.ipAddress || null,
                    user_agent: auditContext.userAgent || null
                }, { transaction });
            }

            const refreshedRunDetail = await deliveryRunRepository.getRunDetail(runId, { transaction });
            const responsePayload = {
                run: serializeDeliveryRun(refreshedRunDetail),
                dispatched,
                skipped,
                failed,
                loading_warning: loadingWarning,
                warnings,
                run_status: {
                    previous: previousRunStatus,
                    current: currentRunStatus,
                    advanced: currentRunStatus !== previousRunStatus
                },
                idempotency: {
                    key: idempotencyKey,
                    request_fingerprint: requestHash,
                    outcome: 'processed',
                    idempotent_replay: false
                }
            };
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_DISPATCH,
                idempotencyKey,
                requestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload,
                createdBy: cashierId,
                transaction
            });
            await transaction.commit();

            // Post-commit, best-effort: never fail the already-committed dispatch.
            const currentTenantId = dbStore.getStore()?.tenantId || null;
            for (const entry of dispatched) {
                await activityRecorder({
                    tenantId: currentTenantId,
                    order: entry.order,
                    storeCustomer: entry.order?.storeCustomer || entry.order?.store_customer || null
                }).catch((activityError) => {
                    logger.warn('Failed to sync DGFY order activity after delivery run dispatch', {
                        delivery_run_id: runId,
                        pos_transaction_id: entry.pos_transaction_id,
                        error: activityError?.message || activityError
                    });
                });
            }

            return ok({ ...responsePayload, idempotent_replay: false, replay_outcome: 'processed' });
        } catch (error) {
            if (transaction && !transaction.finished) await transaction.rollback();
            if (error instanceof DomainError && idempotencyKey) {
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_DISPATCH,
                    idempotencyKey,
                    requestHash,
                    replayStatus: OPERATION_REPLAY_STATUS.BLOCKED,
                    responsePayload: serializeReplayFailure(error),
                    createdBy: cashierId
                });
            }
            return fail(mapPosUseCaseError(error, 'Failed to dispatch delivery run'));
        }
    };
};

// Phase 334 (#1887): one atomic remittance action records the run-level hand-back, every
// order-level amount, and any shortage/overage entries. The payment tables remain read-only here;
// cash custody is derived solely from the cash tender captured at delivery handover.
export const buildCreateDeliveryRunRemittanceUseCase = ({
    posRepository,
    deliveryRunRepository,
    resolveLocationScope = resolvePosOperationalLocationScope
}) => {
    return async ({ deliveryRunId, payload = {}, user = {}, auditContext = {} } = {}) => {
        const runId = parsePositiveInt(deliveryRunId);
        const cashierId = parsePositiveInt(user?.user_id);
        const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
        const requestAllocations = Array.isArray(payload?.allocations) ? payload.allocations : [];
        const normalizedAllocations = requestAllocations
            .map((allocation) => ({
                pos_transaction_id: parsePositiveInt(allocation?.pos_transaction_id),
                remitted_amount: round4(allocation?.remitted_amount)
            }))
            .sort((left, right) => left.pos_transaction_id - right.pos_transaction_id);
        const requestHash = hashPayload({
            delivery_run_id: runId,
            location_id: payload?.location_id ?? null,
            allocations: normalizedAllocations,
            variance_reason: String(payload?.variance_reason || '').trim()
        });

        if (!runId) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'deliveryRunId must be a positive integer',
                { statusCode: 400 }
            ));
        }
        if (!cashierId) {
            return fail(new DomainError(
                DomainErrorCode.AUTHENTICATION_FAILED,
                'Authenticated POS user is required',
                { statusCode: 401 }
            ));
        }
        if (!idempotencyKey) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'idempotency_key is required for delivery run remittance',
                { statusCode: 422 }
            ));
        }
        if (normalizedAllocations.length === 0 || normalizedAllocations.some((allocation) => !allocation.pos_transaction_id)) {
            return fail(new DomainError(
                DomainErrorCode.VALIDATION_FAILED,
                'At least one valid remittance allocation is required',
                { statusCode: 422 }
            ));
        }

        let transaction = null;
        try {
            const replay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_REMITTANCE_CONFIRM,
                idempotencyKey,
                requestHash
            });
            if (replay) return ok(replay);

            transaction = await getSequelize().transaction();
            const transactionReplay = await findOperationReplayEntry({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_REMITTANCE_CONFIRM,
                idempotencyKey,
                requestHash,
                transaction
            });
            if (transactionReplay) {
                await transaction.commit();
                return ok(transactionReplay);
            }

            const run = await deliveryRunRepository.getRunById(runId, { transaction, lock: true });
            if (!run) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Delivery run was not found.',
                    { statusCode: 404, details: { reason_code: 'DELIVERY_RUN_NOT_FOUND' } }
                );
            }
            if (run.status === 'cancelled') {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'A cancelled delivery run cannot be remitted.',
                    { statusCode: 409, details: { reason_code: 'DELIVERY_RUN_CANCELLED' } }
                );
            }

            const runLocationId = parsePositiveInt(run.location_id);
            const requestedLocationId = payload?.location_id == null
                ? runLocationId
                : parsePositiveInt(payload.location_id);
            const locationScope = await resolveLocationScope({
                requestedLocationId,
                userId: cashierId,
                operationLabel: 'Delivery run remittance',
                transaction
            });
            const locationId = parsePositiveInt(locationScope?.location_id);
            if (!locationId) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'A receiving location is required for delivery run remittance.',
                    { statusCode: 422, details: { reason_code: 'DELIVERY_RUN_REMITTANCE_LOCATION_REQUIRED' } }
                );
            }
            if (runLocationId && locationId !== runLocationId) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'Remittance location must match the delivery run location.',
                    { statusCode: 422, details: { reason_code: 'DELIVERY_RUN_REMITTANCE_LOCATION_MISMATCH' } }
                );
            }

            const existingRemittance = await deliveryRunRepository.getRemittanceByRunId(runId, { transaction, lock: true });
            if (existingRemittance) {
                throw new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This delivery run already has a remittance.',
                    { statusCode: 409, details: { reason_code: 'DELIVERY_RUN_REMITTANCE_ALREADY_EXISTS' } }
                );
            }

            const members = await deliveryRunRepository.getRunRemittanceMembers(
                runId,
                normalizedAllocations.map((allocation) => allocation.pos_transaction_id),
                { transaction, lock: true }
            );
            const memberByTransactionId = new Map(
                members.map((member) => [Number(member.pos_transaction_id), member])
            );
            const varianceReason = String(payload?.variance_reason || '').trim();
            let totalExpectedAmount = 0;
            let totalRemittedAmount = 0;
            let totalVarianceAmount = 0;
            const allocations = [];
            const variances = [];

            for (const requestedAllocation of normalizedAllocations) {
                const member = memberByTransactionId.get(requestedAllocation.pos_transaction_id);
                if (!member) {
                    throw new DomainError(
                        DomainErrorCode.RESOURCE_NOT_FOUND,
                        'A requested order is not a member of this delivery run.',
                        {
                            statusCode: 404,
                            details: {
                                reason_code: 'DELIVERY_RUN_REMITTANCE_MEMBER_NOT_FOUND',
                                pos_transaction_id: requestedAllocation.pos_transaction_id
                            }
                        }
                    );
                }
                if (String(member.status || '').trim().toLowerCase() !== 'delivered') {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'Only delivered run members can be included in a remittance.',
                        {
                            statusCode: 409,
                            details: {
                                reason_code: 'DELIVERY_RUN_REMITTANCE_MEMBER_NOT_DELIVERED',
                                pos_transaction_id: requestedAllocation.pos_transaction_id
                            }
                        }
                    );
                }
                if (String(member.provider || '').trim().toLowerCase() !== 'manual') {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'Provider-owned delivery jobs are not eligible for remittance.',
                        {
                            statusCode: 409,
                            details: {
                                reason_code: 'DELIVERY_RUN_REMITTANCE_PROVIDER_UNSUPPORTED',
                                pos_transaction_id: requestedAllocation.pos_transaction_id
                            }
                        }
                    );
                }

                const order = member.transaction || {};
                if (order.cash_received == null) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'This order has no cash collected at handover.',
                        {
                            statusCode: 409,
                            details: {
                                reason_code: 'DELIVERY_RUN_REMITTANCE_NOTHING_TO_COLLECT',
                                pos_transaction_id: requestedAllocation.pos_transaction_id
                            }
                        }
                    );
                }
                const expectedAmount = round4(Number(order.cash_received) - Number(order.change_amount || 0));
                const remittedAmount = round4(requestedAllocation.remitted_amount);
                const varianceAmount = round4(remittedAmount - expectedAmount);
                if (expectedAmount < 0 || remittedAmount < 0) {
                    throw new DomainError(
                        DomainErrorCode.CONFLICT,
                        'Remittance amounts must not be negative.',
                        {
                            statusCode: 409,
                            details: {
                                reason_code: 'DELIVERY_RUN_REMITTANCE_AMOUNT_INVALID',
                                pos_transaction_id: requestedAllocation.pos_transaction_id
                            }
                        }
                    );
                }

                totalExpectedAmount = round4(totalExpectedAmount + expectedAmount);
                totalRemittedAmount = round4(totalRemittedAmount + remittedAmount);
                totalVarianceAmount = round4(totalVarianceAmount + varianceAmount);
                allocations.push({
                    pos_transaction_id: requestedAllocation.pos_transaction_id,
                    delivery_personnel_id: member.delivery_personnel_id ?? null,
                    delivery_personnel_name: member.delivery_personnel_name ?? null,
                    expected_amount: expectedAmount,
                    remitted_amount: remittedAmount,
                    variance_amount: varianceAmount
                });
                if (varianceAmount !== 0) {
                    variances.push({
                        pos_transaction_id: requestedAllocation.pos_transaction_id,
                        direction: varianceAmount < 0 ? 'shortage' : 'overage',
                        amount: Math.abs(varianceAmount),
                        reason: varianceReason,
                        recorded_by: cashierId,
                        recorded_at: new Date()
                    });
                }
            }

            if (variances.length > 0 && !varianceReason) {
                throw new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'variance_reason is required when a remittance has a shortage or overage.',
                    { statusCode: 422, details: { reason_code: 'DELIVERY_RUN_VARIANCE_REASON_REQUIRED' } }
                );
            }

            const remittance = await deliveryRunRepository.createRemittance({
                deliveryRunId: runId,
                locationId,
                confirmedBy: cashierId,
                confirmedAt: new Date(),
                totalExpectedAmount,
                totalRemittedAmount,
                totalVarianceAmount,
                allocations,
                variances
            }, { transaction });
            await posRepository.createAuditLog({
                user_id: cashierId,
                entity_type: 'delivery_run_remittance',
                entity_id: remittance.delivery_run_remittance_id,
                action: 'CREATE',
                changes: {
                    event: 'delivery_run_remittance_confirmed',
                    delivery_run_id: runId,
                    allocation_count: allocations.length,
                    total_expected_amount: totalExpectedAmount,
                    total_remitted_amount: totalRemittedAmount,
                    total_variance_amount: totalVarianceAmount
                },
                ip_address: auditContext.ipAddress || null,
                user_agent: auditContext.userAgent || null
            }, { transaction });

            const responsePayload = {
                remittance: serializeDeliveryRunRemittance(remittance),
                idempotency: {
                    key: idempotencyKey,
                    request_fingerprint: requestHash,
                    outcome: 'processed',
                    idempotent_replay: false
                }
            };
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_REMITTANCE_CONFIRM,
                idempotencyKey,
                requestHash,
                replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
                responsePayload,
                createdBy: cashierId,
                transaction
            });
            await transaction.commit();
            return ok({ ...responsePayload, idempotent_replay: false, replay_outcome: 'processed' });
        } catch (error) {
            if (transaction && !transaction.finished) await transaction.rollback();
            const failure = isDuplicateConstraintError(error)
                ? new DomainError(
                    DomainErrorCode.CONFLICT,
                    'This delivery run already has a remittance.',
                    { statusCode: 409, details: { reason_code: 'DELIVERY_RUN_REMITTANCE_ALREADY_EXISTS' } }
                )
                : error;
            if (failure instanceof DomainError && idempotencyKey) {
                await persistOperationReplay({
                    posRepository,
                    operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_REMITTANCE_CONFIRM,
                    idempotencyKey,
                    requestHash,
                    replayStatus: OPERATION_REPLAY_STATUS.BLOCKED,
                    responsePayload: serializeReplayFailure(failure),
                    createdBy: cashierId
                });
            }
            return fail(mapPosUseCaseError(failure, 'Failed to confirm delivery run remittance'));
        }
    };
};

const resolveDeliveryRunForRemittanceRead = async ({
    deliveryRunRepository,
    resolveLocationScope,
    deliveryRunId,
    userId,
    operationLabel
}) => {
    const run = await deliveryRunRepository.getRunById(deliveryRunId);
    if (!run) {
        throw new DomainError(
            DomainErrorCode.RESOURCE_NOT_FOUND,
            'Delivery run was not found.',
            { statusCode: 404, details: { reason_code: 'DELIVERY_RUN_NOT_FOUND' } }
        );
    }
    await resolveLocationScope({
        requestedLocationId: run.location_id,
        userId,
        operationLabel
    });
    return run;
};

export const buildListDeliveryRunRemittancesUseCase = ({
    deliveryRunRepository,
    resolveLocationScope = resolvePosOperationalLocationScope
}) => async ({ deliveryRunId, user = {} } = {}) => {
    const runId = parsePositiveInt(deliveryRunId);
    const cashierId = parsePositiveInt(user?.user_id);
    if (!runId) return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'deliveryRunId must be a positive integer', { statusCode: 400 }));
    if (!cashierId) return fail(new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Authenticated POS user is required', { statusCode: 401 }));
    try {
        await resolveDeliveryRunForRemittanceRead({
            deliveryRunRepository,
            resolveLocationScope,
            deliveryRunId: runId,
            userId: cashierId,
            operationLabel: 'Delivery run remittance list'
        });
        const remittances = await deliveryRunRepository.listRemittancesForRun(runId);
        return ok({ items: remittances.map(serializeDeliveryRunRemittance) });
    } catch (error) {
        return fail(mapPosUseCaseError(error, 'Failed to list delivery run remittances'));
    }
};

export const buildGetDeliveryRunRemittanceUseCase = ({
    deliveryRunRepository,
    resolveLocationScope = resolvePosOperationalLocationScope
}) => async ({ deliveryRunId, remittanceId, user = {} } = {}) => {
    const runId = parsePositiveInt(deliveryRunId);
    const normalizedRemittanceId = parsePositiveInt(remittanceId);
    const cashierId = parsePositiveInt(user?.user_id);
    if (!runId || !normalizedRemittanceId) return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'deliveryRunId and remittanceId must be positive integers', { statusCode: 400 }));
    if (!cashierId) return fail(new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Authenticated POS user is required', { statusCode: 401 }));
    try {
        await resolveDeliveryRunForRemittanceRead({
            deliveryRunRepository,
            resolveLocationScope,
            deliveryRunId: runId,
            userId: cashierId,
            operationLabel: 'Delivery run remittance retrieval'
        });
        const remittance = await deliveryRunRepository.getRemittanceDetail(runId, normalizedRemittanceId);
        if (!remittance) {
            return fail(new DomainError(
                DomainErrorCode.RESOURCE_NOT_FOUND,
                'Delivery run remittance was not found.',
                { statusCode: 404, details: { reason_code: 'DELIVERY_RUN_REMITTANCE_NOT_FOUND' } }
            ));
        }
        return ok(serializeDeliveryRunRemittance(remittance));
    } catch (error) {
        return fail(mapPosUseCaseError(error, 'Failed to retrieve delivery run remittance'));
    }
};

export const buildResolveDeliveryRunRemittanceVarianceUseCase = ({
    posRepository,
    deliveryRunRepository,
    resolveLocationScope = resolvePosOperationalLocationScope
}) => async ({ deliveryRunId, remittanceId, varianceId, payload = {}, user = {}, auditContext = {} } = {}) => {
    const runId = parsePositiveInt(deliveryRunId);
    const normalizedRemittanceId = parsePositiveInt(remittanceId);
    const normalizedVarianceId = parsePositiveInt(varianceId);
    const cashierId = parsePositiveInt(user?.user_id);
    const idempotencyKey = normalizeOptionalIdempotencyKey(payload?.idempotency_key);
    const resolutionReason = String(payload?.resolution_reason || '').trim();
    const requestHash = hashPayload({
        delivery_run_id: runId,
        delivery_run_remittance_id: normalizedRemittanceId,
        delivery_run_remittance_variance_id: normalizedVarianceId,
        resolution_reason: resolutionReason
    });
    if (!runId || !normalizedRemittanceId || !normalizedVarianceId) return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'deliveryRunId, remittanceId, and varianceId must be positive integers', { statusCode: 400 }));
    if (!cashierId) return fail(new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Authenticated POS user is required', { statusCode: 401 }));
    if (!idempotencyKey || !resolutionReason) return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'idempotency_key and resolution_reason are required', { statusCode: 422 }));
    if (!hasEffectivePermission(user, PERMISSIONS.POS.actions.RESOLVE_DELIVERY_RUN_VARIANCE)) {
        return fail(new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'Supervisor or manager authority is required to resolve a delivery run variance.',
            { statusCode: 403, details: { reason_code: 'DELIVERY_RUN_VARIANCE_RESOLUTION_PERMISSION_REQUIRED' } }
        ));
    }

    let transaction = null;
    try {
        const replay = await findOperationReplayEntry({
            posRepository,
            operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_VARIANCE_RESOLVE,
            idempotencyKey,
            requestHash
        });
        if (replay) return ok(replay);

        transaction = await getSequelize().transaction();
        const transactionReplay = await findOperationReplayEntry({
            posRepository,
            operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_VARIANCE_RESOLVE,
            idempotencyKey,
            requestHash,
            transaction
        });
        if (transactionReplay) {
            await transaction.commit();
            return ok(transactionReplay);
        }

        const variance = await deliveryRunRepository.getRemittanceVariance(
            runId,
            normalizedRemittanceId,
            normalizedVarianceId,
            { transaction, lock: true }
        );
        if (!variance) {
            throw new DomainError(
                DomainErrorCode.RESOURCE_NOT_FOUND,
                'Delivery run remittance variance was not found.',
                { statusCode: 404, details: { reason_code: 'DELIVERY_RUN_VARIANCE_NOT_FOUND' } }
            );
        }
        const locationId = variance.allocation?.remittance?.location_id ?? null;
        await resolveLocationScope({
            requestedLocationId: locationId,
            userId: cashierId,
            operationLabel: 'Delivery run variance resolution',
            transaction
        });
        if (Array.isArray(variance.reversals) && variance.reversals.length > 0) {
            throw new DomainError(
                DomainErrorCode.CONFLICT,
                'This delivery run variance has already been resolved.',
                { statusCode: 409, details: { reason_code: 'DELIVERY_RUN_VARIANCE_ALREADY_RESOLVED' } }
            );
        }

        const reversal = await deliveryRunRepository.createVarianceResolution({
            allocationId: variance.delivery_run_remittance_allocation_id,
            reversalOfVarianceId: variance.delivery_run_remittance_variance_id,
            direction: variance.direction,
            amount: variance.amount,
            reason: resolutionReason,
            recordedBy: cashierId,
            recordedAt: new Date()
        }, { transaction });
        await posRepository.createAuditLog({
            user_id: cashierId,
            entity_type: 'delivery_run_remittance_variance',
            entity_id: variance.delivery_run_remittance_variance_id,
            action: 'CREATE',
            changes: {
                event: 'delivery_run_remittance_variance_resolved',
                reversal_variance_id: reversal.delivery_run_remittance_variance_id,
                reason: resolutionReason
            },
            ip_address: auditContext.ipAddress || null,
            user_agent: auditContext.userAgent || null
        }, { transaction });

        const responsePayload = {
            variance: serializeDeliveryRunRemittanceVariance(reversal),
            original_variance: serializeDeliveryRunRemittanceVariance({
                ...variance,
                reversals: [reversal]
            }),
            idempotency: {
                key: idempotencyKey,
                request_fingerprint: requestHash,
                outcome: 'processed',
                idempotent_replay: false
            }
        };
        await persistOperationReplay({
            posRepository,
            operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_VARIANCE_RESOLVE,
            idempotencyKey,
            requestHash,
            replayStatus: OPERATION_REPLAY_STATUS.PROCESSED,
            responsePayload,
            createdBy: cashierId,
            transaction
        });
        await transaction.commit();
        return ok({ ...responsePayload, idempotent_replay: false, replay_outcome: 'processed' });
    } catch (error) {
        if (transaction && !transaction.finished) await transaction.rollback();
        if (error instanceof DomainError && idempotencyKey) {
            await persistOperationReplay({
                posRepository,
                operationKey: POS_OPERATION_KEYS.DELIVERY_RUN_VARIANCE_RESOLVE,
                idempotencyKey,
                requestHash,
                replayStatus: OPERATION_REPLAY_STATUS.BLOCKED,
                responsePayload: serializeReplayFailure(error),
                createdBy: cashierId
            });
        }
        return fail(mapPosUseCaseError(error, 'Failed to resolve delivery run remittance variance'));
    }
};
