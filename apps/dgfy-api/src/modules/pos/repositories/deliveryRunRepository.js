// Phase 225 (#1273/#1081): delivery run + delivery run personnel data access. Module-local
// repository (precedent: posCashierAttendanceRepository.js) rather than an addition to
// posRepository.js, so posRepository.contract.js / assertPosRepositoryContract stay untouched --
// see PHASE-225-PLAN.md section 2 for the full reasoning.
import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (row) => (
    row && typeof row.toJSON === 'function'
        ? row.toJSON()
        : row
);

const toPositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const txOptions = ({ transaction = null, lock = false } = {}) => (
    transaction ? { transaction, lock: lock ? transaction.LOCK.UPDATE : undefined } : {}
);

const remittanceInclude = () => {
    const DeliveryRunRemittanceAllocation = dbStore.get('DeliveryRunRemittanceAllocation');
    const DeliveryRunRemittanceVariance = dbStore.get('DeliveryRunRemittanceVariance');
    return [{
        model: DeliveryRunRemittanceAllocation,
        as: 'allocations',
        required: false,
        include: [{
            model: DeliveryRunRemittanceVariance,
            as: 'variances',
            required: false,
            include: [{
                model: DeliveryRunRemittanceVariance,
                as: 'reversals',
                required: false
            }]
        }]
    }];
};

export const deliveryRunRepository = {
    async createRun(payload = {}, options = {}) {
        const DeliveryRun = dbStore.get('DeliveryRun');
        const row = await DeliveryRun.create({
            label: payload.label,
            scheduled_date: payload.scheduled_date ?? null,
            scheduled_date_end: payload.scheduled_date_end ?? null,
            transportation_label: payload.transportation_label ?? null,
            location_id: payload.location_id ?? null,
            notes: payload.notes ?? null,
            status: payload.status || 'draft',
            created_by: payload.created_by ?? null
        }, { transaction: options.transaction });
        return toPlain(row);
    },

    async getRunById(runId, options = {}) {
        const DeliveryRun = dbStore.get('DeliveryRun');
        const normalizedId = toPositiveInt(runId);
        if (!normalizedId) return null;
        const row = await DeliveryRun.findByPk(normalizedId, txOptions(options));
        return toPlain(row);
    },

    async updateRun(runId, payload = {}, options = {}) {
        const DeliveryRun = dbStore.get('DeliveryRun');
        const normalizedId = toPositiveInt(runId);
        if (!normalizedId) return null;
        const row = await DeliveryRun.findByPk(normalizedId, txOptions({ ...options, lock: true }));
        if (!row) return null;
        await row.update({
            ...payload,
            updated_by: payload.updated_by ?? row.updated_by ?? null
        }, { transaction: options.transaction });
        return toPlain(row);
    },

    async listRuns({
        status = null,
        scheduledDateFrom = null,
        scheduledDateTo = null,
        locationId = null,
        page = 1,
        limit = 20
    } = {}) {
        const DeliveryRun = dbStore.get('DeliveryRun');
        const DeliveryRunPersonnel = dbStore.get('DeliveryRunPersonnel');
        const DeliveryJob = dbStore.get('DeliveryJob');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');

        const where = {};
        if (status) where.status = status;
        const normalizedLocationId = toPositiveInt(locationId);
        if (normalizedLocationId) where.location_id = normalizedLocationId;

        // Phase 260 (#1489): scheduled_date/scheduled_date_end is a RANGE now, so
        // scheduledDateFrom/scheduledDateTo filter by overlap, not by scheduled_date alone. A run
        // with scheduled_date_end = NULL is a single-day run whose effective end equals its start
        // (a bare COALESCE isn't indexable, but a run's effective end only needs comparing against
        // scheduledDateFrom, and MySQL can still use idx_delivery_runs_status_scheduled_range's
        // leading status/scheduled_date columns for the scheduledDateTo half below).
        const overlapConditions = [];
        if (scheduledDateTo) {
            overlapConditions.push({ scheduled_date: { [Op.lte]: scheduledDateTo } });
        }
        if (scheduledDateFrom) {
            overlapConditions.push(
                sequelize.where(
                    sequelize.fn('COALESCE', sequelize.col('scheduled_date_end'), sequelize.col('scheduled_date')),
                    { [Op.gte]: scheduledDateFrom }
                )
            );
        }
        if (overlapConditions.length > 0) {
            // A run with scheduled_date = NULL still fails both Op.lte/Op.gte, same as today.
            where[Op.and] = overlapConditions;
        }

        const normalizedLimit = Math.min(Math.max(toPositiveInt(limit) || 20, 1), 100);
        const normalizedPage = Math.max(toPositiveInt(page) || 1, 1);

        const { rows, count } = await DeliveryRun.findAndCountAll({
            where,
            include: [
                { model: DeliveryRunPersonnel, as: 'personnel', required: false },
                { model: DeliveryJob, as: 'deliveryJobs', attributes: ['delivery_job_id'], required: false }
            ],
            order: [['created_at', 'DESC']],
            limit: normalizedLimit,
            offset: (normalizedPage - 1) * normalizedLimit,
            distinct: true
        });

        const items = rows.map((row) => {
            const plain = toPlain(row);
            const memberCount = Array.isArray(plain.deliveryJobs) ? plain.deliveryJobs.length : 0;
            delete plain.deliveryJobs;
            return { ...plain, member_count: memberCount };
        });

        return {
            items,
            total: count,
            page: normalizedPage,
            limit: normalizedLimit
        };
    },

    async getRunDetail(runId, options = {}) {
        const DeliveryRun = dbStore.get('DeliveryRun');
        const DeliveryRunPersonnel = dbStore.get('DeliveryRunPersonnel');
        const DeliveryJob = dbStore.get('DeliveryJob');
        const PosTransaction = dbStore.get('PosTransaction');
        const normalizedId = toPositiveInt(runId);
        if (!normalizedId) return null;

        const row = await DeliveryRun.findByPk(normalizedId, {
            include: [
                { model: DeliveryRunPersonnel, as: 'personnel', required: false },
                {
                    model: DeliveryJob,
                    as: 'deliveryJobs',
                    required: false,
                    include: [{
                        model: PosTransaction,
                        as: 'transaction',
                        // order_source/order_method/location_id: required by
                        // buildDispatchDeliveryRunUseCase's fan-out (deliveryRunUseCases.js) to
                        // classify each member -- without them here, Sequelize never hydrates
                        // those fields, so `order.order_source !== ONLINE_ORDER_SOURCE` is always
                        // true (undefined !== 'online_store') and every dispatch call fails every
                        // member with DELIVERY_ORDER_REQUIRED, regardless of the order's real
                        // classification. Found live-testing Phase 228 (#1273) against a real DB.
                        // total_amount/amount_paid/balance_due/payment_status: Phase 264 (#1487) --
                        // required by serializeDeliveryRun's run-level summary (expected/settled
                        // totals, delivered-order count) to reduce over each member's order money
                        // fields. Same hydration trap as above applies: omit one here and it's
                        // silently `undefined` on every member, not a query error.
                        attributes: ['pos_transaction_id', 'invoice_number', 'customer_name', 'delivery_address', 'fulfillment_status', 'order_source', 'order_method', 'location_id', 'total_amount', 'amount_paid', 'balance_due', 'payment_status', 'cash_received', 'change_amount']
                    }]
                }
            ],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async listRunPersonnel(runId, options = {}) {
        const DeliveryRunPersonnel = dbStore.get('DeliveryRunPersonnel');
        const normalizedId = toPositiveInt(runId);
        if (!normalizedId) return [];
        const rows = await DeliveryRunPersonnel.findAll({
            where: { delivery_run_id: normalizedId },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlain);
    },

    // Whole-roster replace: delete every existing row for the run, then bulkCreate the new set.
    // Deliberately not incremental add/remove -- see PHASE-225-PLAN.md section 3 ("Personnel is a
    // whole-roster PUT") for why: delivery_run_personnel's STORED generated column + unique index
    // enforcing "at most one accountable" would reject an incremental edit's transient
    // two-accountable/zero-accountable states.
    async replaceRunPersonnel(runId, personnelRows = [], options = {}) {
        const DeliveryRunPersonnel = dbStore.get('DeliveryRunPersonnel');
        const normalizedId = toPositiveInt(runId);
        if (!normalizedId) return [];

        await DeliveryRunPersonnel.destroy({
            where: { delivery_run_id: normalizedId },
            transaction: options.transaction
        });

        if (personnelRows.length === 0) return [];

        const created = await DeliveryRunPersonnel.bulkCreate(personnelRows.map((row) => ({
            delivery_run_id: normalizedId,
            delivery_personnel_id: row.delivery_personnel_id ?? null,
            delivery_personnel_name: row.delivery_personnel_name ?? null,
            is_accountable: Boolean(row.is_accountable),
            created_by: row.created_by ?? null,
            updated_by: row.updated_by ?? null
        })), { transaction: options.transaction });

        return created.map(toPlain);
    },

    async addJobsToRun(runId, deliveryJobIds = [], options = {}) {
        const DeliveryJob = dbStore.get('DeliveryJob');
        const normalizedRunId = toPositiveInt(runId);
        const normalizedIds = Array.from(new Set((deliveryJobIds || []).map(toPositiveInt).filter(Boolean)));
        if (!normalizedRunId || normalizedIds.length === 0) return 0;

        const [affected] = await DeliveryJob.update(
            { delivery_run_id: normalizedRunId },
            {
                where: { delivery_job_id: { [Op.in]: normalizedIds } },
                transaction: options.transaction
            }
        );
        return affected;
    },

    async removeJobFromRun(deliveryJobId, options = {}) {
        const DeliveryJob = dbStore.get('DeliveryJob');
        const normalizedId = toPositiveInt(deliveryJobId);
        if (!normalizedId) return null;

        const row = await DeliveryJob.findByPk(normalizedId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;

        await row.update({
            delivery_run_id: null,
            loading_state: 'pending',
            loading_exception_reason: null,
            loading_marked_by: null,
            loading_marked_at: null
        }, { transaction: options.transaction });
        return toPlain(row);
    },

    async updateDeliveryJobLoading(deliveryJobId, payload = {}, options = {}) {
        const DeliveryJob = dbStore.get('DeliveryJob');
        const normalizedId = toPositiveInt(deliveryJobId);
        if (!normalizedId) return null;

        const row = await DeliveryJob.findByPk(normalizedId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    // Phase 225 (#1273/#1081) removal conditional-clear: nulls the assignment fields a run
    // write-through wrote, only ever called by buildRemoveDeliveryRunMemberUseCase once it has
    // already established the job is run-owned and still pending_dispatch. See
    // PHASE-225-PLAN.md section 4.7.
    async clearDeliveryJobAssignment(deliveryJobId, options = {}) {
        const DeliveryJob = dbStore.get('DeliveryJob');
        const normalizedId = toPositiveInt(deliveryJobId);
        if (!normalizedId) return null;

        const row = await DeliveryJob.findByPk(normalizedId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;

        await row.update({
            delivery_personnel_id: null,
            delivery_personnel_name: null,
            assigned_by: null,
            assigned_shift_id: null,
            assigned_at: null
        }, { transaction: options.transaction });
        return toPlain(row);
    },

    async getDeliveryJobByOrderId(posTransactionId, options = {}) {
        const DeliveryJob = dbStore.get('DeliveryJob');
        const normalizedId = toPositiveInt(posTransactionId);
        if (!normalizedId) return null;
        const row = await DeliveryJob.findOne({
            where: { pos_transaction_id: normalizedId },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async getDeliveryJobById(deliveryJobId, options = {}) {
        const DeliveryJob = dbStore.get('DeliveryJob');
        const normalizedId = toPositiveInt(deliveryJobId);
        if (!normalizedId) return null;
        const row = await DeliveryJob.findByPk(normalizedId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async getRunRemittanceMembers(runId, posTransactionIds = [], options = {}) {
        const DeliveryJob = dbStore.get('DeliveryJob');
        const PosTransaction = dbStore.get('PosTransaction');
        const normalizedRunId = toPositiveInt(runId);
        const normalizedIds = Array.from(new Set(posTransactionIds.map(toPositiveInt).filter(Boolean)));
        if (!normalizedRunId || normalizedIds.length === 0) return [];

        const rows = await DeliveryJob.findAll({
            where: {
                delivery_run_id: normalizedRunId,
                pos_transaction_id: { [Op.in]: normalizedIds }
            },
            include: [{
                model: PosTransaction,
                as: 'transaction',
                required: true,
                attributes: [
                    'pos_transaction_id',
                    'cash_received',
                    'change_amount',
                    'payment_status',
                    'payment_type',
                    'balance_due',
                    'payment_timing'
                ]
            }],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlain);
    },

    async getRemittanceByRunId(runId, options = {}) {
        const DeliveryRunRemittance = dbStore.get('DeliveryRunRemittance');
        const normalizedRunId = toPositiveInt(runId);
        if (!normalizedRunId) return null;
        const row = await DeliveryRunRemittance.findOne({
            where: { delivery_run_id: normalizedRunId },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async getRemittanceById(remittanceId, options = {}) {
        const DeliveryRunRemittance = dbStore.get('DeliveryRunRemittance');
        const normalizedId = toPositiveInt(remittanceId);
        if (!normalizedId) return null;
        const row = await DeliveryRunRemittance.findByPk(normalizedId, {
            include: remittanceInclude(),
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async listRemittancesForRun(runId, options = {}) {
        const DeliveryRunRemittance = dbStore.get('DeliveryRunRemittance');
        const normalizedRunId = toPositiveInt(runId);
        if (!normalizedRunId) return [];
        const rows = await DeliveryRunRemittance.findAll({
            where: { delivery_run_id: normalizedRunId },
            include: remittanceInclude(),
            order: [['confirmed_at', 'DESC'], ['delivery_run_remittance_id', 'DESC']],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async getRemittanceDetail(runId, remittanceId, options = {}) {
        const DeliveryRunRemittance = dbStore.get('DeliveryRunRemittance');
        const normalizedRunId = toPositiveInt(runId);
        const normalizedRemittanceId = toPositiveInt(remittanceId);
        if (!normalizedRunId || !normalizedRemittanceId) return null;
        const row = await DeliveryRunRemittance.findOne({
            where: {
                delivery_run_id: normalizedRunId,
                delivery_run_remittance_id: normalizedRemittanceId
            },
            include: remittanceInclude(),
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async createRemittance({
        deliveryRunId,
        locationId,
        confirmedBy,
        confirmedAt,
        totalExpectedAmount,
        totalRemittedAmount,
        totalVarianceAmount,
        allocations = [],
        variances = []
    } = {}, options = {}) {
        const DeliveryRunRemittance = dbStore.get('DeliveryRunRemittance');
        const DeliveryRunRemittanceAllocation = dbStore.get('DeliveryRunRemittanceAllocation');
        const DeliveryRunRemittanceVariance = dbStore.get('DeliveryRunRemittanceVariance');
        const remittance = await DeliveryRunRemittance.create({
            delivery_run_id: deliveryRunId,
            location_id: locationId,
            confirmed_by: confirmedBy,
            confirmed_at: confirmedAt,
            total_expected_amount: totalExpectedAmount,
            total_remitted_amount: totalRemittedAmount,
            total_variance_amount: totalVarianceAmount
        }, { transaction: options.transaction });

        const createdAllocations = await DeliveryRunRemittanceAllocation.bulkCreate(
            allocations.map((allocation) => ({
                delivery_run_remittance_id: remittance.delivery_run_remittance_id,
                pos_transaction_id: allocation.pos_transaction_id,
                delivery_personnel_id: allocation.delivery_personnel_id ?? null,
                delivery_personnel_name: allocation.delivery_personnel_name ?? null,
                expected_amount: allocation.expected_amount,
                remitted_amount: allocation.remitted_amount,
                variance_amount: allocation.variance_amount
            })),
            { transaction: options.transaction }
        );

        const allocationByTransactionId = new Map(
            createdAllocations.map((allocation) => [Number(allocation.pos_transaction_id), allocation])
        );
        for (const variance of variances) {
            const allocation = allocationByTransactionId.get(Number(variance.pos_transaction_id));
            if (!allocation) continue;
            await DeliveryRunRemittanceVariance.create({
                delivery_run_remittance_allocation_id: allocation.delivery_run_remittance_allocation_id,
                entry_type: 'original',
                reversal_of_variance_id: null,
                direction: variance.direction,
                amount: variance.amount,
                reason: variance.reason,
                recorded_by: variance.recorded_by,
                recorded_at: variance.recorded_at
            }, { transaction: options.transaction });
        }

        return this.getRemittanceById(remittance.delivery_run_remittance_id, options);
    },

    async getRemittanceVariance(runId, remittanceId, varianceId, options = {}) {
        const DeliveryRunRemittanceVariance = dbStore.get('DeliveryRunRemittanceVariance');
        const DeliveryRunRemittanceAllocation = dbStore.get('DeliveryRunRemittanceAllocation');
        const DeliveryRunRemittance = dbStore.get('DeliveryRunRemittance');
        const normalizedRunId = toPositiveInt(runId);
        const normalizedRemittanceId = toPositiveInt(remittanceId);
        const normalizedVarianceId = toPositiveInt(varianceId);
        if (!normalizedRunId || !normalizedRemittanceId || !normalizedVarianceId) return null;

        const row = await DeliveryRunRemittanceVariance.findOne({
            where: {
                delivery_run_remittance_variance_id: normalizedVarianceId,
                entry_type: 'original'
            },
            include: [{
                model: DeliveryRunRemittanceAllocation,
                as: 'allocation',
                required: true,
                include: [{
                    model: DeliveryRunRemittance,
                    as: 'remittance',
                    required: true,
                    where: {
                        delivery_run_id: normalizedRunId,
                        delivery_run_remittance_id: normalizedRemittanceId
                    }
                }]
            }, {
                model: DeliveryRunRemittanceVariance,
                as: 'reversals',
                required: false
            }],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async createVarianceResolution({
        allocationId,
        reversalOfVarianceId,
        direction,
        amount,
        reason,
        recordedBy,
        recordedAt
    } = {}, options = {}) {
        const DeliveryRunRemittanceVariance = dbStore.get('DeliveryRunRemittanceVariance');
        const row = await DeliveryRunRemittanceVariance.create({
            delivery_run_remittance_allocation_id: allocationId,
            entry_type: 'reversal',
            reversal_of_variance_id: reversalOfVarianceId,
            direction,
            amount,
            reason,
            recorded_by: recordedBy,
            recorded_at: recordedAt
        }, { transaction: options.transaction });
        return toPlain(row);
    }
};

export default deliveryRunRepository;
