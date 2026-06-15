import crypto from 'crypto';
import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import tenantConnector from '../../../utils/TenantConnector.js';
import { getTenantModels } from '../../../utils/tenantModelFactory.js';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode, isDomainError } from '../../shared/contracts/domainErrors.js';
import { dgfyCustomerRepository, hashReviewInviteToken, hashTrackingRecoveryLookup } from '../repositories/dgfyCustomerRepository.js';
import { dgfyEmailDeliveryRepository } from '../repositories/dgfyEmailDeliveryRepository.js';
import { recordDgfyOrderActivity } from '../utils/customerActivityRecorder.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TRACKING_REFERENCE_PATTERN = /^[A-Z]{2,4}-[A-Z0-9]{4,16}$/;
const RECOVERY_TTL_MINUTES = Number.parseInt(process.env.DGFY_TRACKING_RECOVERY_TTL_MINUTES || '10', 10);
const RECOVERY_MAX_ATTEMPTS = Number.parseInt(process.env.DGFY_TRACKING_RECOVERY_MAX_ATTEMPTS || '5', 10);
const RECOVERY_COOLDOWN_SECONDS = Number.parseInt(process.env.DGFY_TRACKING_RECOVERY_COOLDOWN_SECONDS || '60', 10);
const HISTORICAL_BACKFILL_TENANT_PAGE_SIZE = Number.parseInt(process.env.DGFY_HISTORICAL_BACKFILL_TENANT_PAGE_SIZE || '100', 10);
const HISTORICAL_BACKFILL_ORDER_BATCH_SIZE = Number.parseInt(process.env.DGFY_HISTORICAL_BACKFILL_ORDER_BATCH_SIZE || '200', 10);
const ACTIVITY_COUNT_KEYS = {
    order: 'order_count',
    pos_order: 'order_count',
    service_booking: 'service_booking_count',
    hospitality_booking: 'hospitality_booking_count',
    fnb_order: 'fnb_order_count'
};
const BOOKING_ACTIVITY_TYPES = new Set(['service_booking', 'hospitality_booking']);
const REVIEW_TARGET_TYPES = new Set(['product', 'service', 'hospitality_booking', 'fnb_order', 'fnb_item']);
const REVIEW_CHANNEL_TYPES = new Set(['account', 'tracking', 'order_success', 'qr', 'receipt']);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeReference = (value) => String(value || '').trim().toUpperCase();
const parsePositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const parseRequiredActivityTypes = (value) => {
    const rawValues = Array.isArray(value) ? value : String(value || '').split(',');
    return [...new Set(rawValues
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter((entry) => Object.prototype.hasOwnProperty.call(ACTIVITY_COUNT_KEYS, entry)))];
};

const buildReviewTargets = (activity = {}) => {
    const display = activity.display_snapshot || {};
    const activityType = activity.activity_type || (Array.isArray(display.lines) ? 'order' : null);
    const targets = [];
    if (activityType === 'order') {
        (Array.isArray(display.lines) ? display.lines : []).forEach((line) => {
            const itemId = parsePositiveInt(line.item_id);
            if (itemId) targets.push({ target_type: 'product', target_id: itemId, label: line.name || 'Purchased item' });
        });
    }
    if (activityType === 'fnb_order') {
        targets.push({ target_type: 'fnb_order', target_id: parsePositiveInt(display.check_id) || parsePositiveInt(activity.activity_id), label: 'F&B order' });
        (Array.isArray(display.lines) ? display.lines : []).forEach((line) => {
            const itemId = parsePositiveInt(line.item_id);
            if (itemId) targets.push({ target_type: 'fnb_item', target_id: itemId, label: line.name || 'Menu item' });
        });
    }
    if (activityType === 'service_booking') {
        targets.push({
            target_type: 'service',
            target_id: parsePositiveInt(display.service_item_id) || parsePositiveInt(display.booking_id) || parsePositiveInt(activity.activity_id),
            label: display.service_name || 'Service booking'
        });
    }
    if (activityType === 'hospitality_booking') {
        targets.push({
            target_type: 'hospitality_booking',
            target_id: parsePositiveInt(display.reservation_id) || parsePositiveInt(activity.activity_id),
            label: 'Hospitality booking'
        });
    }
    return targets;
};

const buildAllowedActions = (activity = {}) => {
    const status = String(activity.status || '').toLowerCase();
    const hasLines = Array.isArray(activity.display_snapshot?.lines) && activity.display_snapshot.lines.length > 0;
    return {
        track: Boolean(activity.reference),
        cancel: activity.activity_type === 'order' && ['placed', 'confirmed'].includes(status),
        reorder: activity.activity_type === 'order' && hasLines,
        rebook: BOOKING_ACTIVITY_TYPES.has(activity.activity_type),
        review: isReviewEligibleActivity(activity) && buildReviewTargets(activity).length > 0
    };
};

const publicActivity = (activity = {}) => {
    const display = activity.display_snapshot || {};
    return {
        activity_id: activity.activity_id,
        type: activity.activity_type,
        type_label: {
            order: 'Order',
            service_booking: 'Service booking',
            hospitality_booking: 'Hospitality booking',
            fnb_order: 'F&B order'
        }[activity.activity_type] || 'Activity',
        reference: activity.reference,
        store_slug: activity.store_slug,
        store_name: activity.store_name,
        store: { slug: activity.store_slug || null, name: activity.store_name || null },
        status: activity.status,
        status_label: activity.status_label,
        payment_status: activity.payment_status,
        total_amount: activity.total_amount,
        currency: activity.currency || 'PHP',
        occurred_at: activity.occurred_at,
        display,
        summary_lines: Array.isArray(display.lines)
            ? display.lines.slice(0, 4).map((line) => ({ item_id: line.item_id || null, label: line.name || line.label || 'Item', quantity: Number(line.quantity || 1) }))
            : [],
        allowed_actions: buildAllowedActions(activity),
        review_targets: buildReviewTargets(activity)
    };
};

const genericRecoveryResponse = (extra = {}) => ({
    message: 'If matching orders exist, a recovery code has been sent by email.',
    ...(process.env.NODE_ENV === 'production' ? {} : extra)
});

const isReviewEligibleActivity = (activity = {}) => {
    const status = String(activity.status || '').trim().toLowerCase();
    const paymentStatus = String(activity.payment_status || '').trim().toLowerCase();
    if (['cancelled', 'rejected'].includes(status)) return false;
    return paymentStatus === 'paid' || status === 'completed';
};

const safeLimit = (value, fallback, max) => Math.max(1, Math.min(Number.parseInt(value, 10) || fallback, max));

const getModelTableName = (model) => {
    const tableName = typeof model?.getTableName === 'function' ? model.getTableName() : model?.tableName;
    return typeof tableName === 'object' ? tableName.tableName : tableName;
};

const existingModelAttributes = async (sequelize, model) => {
    if (!sequelize || !model) return [];
    const tableName = getModelTableName(model);
    if (!tableName) return [];
    try {
        const columns = await sequelize.getQueryInterface().describeTable(tableName);
        const columnNames = new Set(Object.keys(columns || {}));
        return Object.entries(model.rawAttributes || {})
            .filter(([attributeName, definition]) => columnNames.has(definition?.field || attributeName))
            .map(([attributeName]) => attributeName);
    } catch {
        return [];
    }
};

const ensureAccount = (account) => {
    if (!account?.id) {
        throw new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'DGFY account authentication is required.', { statusCode: 401 });
    }
    return account;
};

const mapError = (error, fallbackMessage) => {
    if (error instanceof DomainError) return error;
    return new DomainError(DomainErrorCode.INTERNAL_ERROR, fallbackMessage, {
        statusCode: error?.statusCode || 500,
        details: error?.details || null
    });
};

const buildReviewerName = ({ anonymous = false, reviewerName = '', account = null } = {}) => {
    if (anonymous) return 'Anonymous';
    const direct = String(reviewerName || '').trim();
    if (direct) return direct.slice(0, 255);
    const fullName = [account?.first_name, account?.last_name].map((value) => String(value || '').trim()).filter(Boolean).join(' ').trim();
    if (fullName) return fullName.slice(0, 255);
    return String(account?.username || account?.email || 'Customer').trim().slice(0, 255) || 'Customer';
};

const buildReviewerInitials = (value = '') => {
    const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
    const initials = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
    return initials || 'CU';
};

const withTenantContext = async (tenantId, callback) => {
    const tenant = await dgfyCustomerRepository.findTenantById(tenantId);
    if (!tenant) {
        throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Storefront is no longer available.', { statusCode: 404 });
    }
    const sequelize = await tenantConnector.getConnection(tenant);
    const context = {
        sequelize,
        tenantId: tenant.id,
        tenantToken: tenant.company_token,
        tenantName: tenant.name,
        tenantPlan: tenant.plan,
        ...getTenantModels(sequelize)
    };
    return dbStore.run(context, () => callback({ tenant, sequelize }));
};

const matchAccountForOrder = (order = {}) => {
    const storeCustomer = order.storeCustomer || {};
    if (storeCustomer.dgfy_account_id) return { id: storeCustomer.dgfy_account_id };
    return null;
};

const matchAccountForCustomerRecord = (record = {}) => {
    const storeCustomer = record.storeCustomer || {};
    if (storeCustomer.dgfy_account_id) return { id: storeCustomer.dgfy_account_id };
    return null;
};

const defaultTenantOrderReader = async ({ tenant, batchSize, transactionLimit }) => {
    const rows = [];
    await withTenantContext(tenant.id, async ({ sequelize }) => {
        const PosTransaction = dbStore.get('PosTransaction');
        const PosTransactionLine = dbStore.get('PosTransactionLine');
        const StoreCustomer = dbStore.get('StoreCustomer');
        const Item = dbStore.get('Item');
        if (!PosTransaction) return;
        const transactionAttributes = await existingModelAttributes(sequelize, PosTransaction);
        if (!transactionAttributes.includes('pos_transaction_id') || !transactionAttributes.includes('tracking_pin')) return;
        const include = [];
        if (StoreCustomer) {
            const storeCustomerAttributes = await existingModelAttributes(sequelize, StoreCustomer);
            if (storeCustomerAttributes.length) {
                include.push({ model: StoreCustomer, as: 'storeCustomer', required: false, attributes: storeCustomerAttributes });
            }
        }
        if (PosTransactionLine) {
            const lineAttributes = await existingModelAttributes(sequelize, PosTransactionLine);
            const itemAttributes = Item ? await existingModelAttributes(sequelize, Item) : [];
            if (lineAttributes.length) include.push({
                model: PosTransactionLine,
                as: 'lines',
                required: false,
                attributes: lineAttributes,
                ...(Item && itemAttributes.length ? { include: [{ model: Item, as: 'item', required: false, attributes: itemAttributes }] } : {})
            });
        }
        const limit = safeLimit(batchSize, HISTORICAL_BACKFILL_ORDER_BATCH_SIZE, 1000);
        const maxRows = transactionLimit === null || transactionLimit === undefined
            ? Number.POSITIVE_INFINITY
            : Math.max(1, Number.parseInt(transactionLimit, 10) || 1);
        let lastId = 0;
        while (rows.length < maxRows) {
            const batch = await PosTransaction.findAll({
                where: {
                    tracking_pin: { [Op.ne]: null },
                    pos_transaction_id: { [Op.gt]: lastId }
                },
                include,
                attributes: transactionAttributes,
                order: [['pos_transaction_id', 'ASC']],
                limit: Math.min(limit, maxRows - rows.length)
            });
            if (!batch.length) break;
            for (const row of batch) {
                const plain = typeof row.toJSON === 'function' ? row.toJSON() : row;
                rows.push(plain);
                lastId = Number(plain.pos_transaction_id || lastId);
            }
            if (batch.length < limit) break;
        }
    });
    return rows;
};

const buildStoreCustomerInclude = async ({ sequelize, StoreCustomer }) => {
    if (!StoreCustomer) return null;
    const attributes = await existingModelAttributes(sequelize, StoreCustomer);
    return attributes.length
        ? { model: StoreCustomer, as: 'storeCustomer', required: false, attributes }
        : null;
};

const readTenantRows = async ({
    tenant,
    modelName,
    idAttribute,
    referenceAttribute,
    batchSize,
    recordLimit,
    buildInclude = null
}) => {
    const rows = [];
    await withTenantContext(tenant.id, async ({ sequelize }) => {
        const Model = dbStore.get(modelName);
        if (!Model) return;
        const attributes = await existingModelAttributes(sequelize, Model);
        if (!attributes.includes(idAttribute) || !attributes.includes(referenceAttribute)) return;
        const include = typeof buildInclude === 'function' ? await buildInclude({ sequelize }) : [];
        const limit = safeLimit(batchSize, HISTORICAL_BACKFILL_ORDER_BATCH_SIZE, 1000);
        const maxRows = recordLimit === null || recordLimit === undefined
            ? Number.POSITIVE_INFINITY
            : Math.max(1, Number.parseInt(recordLimit, 10) || 1);
        let lastId = 0;
        while (rows.length < maxRows) {
            const batch = await Model.findAll({
                where: {
                    [referenceAttribute]: { [Op.ne]: null },
                    [idAttribute]: { [Op.gt]: lastId }
                },
                include,
                attributes,
                order: [[idAttribute, 'ASC']],
                limit: Math.min(limit, maxRows - rows.length)
            });
            if (!batch.length) break;
            for (const row of batch) {
                const plain = typeof row.toJSON === 'function' ? row.toJSON() : row;
                rows.push(plain);
                lastId = Number(plain[idAttribute] || lastId);
            }
            if (batch.length < limit) break;
        }
    });
    return rows;
};

const defaultTenantServiceBookingReader = ({ tenant, batchSize, transactionLimit }) => readTenantRows({
    tenant,
    modelName: 'ServiceBooking',
    idAttribute: 'booking_id',
    referenceAttribute: 'public_reference',
    batchSize,
    recordLimit: transactionLimit,
    buildInclude: async ({ sequelize }) => {
        const include = [];
        const storeCustomerInclude = await buildStoreCustomerInclude({ sequelize, StoreCustomer: dbStore.get('StoreCustomer') });
        if (storeCustomerInclude) include.push(storeCustomerInclude);
        const ServiceItem = dbStore.get('Item');
        const serviceItemAttributes = await existingModelAttributes(sequelize, ServiceItem);
        if (ServiceItem && serviceItemAttributes.length) {
            include.push({ model: ServiceItem, as: 'serviceItem', required: false, attributes: serviceItemAttributes });
        }
        return include;
    }
});

const defaultTenantHospitalityReservationReader = ({ tenant, batchSize, transactionLimit }) => readTenantRows({
    tenant,
    modelName: 'HospitalityReservation',
    idAttribute: 'reservation_id',
    referenceAttribute: 'public_reference',
    batchSize,
    recordLimit: transactionLimit,
    buildInclude: async ({ sequelize }) => {
        const include = [];
        const storeCustomerInclude = await buildStoreCustomerInclude({ sequelize, StoreCustomer: dbStore.get('StoreCustomer') });
        if (storeCustomerInclude) include.push(storeCustomerInclude);
        const HospitalityGuestProfile = dbStore.get('HospitalityGuestProfile');
        const guestProfileAttributes = await existingModelAttributes(sequelize, HospitalityGuestProfile);
        if (HospitalityGuestProfile && guestProfileAttributes.length) {
            include.push({ model: HospitalityGuestProfile, as: 'guestProfile', required: false, attributes: guestProfileAttributes });
        }
        return include;
    }
});

const defaultTenantFnbOrderReader = async ({ tenant, batchSize, transactionLimit }) => {
    const rows = [];
    await withTenantContext(tenant.id, async ({ sequelize }) => {
        const FnbCheck = dbStore.get('FnbCheck');
        const FnbCheckLine = dbStore.get('FnbCheckLine');
        const PosTransaction = dbStore.get('PosTransaction');
        const StoreCustomer = dbStore.get('StoreCustomer');
        const Item = dbStore.get('Item');
        if (!FnbCheck) return;
        const checkAttributes = await existingModelAttributes(sequelize, FnbCheck);
        if (!checkAttributes.includes('check_id')) return;
        const include = [];
        if (PosTransaction) {
            const transactionAttributes = await existingModelAttributes(sequelize, PosTransaction);
            if (transactionAttributes.length) {
                const transactionInclude = [];
                if (StoreCustomer) {
                    const storeCustomerAttributes = await existingModelAttributes(sequelize, StoreCustomer);
                    if (storeCustomerAttributes.length) transactionInclude.push({ model: StoreCustomer, as: 'storeCustomer', required: false, attributes: storeCustomerAttributes });
                }
                include.push({ model: PosTransaction, as: 'posTransaction', required: false, attributes: transactionAttributes, include: transactionInclude });
            }
        }
        if (FnbCheckLine) {
            const lineAttributes = await existingModelAttributes(sequelize, FnbCheckLine);
            const itemAttributes = Item ? await existingModelAttributes(sequelize, Item) : [];
            if (lineAttributes.length) include.push({
                model: FnbCheckLine,
                as: 'lines',
                required: false,
                attributes: lineAttributes,
                ...(Item && itemAttributes.length ? { include: [{ model: Item, as: 'item', required: false, attributes: itemAttributes }] } : {})
            });
        }
        const limit = safeLimit(batchSize, HISTORICAL_BACKFILL_ORDER_BATCH_SIZE, 1000);
        const maxRows = transactionLimit === null || transactionLimit === undefined
            ? Number.POSITIVE_INFINITY
            : Math.max(1, Number.parseInt(transactionLimit, 10) || 1);
        let lastId = 0;
        while (rows.length < maxRows) {
            const batch = await FnbCheck.findAll({
                where: { check_id: { [Op.gt]: lastId } },
                include,
                attributes: checkAttributes,
                order: [['check_id', 'ASC']],
                limit: Math.min(limit, maxRows - rows.length)
            });
            if (!batch.length) break;
            for (const row of batch) {
                const plain = typeof row.toJSON === 'function' ? row.toJSON() : row;
                rows.push(plain);
                lastId = Number(plain.check_id || lastId);
            }
            if (batch.length < limit) break;
        }
    });
    return rows;
};

const defaultTenantActivityReader = async ({ tenant, batchSize, transactionLimit }) => {
    const [orders, serviceBookings, hospitalityReservations, fnbOrders] = await Promise.all([
        defaultTenantOrderReader({ tenant, batchSize, transactionLimit }),
        defaultTenantServiceBookingReader({ tenant, batchSize, transactionLimit }),
        defaultTenantHospitalityReservationReader({ tenant, batchSize, transactionLimit }),
        defaultTenantFnbOrderReader({ tenant, batchSize, transactionLimit })
    ]);
    return { orders, serviceBookings, hospitalityReservations, fnbOrders };
};

const serviceBookingActivityPayload = ({ tenant, booking, account }) => {
    const storeCustomer = booking.storeCustomer || {};
    const totalAmount = Number(booking.total_amount ?? booking.price ?? 0);
    return {
        dgfy_account_id: account?.id || storeCustomer.dgfy_account_id || null,
        tenant_id: tenant.id,
        store_customer_id: booking.store_customer_id || storeCustomer.customer_id || null,
        activity_type: 'service_booking',
        reference: normalizeReference(booking.public_reference),
        store_slug: tenant.company_token || null,
        store_name: tenant.name || null,
        status: booking.status || null,
        payment_status: booking.payment_status || null,
        total_amount: Number.isFinite(totalAmount) && totalAmount > 0 ? totalAmount : null,
        customer_email: normalizeEmail(booking.customer_email || storeCustomer.email) || null,
        customer_phone: booking.customer_phone || storeCustomer.phone || null,
        display_snapshot: {
            booking_id: booking.booking_id || null,
            service_item_id: booking.service_item_id || null,
            service_name: booking.serviceItem?.name || null,
            start_at: booking.start_at || null,
            end_at: booking.end_at || null,
            quantity: Number(booking.quantity || 1),
            source: booking.source || null
        },
        occurred_at: booking.created_at || booking.start_at || new Date()
    };
};

const hospitalityReservationActivityPayload = ({ tenant, reservation, account }) => {
    const storeCustomer = reservation.storeCustomer || {};
    const guestProfile = reservation.guestProfile || {};
    const totalAmount = Number(reservation.total_amount || 0);
    return {
        dgfy_account_id: account?.id || storeCustomer.dgfy_account_id || null,
        tenant_id: tenant.id,
        store_customer_id: reservation.store_customer_id || storeCustomer.customer_id || guestProfile.store_customer_id || null,
        activity_type: 'hospitality_booking',
        reference: normalizeReference(reservation.public_reference),
        store_slug: tenant.company_token || null,
        store_name: tenant.name || null,
        status: reservation.status || null,
        payment_status: reservation.payment_status || null,
        total_amount: Number.isFinite(totalAmount) && totalAmount > 0 ? totalAmount : null,
        customer_email: normalizeEmail(reservation.customer_email || storeCustomer.email || guestProfile.email) || null,
        customer_phone: reservation.customer_phone || storeCustomer.phone || guestProfile.phone || null,
        display_snapshot: {
            reservation_id: reservation.reservation_id || null,
            check_in_date: reservation.check_in_date || null,
            check_out_date: reservation.check_out_date || null,
            adults: Number(reservation.adults || 0),
            children: Number(reservation.children || 0),
            room_count: Number(reservation.room_count || 0),
            source: reservation.source || null
        },
        occurred_at: reservation.created_at || reservation.check_in_date || new Date()
    };
};

const fnbOrderActivityPayload = ({ tenant, check, account }) => {
    const posTransaction = check.posTransaction || {};
    const storeCustomer = posTransaction.storeCustomer || check.storeCustomer || {};
    const totalAmount = Number(posTransaction.total_amount ?? check.total_amount ?? 0);
    const reference = normalizeReference(posTransaction.tracking_pin || check.public_reference || `FNB-${check.check_id}`);
    return {
        dgfy_account_id: account?.id || storeCustomer.dgfy_account_id || null,
        tenant_id: tenant.id,
        store_customer_id: posTransaction.store_customer_id || storeCustomer.customer_id || null,
        activity_type: 'fnb_order',
        reference,
        store_slug: tenant.company_token || null,
        store_name: tenant.name || null,
        status: check.status || posTransaction.fulfillment_status || null,
        status_label: check.status || posTransaction.status_label || null,
        payment_status: posTransaction.payment_status || (check.status === 'paid' ? 'paid' : null),
        total_amount: Number.isFinite(totalAmount) && totalAmount > 0 ? totalAmount : null,
        customer_email: normalizeEmail(posTransaction.customer_email || storeCustomer.email) || null,
        customer_phone: posTransaction.customer_phone || storeCustomer.phone || null,
        display_snapshot: {
            check_id: check.check_id || null,
            order_method: check.order_method || null,
            opened_at: check.opened_at || null,
            closed_at: check.closed_at || null,
            lines: (Array.isArray(check.lines) ? check.lines : []).map((line) => ({
                item_id: line.item_id || line.item?.item_id || null,
                name: line.item?.name || line.name || 'Menu item',
                quantity: Number(line.quantity || 1),
                price: Number(line.unit_price ?? line.price ?? 0)
            }))
        },
        occurred_at: check.closed_at || check.opened_at || posTransaction.created_at || new Date()
    };
};

const hashRecoveryCode = ({ lookup, code }) => (
    crypto
        .createHash('sha256')
        .update(`${String(lookup || '').trim().toLowerCase()}:${String(code || '').trim()}:${process.env.EMAIL_OTP_SECRET || process.env.JWT_SECRET || 'dgfy_tracking_recovery_local'}`)
        .digest('hex')
);

const generateRecoveryCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

export const buildGetDgfyCustomerDashboardUseCase = ({ repository = dgfyCustomerRepository } = {}) => async ({ account }) => {
    try {
        const dgfyAccount = ensureAccount(account);
        const [activityResult, addresses, loyalty] = await Promise.all([
            repository.listActivitiesForAccount(dgfyAccount.id, { limit: 10 }),
            repository.listAddresses(dgfyAccount.id),
            repository.listLoyalty(dgfyAccount.id, 20)
        ]);
        const activities = activityResult.rows.map(publicActivity);
        return ok({
            account: {
                id: dgfyAccount.id,
                first_name: dgfyAccount.first_name,
                middle_name: dgfyAccount.middle_name || null,
                last_name: dgfyAccount.last_name,
                username: dgfyAccount.username,
                email: dgfyAccount.email,
                phone: dgfyAccount.phone,
                is_email_verified: Boolean(dgfyAccount.email_verified_at),
                phone_verification_deferred: true
            },
            activities,
            orders: activities.filter((entry) => entry.type === 'order'),
            bookings: activities.filter((entry) => entry.type !== 'order'),
            addresses,
            loyalty
        });
    } catch (error) {
        return fail(mapError(error, 'Failed to load DGFY customer dashboard'));
    }
};

export const buildListDgfyCustomerActivitiesUseCase = ({ repository = dgfyCustomerRepository } = {}) => async ({ account, query = {}, type = null }) => {
    try {
        const dgfyAccount = ensureAccount(account);
        const result = await repository.listActivitiesForAccount(dgfyAccount.id, {
            type: type || query.type || null,
            tenantId: query.tenant_id || query.tenantId,
            storeSlug: query.store_slug || query.storeSlug,
            status: query.status,
            paymentStatus: query.payment_status || query.paymentStatus,
            dateFrom: query.date_from || query.dateFrom,
            dateTo: query.date_to || query.dateTo,
            page: query.page,
            limit: query.limit
        });
        return ok({
            activities: result.rows.map(publicActivity),
            pagination: result.pagination
        });
    } catch (error) {
        return fail(mapError(error, 'Failed to list DGFY customer activity'));
    }
};

export const buildTrackDgfyCustomerReferenceUseCase = ({ repository = dgfyCustomerRepository } = {}) => async ({ account = null, body = {} }) => {
    try {
        const reference = normalizeReference(body.reference || body.tracking_pin);
        if (!TRACKING_REFERENCE_PATTERN.test(reference)) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A valid tracking reference is required.', { statusCode: 422 });
        }
        const activity = account?.id
            ? await repository.findActivityForAccount({ dgfyAccountId: account.id, reference })
            : await repository.findActivityByReference(reference);
        if (!activity) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Tracking reference was not found.', { statusCode: 404 });
        }
        return ok({ activity: publicActivity(activity) });
    } catch (error) {
        return fail(mapError(error, 'Failed to track DGFY customer reference'));
    }
};

export const buildCancelDgfyCustomerOrderUseCase = ({ repository = dgfyCustomerRepository } = {}) => async ({ account, reference }) => {
    try {
        const dgfyAccount = ensureAccount(account);
        const activity = await repository.findActivityForAccount({ dgfyAccountId: dgfyAccount.id, reference });
        if (!activity || activity.activity_type !== 'order') {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Order was not found for this DGFY account.', { statusCode: 404 });
        }
        if (!parsePositiveInt(activity.store_customer_id)) {
            throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Order is not linked to this account.', { statusCode: 403 });
        }

        const updated = await withTenantContext(activity.tenant_id, async () => {
            const PosTransaction = dbStore.get('PosTransaction');
            const row = await PosTransaction.findOne({ where: { tracking_pin: activity.reference } });
            if (!row) {
                throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Order was not found in the storefront.', { statusCode: 404 });
            }
            if (Number(row.store_customer_id) !== Number(activity.store_customer_id)) {
                throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Order is not linked to this DGFY account.', { statusCode: 403 });
            }
            if (!['placed', 'confirmed'].includes(row.fulfillment_status)) {
                throw new DomainError(DomainErrorCode.CONFLICT, 'Order can only be cancelled before preparing.', { statusCode: 409 });
            }
            await row.update({ fulfillment_status: 'cancelled' });
            return row.reload();
        });

        const synced = await recordDgfyOrderActivity({
            tenantId: activity.tenant_id,
            order: updated,
            storeCustomer: {
                customer_id: activity.store_customer_id,
                dgfy_account_id: dgfyAccount.id,
                email: activity.customer_email,
                phone: activity.customer_phone
            }
        });

        return ok({ activity: publicActivity(synced || activity) });
    } catch (error) {
        return fail(mapError(error, 'Failed to cancel DGFY customer order'));
    }
};

export const buildReorderDgfyCustomerOrderUseCase = ({ repository = dgfyCustomerRepository } = {}) => async ({ account, reference }) => {
    try {
        const dgfyAccount = ensureAccount(account);
        const activity = await repository.findActivityForAccount({ dgfyAccountId: dgfyAccount.id, reference });
        if (!activity || activity.activity_type !== 'order') {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Order was not found for this DGFY account.', { statusCode: 404 });
        }
        const lines = Array.isArray(activity.display_snapshot?.lines)
            ? activity.display_snapshot.lines
                .map((line) => ({
                    item_id: parsePositiveInt(line.item_id),
                    name: String(line.name || 'Item').trim(),
                    quantity: Number(line.quantity || 1),
                    price: Number(line.price || 0),
                    unit_of_measure: line.unit_of_measure || ''
                }))
                .filter((line) => line.item_id && line.quantity > 0)
            : [];
        if (!lines.length) {
            throw new DomainError(DomainErrorCode.CONFLICT, 'This order does not have reusable line items.', { statusCode: 409 });
        }
        return ok({
            store_slug: activity.store_slug,
            reference: activity.reference,
            cart_lines: lines,
            validation_note: 'Checkout will revalidate current product availability, pricing, stock, and customer access mode.'
        });
    } catch (error) {
        return fail(mapError(error, 'Failed to prepare DGFY reorder'));
    }
};

export const buildManageDgfyCustomerAddressesUseCases = ({ repository = dgfyCustomerRepository } = {}) => ({
    list: async ({ account }) => {
        try {
            const dgfyAccount = ensureAccount(account);
            return ok({ addresses: await repository.listAddresses(dgfyAccount.id) });
        } catch (error) {
            return fail(mapError(error, 'Failed to list DGFY addresses'));
        }
    },
    create: async ({ account, body = {} }) => {
        try {
            const dgfyAccount = ensureAccount(account);
            const addressLine = String(body.address_line || '').trim();
            if (!addressLine) {
                throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'address_line is required.', { statusCode: 422 });
            }
            const address = await repository.createAddress(dgfyAccount.id, {
                label: String(body.label || 'Address').trim() || 'Address',
                address_line: addressLine,
                latitude: body.latitude ?? null,
                longitude: body.longitude ?? null,
                is_default: body.is_default === true
            });
            return ok({ address });
        } catch (error) {
            return fail(mapError(error, 'Failed to save DGFY address'));
        }
    },
    update: async ({ account, addressId, body = {} }) => {
        try {
            const dgfyAccount = ensureAccount(account);
            const updates = {};
            if (body.label !== undefined) updates.label = String(body.label || 'Address').trim() || 'Address';
            if (body.address_line !== undefined) {
                const addressLine = String(body.address_line || '').trim();
                if (!addressLine) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'address_line cannot be blank.', { statusCode: 422 });
                updates.address_line = addressLine;
            }
            if (body.latitude !== undefined) updates.latitude = body.latitude;
            if (body.longitude !== undefined) updates.longitude = body.longitude;
            if (body.is_default !== undefined) updates.is_default = body.is_default === true;
            const address = await repository.updateAddress(dgfyAccount.id, addressId, updates);
            if (!address) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Address not found.', { statusCode: 404 });
            return ok({ address });
        } catch (error) {
            return fail(mapError(error, 'Failed to update DGFY address'));
        }
    },
    remove: async ({ account, addressId }) => {
        try {
            const dgfyAccount = ensureAccount(account);
            const deleted = await repository.deleteAddress(dgfyAccount.id, addressId);
            if (!deleted) throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Address not found.', { statusCode: 404 });
            return ok({ deleted: true, address_id: parsePositiveInt(addressId) });
        } catch (error) {
            return fail(mapError(error, 'Failed to delete DGFY address'));
        }
    }
});

export const buildGetDgfyCustomerLoyaltyUseCase = ({ repository = dgfyCustomerRepository } = {}) => async ({ account }) => {
    try {
        const dgfyAccount = ensureAccount(account);
        return ok({ loyalty: await repository.listLoyalty(dgfyAccount.id) });
    } catch (error) {
        return fail(mapError(error, 'Failed to load DGFY loyalty'));
    }
};

export const buildSubmitDgfyCustomerReviewUseCase = ({ repository = dgfyCustomerRepository } = {}) => async ({ account, body = {} }) => {
    try {
        const dgfyAccount = ensureAccount(account);
        if (!isPlainObject(body)) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'payload must be an object.', { statusCode: 422 });
        }
        const activityId = parsePositiveInt(body.activity_id);
        const requestedTargetType = String(body.target_type || (body.item_id ? 'product' : '')).trim().toLowerCase();
        const targetType = REVIEW_TARGET_TYPES.has(requestedTargetType) ? requestedTargetType : null;
        const targetId = parsePositiveInt(body.target_id ?? body.item_id);
        const itemId = ['product', 'fnb_item'].includes(targetType) ? targetId : null;
        const rating = Number.parseInt(body.rating, 10);
        if (!activityId || !targetType || !Number.isInteger(rating) || rating < 1 || rating > 5) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'activity_id, target_type, and rating 1-5 are required.', { statusCode: 422 });
        }
        const activityResult = await repository.listActivitiesForAccount(dgfyAccount.id, { limit: 100 });
        const activity = activityResult.rows.find((entry) => Number(entry.activity_id) === activityId);
        if (!activity) {
            throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Review requires an account-linked purchase.', { statusCode: 403 });
        }
        if (!isReviewEligibleActivity(activity)) {
            throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Review requires a completed or paid purchase.', { statusCode: 403 });
        }
        const eligibleTargets = buildReviewTargets(activity);
        const target = eligibleTargets.find((entry) => entry.target_type === targetType && (
            targetId ? Number(entry.target_id) === Number(targetId) : true
        ));
        if (!target) {
            throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Review requires an eligible account activity target.', { statusCode: 403 });
        }
        const reviewTargetId = targetId || parsePositiveInt(target.target_id) || activityId;
        const existing = typeof repository.findReviewByAccountActivityTarget === 'function'
            ? await repository.findReviewByAccountActivityTarget({
                dgfyAccountId: dgfyAccount.id,
                activityId,
                targetType,
                targetId: reviewTargetId
            })
            : await repository.findReviewByAccountActivityItem({
                dgfyAccountId: dgfyAccount.id,
                activityId,
                itemId: itemId || reviewTargetId
            });
        if (existing) {
            throw new DomainError(DomainErrorCode.CONFLICT, 'A review already exists for this activity target.', { statusCode: 409 });
        }
        const review = await repository.createReview({
            dgfy_account_id: dgfyAccount.id,
            activity_id: activityId,
            tenant_id: activity.tenant_id,
            item_id: itemId,
            target_type: targetType,
            target_id: reviewTargetId,
            rating,
            comment: String(body.comment || '').trim().slice(0, 2000) || null,
            anonymous: body.anonymous === true,
            reviewer_name: buildReviewerName({ anonymous: body.anonymous === true, reviewerName: body.reviewer_name || body.name, account: dgfyAccount }),
            reviewer_initials: buildReviewerInitials(buildReviewerName({ anonymous: body.anonymous === true, reviewerName: body.reviewer_name || body.name, account: dgfyAccount })),
            verified_purchase: true,
            submission_channel: REVIEW_CHANNEL_TYPES.has(String(body.submission_channel || '').trim()) ? String(body.submission_channel).trim() : 'account',
            media_json: Array.isArray(body.media) ? body.media.slice(0, 4) : null,
            status: 'pending'
        });
        return ok({ review });
    } catch (error) {
        return fail(mapError(error, 'Failed to submit DGFY review'));
    }
};

export const buildListPublicDgfyCustomerReviewsUseCase = ({ repository = dgfyCustomerRepository } = {}) => async ({ query = {} } = {}) => {
    try {
        const tenantId = String(query.tenant_id || '').trim();
        const itemId = parsePositiveInt(query.item_id);
        const targetType = String(query.target_type || '').trim().toLowerCase() || null;
        const targetId = parsePositiveInt(query.target_id);
        if (!tenantId || (!itemId && !(targetType && targetId))) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'tenant_id and item_id or explicit target_type/target_id are required.', { statusCode: 422 });
        }
        const result = await repository.listPublicReviews({
            tenantId: tenantId || null,
            itemId,
            targetType,
            targetId,
            limit: query.limit
        });
        return ok({ reviews: result.rows || [], summary: result.summary || { average_rating: null, total_count: 0 } });
    } catch (error) {
        return fail(mapError(error, 'Failed to load public DGFY reviews'));
    }
};

export const buildValidateDgfyReviewInviteUseCase = ({ repository = dgfyCustomerRepository } = {}) => async ({ token }) => {
    try {
        const normalizedToken = String(token || '').trim();
        if (!normalizedToken) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'review invite token is required.', { statusCode: 422 });
        }
        const invite = await repository.findReviewInviteByTokenHash(hashReviewInviteToken(normalizedToken));
        if (!invite || ['revoked', 'expired', 'submitted'].includes(String(invite.status || '').trim().toLowerCase())) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Review invite is invalid or unavailable.', { statusCode: 404 });
        }
        if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
            throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Review invite has expired.', { statusCode: 403 });
        }
        await repository.markReviewInviteOpened(invite.invite_id);
        return ok({
            invite: {
                invite_id: invite.invite_id,
                tenant_id: invite.tenant_id,
                tracking_pin: invite.tracking_pin,
                target_type: invite.target_type,
                target_id: invite.target_id,
                item_name: invite.item_name,
                delivery_channel: invite.delivery_channel,
                expires_at: invite.expires_at,
                activity_id: invite.activity_id || null
            }
        });
    } catch (error) {
        return fail(mapError(error, 'Failed to validate DGFY review invite'));
    }
};

export const buildSubmitDgfyGuestReviewInviteUseCase = ({ repository = dgfyCustomerRepository } = {}) => async ({ token, body = {} }) => {
    try {
        const normalizedToken = String(token || '').trim();
        if (!normalizedToken || !isPlainObject(body)) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'review invite token and payload are required.', { statusCode: 422 });
        }
        const invite = await repository.findReviewInviteByTokenHash(hashReviewInviteToken(normalizedToken));
        if (!invite || ['revoked', 'expired', 'submitted'].includes(String(invite.status || '').trim().toLowerCase())) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Review invite is invalid or unavailable.', { statusCode: 404 });
        }
        if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) {
            throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Review invite has expired.', { statusCode: 403 });
        }
        const rating = Number.parseInt(body.rating, 10);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'rating 1-5 is required.', { statusCode: 422 });
        }
        const existing = await repository.findReviewByTrackingActivityTarget({
            tenantId: invite.tenant_id,
            activityId: invite.activity_id || null,
            targetType: invite.target_type,
            targetId: invite.target_id
        });
        if (existing) {
            throw new DomainError(DomainErrorCode.CONFLICT, 'A review already exists for this activity target.', { statusCode: 409 });
        }
        const reviewerName = buildReviewerName({
            anonymous: body.anonymous === true,
            reviewerName: body.reviewer_name || body.name,
            account: null
        });
        const review = await repository.createReview({
            dgfy_account_id: null,
            activity_id: invite.activity_id || null,
            tenant_id: invite.tenant_id,
            item_id: invite.target_type === 'fnb_item' ? invite.target_id : null,
            target_type: invite.target_type,
            target_id: invite.target_id,
            rating,
            comment: String(body.comment || '').trim().slice(0, 2000) || null,
            anonymous: body.anonymous === true,
            reviewer_name: reviewerName,
            reviewer_initials: buildReviewerInitials(reviewerName),
            verified_purchase: true,
            submission_channel: REVIEW_CHANNEL_TYPES.has(String(body.submission_channel || '').trim()) ? String(body.submission_channel).trim() : 'tracking',
            media_json: Array.isArray(body.media) ? body.media.slice(0, 4) : null,
            status: 'pending'
        });
        await repository.markReviewInviteSubmitted({ inviteId: invite.invite_id, reviewId: review.review_id });
        return ok({ review });
    } catch (error) {
        return fail(mapError(error, 'Failed to submit DGFY guest review'));
    }
};

export const buildListDgfyCustomerReviewsForModerationUseCase = ({ repository = dgfyCustomerRepository } = {}) => async ({ query = {} } = {}) => {
    try {
        const result = await repository.listReviewsForModeration({
            status: String(query.status || 'pending').trim().toLowerCase(),
            tenantId: String(query.tenant_id || '').trim() || null,
            targetType: String(query.target_type || '').trim().toLowerCase() || null,
            limit: query.limit,
            page: query.page
        });
        return ok({ reviews: result.rows || [], pagination: result.pagination });
    } catch (error) {
        return fail(mapError(error, 'Failed to load DGFY reviews for moderation'));
    }
};

export const buildModerateDgfyCustomerReviewUseCase = ({ repository = dgfyCustomerRepository } = {}) => async ({ admin = null, reviewId, body = {} } = {}) => {
    try {
        const parsedReviewId = parsePositiveInt(reviewId);
        const status = String(body.status || body.action || '').trim().toLowerCase();
        if (!parsedReviewId || !['approved', 'rejected'].includes(status)) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'review_id and status approved/rejected are required.', { statusCode: 422 });
        }
        const review = await repository.moderateReview({
            reviewId: parsedReviewId,
            status,
            reviewedByAdminId: admin?.id || admin?.user_id || null,
            note: String(body.review_note || body.note || '').trim().slice(0, 2000) || null
        });
        if (!review) {
            throw new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'Review not found.', { statusCode: 404 });
        }
        return ok({ review });
    } catch (error) {
        return fail(mapError(error, 'Failed to moderate DGFY review'));
    }
};

export const buildDgfyHistoricalBackfillUseCase = ({
    repository = dgfyCustomerRepository,
    tenantOrderReader = defaultTenantOrderReader,
    tenantActivityReader = null,
    activityRecorder = recordDgfyOrderActivity
} = {}) => async ({ options = {} } = {}) => {
    const startedAt = new Date();
    const dryRun = options.dryRun !== false;
    const tenantPageSize = safeLimit(options.tenantPageSize, HISTORICAL_BACKFILL_TENANT_PAGE_SIZE, 500);
    const orderBatchSize = safeLimit(options.orderBatchSize, HISTORICAL_BACKFILL_ORDER_BATCH_SIZE, 1000);
    const transactionLimitPerTenant = options.transactionLimitPerTenant === null || options.transactionLimitPerTenant === undefined
        ? null
        : Math.max(1, Number.parseInt(options.transactionLimitPerTenant, 10) || 1);
    const includeInactiveTenants = options.includeInactiveTenants === true;
    const failFast = options.failFast === true;
    const requiredActivityTypes = parseRequiredActivityTypes(options.requiredActivityTypes);
    const readAllTenantActivities = tenantActivityReader || (
        tenantOrderReader === defaultTenantOrderReader ? defaultTenantActivityReader : null
    );
    let run = null;
    const summary = {
        dry_run: dryRun,
        started_at: startedAt.toISOString(),
        completed_at: null,
        tenant_count: 0,
        transaction_count: 0,
        order_count: 0,
        service_booking_count: 0,
        hospitality_booking_count: 0,
        fnb_order_count: 0,
        matched_account_count: 0,
        unmatched_account_count: 0,
        activity_upsert_count: 0,
        loyalty_upsert_count: 0,
        failure_count: 0,
        account_lookup_count: 0,
        tenant_failures: [],
        warnings: []
    };

    try {
        if (typeof repository.createBackfillRun === 'function') {
            try {
                run = await repository.createBackfillRun({ dry_run: dryRun, started_at: startedAt, summary });
            } catch (error) {
                if (!dryRun) throw error;
                summary.warnings.push({
                    code: 'BACKFILL_RUN_LOG_UNAVAILABLE',
                    message: error?.message || 'Backfill run audit table is unavailable; dry-run will continue without a run row.'
                });
            }
        }
        summary.account_lookup_count = 0;

        let offset = 0;
        while (typeof repository.listTenantsForBackfill === 'function') {
            const tenants = await repository.listTenantsForBackfill({
                limit: tenantPageSize,
                offset,
                includeInactive: includeInactiveTenants
            });
            if (!Array.isArray(tenants) || tenants.length === 0) break;
            for (const tenantRaw of tenants) {
                const tenant = typeof tenantRaw?.toJSON === 'function' ? tenantRaw.toJSON() : tenantRaw;
                summary.tenant_count += 1;
                try {
                    const activityRows = readAllTenantActivities
                        ? await readAllTenantActivities({ tenant, batchSize: orderBatchSize, transactionLimit: transactionLimitPerTenant })
                        : {
                            orders: await tenantOrderReader({
                                tenant,
                                batchSize: orderBatchSize,
                                transactionLimit: transactionLimitPerTenant
                            }),
                            serviceBookings: [],
                            hospitalityReservations: [],
                            fnbOrders: []
                        };
                    for (const order of activityRows.orders || []) {
                        summary.transaction_count += 1;
                        summary.order_count += 1;
                        const account = matchAccountForOrder(order);
                        if (account?.id) summary.matched_account_count += 1;
                        else summary.unmatched_account_count += 1;
                        if (!dryRun) {
                            const storeCustomer = order.storeCustomer || {};
                            const beforeLoyalty = summary.loyalty_upsert_count;
                            const activity = await activityRecorder({
                                tenantId: tenant.id,
                                order,
                                storeCustomer: {
                                    customer_id: order.store_customer_id || storeCustomer.customer_id || null,
                                    dgfy_account_id: account?.id || storeCustomer.dgfy_account_id || null,
                                    email: order.customer_email || storeCustomer.email || account?.email || null,
                                    phone: order.customer_phone || storeCustomer.phone || account?.phone || null
                                }
                            });
                            if (activity) summary.activity_upsert_count += 1;
                            if (activity?.dgfy_account_id && activity.status === 'completed') {
                                summary.loyalty_upsert_count = beforeLoyalty + 1;
                            }
                        }
                    }
                    for (const booking of activityRows.serviceBookings || []) {
                        summary.transaction_count += 1;
                        summary.service_booking_count += 1;
                        const account = matchAccountForCustomerRecord(booking);
                        if (account?.id) summary.matched_account_count += 1;
                        else summary.unmatched_account_count += 1;
                        if (!dryRun) {
                            const activity = await repository.upsertActivity(serviceBookingActivityPayload({ tenant, booking, account }));
                            if (activity) summary.activity_upsert_count += 1;
                        }
                    }
                    for (const reservation of activityRows.hospitalityReservations || []) {
                        summary.transaction_count += 1;
                        summary.hospitality_booking_count += 1;
                        const account = matchAccountForCustomerRecord(reservation);
                        if (account?.id) summary.matched_account_count += 1;
                        else summary.unmatched_account_count += 1;
                        if (!dryRun) {
                            const activity = await repository.upsertActivity(hospitalityReservationActivityPayload({ tenant, reservation, account }));
                            if (activity) summary.activity_upsert_count += 1;
                        }
                    }
                    for (const fnbOrder of activityRows.fnbOrders || []) {
                        summary.transaction_count += 1;
                        summary.fnb_order_count += 1;
                        const account = matchAccountForOrder(fnbOrder.posTransaction || fnbOrder);
                        if (account?.id) summary.matched_account_count += 1;
                        else summary.unmatched_account_count += 1;
                        if (!dryRun) {
                            const activity = await repository.upsertActivity(fnbOrderActivityPayload({ tenant, check: fnbOrder, account }));
                            if (activity) summary.activity_upsert_count += 1;
                        }
                    }
                } catch (error) {
                    summary.failure_count += 1;
                    summary.tenant_failures.push({
                        tenant_id: tenant?.id || null,
                        tenant_name: tenant?.name || null,
                        message: error?.message || 'Unknown tenant backfill failure'
                    });
                    if (failFast) throw error;
                }
            }
            if (tenants.length < tenantPageSize) break;
            offset += tenants.length;
        }

        const missingRequiredActivityTypes = requiredActivityTypes
            .filter((activityType) => Number(summary[ACTIVITY_COUNT_KEYS[activityType]] || 0) <= 0);
        if (missingRequiredActivityTypes.length) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'DGFY historical backfill did not discover all required activity types.', {
                statusCode: 422,
                details: {
                    missing_activity_types: missingRequiredActivityTypes,
                    required_activity_types: requiredActivityTypes,
                    summary
                }
            });
        }

        summary.completed_at = new Date().toISOString();
        if (run?.run_id && typeof repository.updateBackfillRun === 'function') {
            run = await repository.updateBackfillRun(run.run_id, {
                status: 'completed',
                completed_at: new Date(summary.completed_at),
                tenant_count: summary.tenant_count,
                transaction_count: summary.transaction_count,
                order_count: summary.order_count,
                service_booking_count: summary.service_booking_count,
                hospitality_booking_count: summary.hospitality_booking_count,
                fnb_order_count: summary.fnb_order_count,
                matched_account_count: summary.matched_account_count,
                activity_upsert_count: summary.activity_upsert_count,
                loyalty_upsert_count: summary.loyalty_upsert_count,
                failure_count: summary.failure_count,
                summary
            });
        }
        return ok({ run, summary });
    } catch (error) {
        summary.completed_at = new Date().toISOString();
        summary.failure_count += 1;
        if (run?.run_id && typeof repository.updateBackfillRun === 'function') {
            await repository.updateBackfillRun(run.run_id, {
                status: 'failed',
                completed_at: new Date(summary.completed_at),
                failure_count: summary.failure_count,
                summary
            }).catch(() => null);
        }
        if (isDomainError(error)) {
            return fail(error);
        }
        return fail(new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to run DGFY historical customer activity backfill', {
            statusCode: error?.statusCode || 500,
            details: {
                cause: error?.message || 'Unknown backfill failure',
                summary
            }
        }));
    }
};

export const buildRequestDgfyTrackingRecoveryUseCase = ({ repository = dgfyCustomerRepository, sender = dgfyEmailDeliveryRepository } = {}) => async ({ body = {} }) => {
    try {
        const lookup = String(body.lookup || body.email || body.phone || '').trim();
        if (lookup.length < 5) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A recovery email or phone is required.', { statusCode: 422 });
        }
        const lookupHash = hashTrackingRecoveryLookup(lookup);
        if (typeof repository.findRecentRecoveryCode === 'function') {
            const recent = await repository.findRecentRecoveryCode({ lookupHash, cooldownSeconds: RECOVERY_COOLDOWN_SECONDS });
            if (recent) {
                return ok(genericRecoveryResponse({ delivery_status: 'cooldown', retry_after_seconds: Math.max(1, RECOVERY_COOLDOWN_SECONDS) }));
            }
        }
        const matches = await repository.listActivitiesByLookup(lookup, 10);
        const deliveryEmail = [...new Set(matches.map((entry) => normalizeEmail(entry.customer_email)).filter((email) => EMAIL_PATTERN.test(email)))][0] || '';
        let devRecoveryCode = null;
        let deliveryStatus = deliveryEmail ? 'pending' : 'not_available';

        if (deliveryEmail) {
            const code = generateRecoveryCode();
            await repository.createRecoveryCode({
                lookup_hash: lookupHash,
                delivery_email: deliveryEmail,
                code_hash: hashRecoveryCode({ lookup, code }),
                max_attempts: Math.max(1, RECOVERY_MAX_ATTEMPTS),
                expires_at: new Date(Date.now() + Math.max(1, RECOVERY_TTL_MINUTES) * 60 * 1000)
            });
            try {
                await sender.sendEmail({
                    to: deliveryEmail,
                    subject: 'Your DGFY order recovery code',
                    html: `<p>Your DGFY order recovery code is <strong>${code}</strong>.</p><p>This code expires in ${Math.max(1, RECOVERY_TTL_MINUTES)} minutes.</p>`,
                    text: `Your DGFY order recovery code is ${code}. This code expires in ${Math.max(1, RECOVERY_TTL_MINUTES)} minutes.`
                });
                deliveryStatus = 'sent';
            } catch {
                deliveryStatus = 'failed';
                if (process.env.NODE_ENV !== 'production') {
                    devRecoveryCode = code;
                }
            }
        }

        return ok(genericRecoveryResponse({
            delivery_status: deliveryStatus,
            ...(devRecoveryCode ? { dev_recovery_code: devRecoveryCode } : {})
        }));
    } catch (error) {
        return fail(mapError(error, 'Failed to request DGFY tracking recovery'));
    }
};

export const buildVerifyDgfyTrackingRecoveryUseCase = ({ repository = dgfyCustomerRepository } = {}) => async ({ body = {} }) => {
    try {
        const lookup = String(body.lookup || body.email || body.phone || '').trim();
        const code = String(body.code || '').trim();
        if (lookup.length < 5 || !/^\d{6}$/.test(code)) {
            throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'A recovery lookup and 6-digit code are required.', { statusCode: 422 });
        }
        const result = await repository.consumePendingRecoveryCode({
            lookupHash: hashTrackingRecoveryLookup(lookup),
            codeHash: hashRecoveryCode({ lookup, code })
        });
        if (result.status !== 'verified') {
            const statusCode = result.status === 'attempts_exceeded' ? 429 : 422;
            throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'Recovery code is invalid or expired.', { statusCode });
        }
        const activities = await repository.listActivitiesByLookup(lookup, 10);
        return ok({ activities: activities.map(publicActivity) });
    } catch (error) {
        return fail(mapError(error, 'Failed to verify DGFY tracking recovery'));
    }
};

export default {
    buildGetDgfyCustomerDashboardUseCase,
    buildListDgfyCustomerActivitiesUseCase,
    buildTrackDgfyCustomerReferenceUseCase,
    buildCancelDgfyCustomerOrderUseCase,
    buildReorderDgfyCustomerOrderUseCase,
    buildManageDgfyCustomerAddressesUseCases,
    buildGetDgfyCustomerLoyaltyUseCase,
    buildSubmitDgfyCustomerReviewUseCase,
    buildValidateDgfyReviewInviteUseCase,
    buildSubmitDgfyGuestReviewInviteUseCase,
    buildListPublicDgfyCustomerReviewsUseCase,
    buildListDgfyCustomerReviewsForModerationUseCase,
    buildModerateDgfyCustomerReviewUseCase,
    buildDgfyHistoricalBackfillUseCase,
    buildRequestDgfyTrackingRecoveryUseCase,
    buildVerifyDgfyTrackingRecoveryUseCase
};
