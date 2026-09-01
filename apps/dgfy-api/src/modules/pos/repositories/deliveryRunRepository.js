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

export const deliveryRunRepository = {
    async createRun(payload = {}, options = {}) {
        const DeliveryRun = dbStore.get('DeliveryRun');
        const row = await DeliveryRun.create({
            label: payload.label,
            scheduled_date: payload.scheduled_date ?? null,
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

        const where = {};
        if (status) where.status = status;
        const normalizedLocationId = toPositiveInt(locationId);
        if (normalizedLocationId) where.location_id = normalizedLocationId;
        if (scheduledDateFrom || scheduledDateTo) {
            where.scheduled_date = {};
            if (scheduledDateFrom) where.scheduled_date[Op.gte] = scheduledDateFrom;
            if (scheduledDateTo) where.scheduled_date[Op.lte] = scheduledDateTo;
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
                        attributes: ['pos_transaction_id', 'invoice_number', 'customer_name', 'delivery_address', 'fulfillment_status', 'order_source', 'order_method', 'location_id']
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

        await row.update({ delivery_run_id: null }, { transaction: options.transaction });
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
    }
};

export default deliveryRunRepository;
