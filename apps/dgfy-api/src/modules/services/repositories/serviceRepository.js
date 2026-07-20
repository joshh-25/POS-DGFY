import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { buildVisibleWhere } from '../../../utils/softDeletePolicy.js';

const toPlain = (row) => (
    row && typeof row.toJSON === 'function'
        ? row.toJSON()
        : row
);

const toPositiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const isMissingStorefrontLocationItemOverrideTableError = (error) => {
    if (!error) return false;
    const code = error.original?.code || error.parent?.code || error.code;
    const message = String(error.original?.sqlMessage || error.parent?.sqlMessage || error.message || '');
    return code === 'ER_NO_SUCH_TABLE' && message.includes('storefront_location_item_overrides');
};

const loadStorefrontLocationAvailabilityMap = async (itemIds = [], locationId = null, options = {}) => {
    const normalizedLocationId = toPositiveInt(locationId);
    const normalizedItemIds = [...new Set((Array.isArray(itemIds) ? itemIds : [])
        .map((itemId) => toPositiveInt(itemId))
        .filter(Boolean))];
    if (!normalizedLocationId || normalizedItemIds.length === 0) return new Map();

    const StorefrontLocationItemOverride = dbStore.get('StorefrontLocationItemOverride');
    if (!StorefrontLocationItemOverride?.findAll) return new Map();

    try {
        const rows = await StorefrontLocationItemOverride.findAll({
            where: {
                item_id: { [Op.in]: normalizedItemIds },
                location_id: normalizedLocationId
            },
            attributes: ['item_id', 'storefront_available'],
            transaction: options.transaction
        });
        return new Map((rows || []).map((row) => {
            const payload = toPlain(row);
            return [Number(payload.item_id), payload.storefront_available !== false];
        }));
    } catch (error) {
        if (isMissingStorefrontLocationItemOverrideTableError(error)) return new Map();
        throw error;
    }
};

const applyStorefrontLocationAvailability = async (rows = [], locationId = null, options = {}) => {
    const normalizedLocationId = toPositiveInt(locationId);
    if (!normalizedLocationId || !Array.isArray(rows) || rows.length === 0) return rows;

    const availabilityMap = await loadStorefrontLocationAvailabilityMap(
        rows.map((row) => Number(row?.item_id)),
        normalizedLocationId,
        options
    );
    return rows.filter((row) => availabilityMap.get(Number(row?.item_id)) !== false);
};

const serviceItemInclude = () => ([
    {
        model: dbStore.get('ServiceItemDetail'),
        as: 'serviceDetail',
        required: true
    }
]);

const bookingInclude = () => ([
    {
        model: dbStore.get('Item'),
        as: 'serviceItem',
        attributes: ['item_id', 'sku_code', 'name', 'description', 'default_sale_price', 'vat_type', 'unit_of_measure'],
        include: [
            {
                model: dbStore.get('ServiceItemDetail'),
                as: 'serviceDetail',
                required: false
            }
        ]
    },
    {
        model: dbStore.get('ServiceResource'),
        as: 'resource',
        required: false
    },
    {
        model: dbStore.get('TenantLocation'),
        as: 'location',
        required: false,
        attributes: ['location_id', 'name', 'address_line']
    },
    {
        model: dbStore.get('StoreCustomer'),
        as: 'storeCustomer',
        required: false,
        attributes: ['customer_id', 'email', 'name', 'phone']
    },
    {
        model: dbStore.get('PosTransaction'),
        as: 'posTransaction',
        required: false,
        attributes: ['pos_transaction_id', 'invoice_number', 'tracking_pin', 'payment_type', 'total_amount', 'document_type', 'document_context']
    }
]);

const holdInclude = () => ([
    {
        model: dbStore.get('Item'),
        as: 'serviceItem',
        attributes: ['item_id', 'sku_code', 'name', 'description', 'default_sale_price', 'vat_type', 'unit_of_measure'],
        include: [
            {
                model: dbStore.get('ServiceItemDetail'),
                as: 'serviceDetail',
                required: false
            }
        ]
    },
    {
        model: dbStore.get('ServiceResource'),
        as: 'resource',
        required: false
    },
    {
        model: dbStore.get('TenantLocation'),
        as: 'location',
        required: false,
        attributes: ['location_id', 'name', 'address_line']
    }
]);

const assignmentInclude = () => ([
    {
        model: dbStore.get('Item'),
        as: 'item',
        required: false,
        attributes: ['item_id', 'name', 'sku_code']
    },
    {
        model: dbStore.get('ServiceResource'),
        as: 'resource',
        required: false
    },
    {
        model: dbStore.get('TenantLocation'),
        as: 'location',
        required: false,
        attributes: ['location_id', 'name', 'address_line']
    },
    {
        model: dbStore.get('User'),
        as: 'providerUser',
        required: false,
        attributes: ['user_id', 'username', 'email']
    }
]);

const waitlistInclude = () => ([
    {
        model: dbStore.get('Item'),
        as: 'serviceItem',
        required: false,
        attributes: ['item_id', 'name', 'sku_code', 'default_sale_price']
    },
    {
        model: dbStore.get('StoreCustomer'),
        as: 'storeCustomer',
        required: false,
        attributes: ['customer_id', 'email', 'name', 'phone']
    }
]);

const reminderInclude = () => ([
    {
        model: dbStore.get('ServiceBooking'),
        as: 'booking',
        required: false,
        include: bookingInclude()
    }
]);

export const serviceRepository = {
    async beginTransaction() {
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        return sequelize.transaction();
    },

    async getSettingsByKeys(keys = [], options = {}) {
        const SystemSetting = dbStore.get('SystemSetting');
        const normalizedKeys = Array.isArray(keys)
            ? keys.map((key) => String(key || '').trim()).filter(Boolean)
            : [];
        if (!SystemSetting || normalizedKeys.length === 0) return [];

        const rows = await SystemSetting.findAll({
            where: {
                setting_key: { [Op.in]: normalizedKeys }
            },
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async listServiceCatalog({ search = '', storefrontOnly = false, posOnly = false, limit = 200, location_id = null } = {}, options = {}) {
        const Item = dbStore.get('Item');
        const where = buildVisibleWhere(
            { category: 'service' },
            { statusField: 'status', excludeInactiveStatus: true }
        );
        const normalizedSearch = String(search || '').trim();
        if (normalizedSearch) {
            where[Op.or] = [
                { name: { [Op.like]: `%${normalizedSearch}%` } },
                { sku_code: { [Op.like]: `%${normalizedSearch}%` } },
                { description: { [Op.like]: `%${normalizedSearch}%` } }
            ];
        }

        const detailWhere = {};
        if (storefrontOnly) detailWhere.visible_in_storefront = true;
        if (posOnly) detailWhere.visible_in_pos = true;

        const rows = await Item.findAll({
            where,
            attributes: [
                'item_id',
                'sku_code',
                'name',
                'category',
                'description',
                'unit_of_measure',
                'current_stock',
                'default_sale_price',
                'cost_per_unit',
                'vat_type',
                'status'
            ],
            include: [
                {
                    model: dbStore.get('ServiceItemDetail'),
                    as: 'serviceDetail',
                    required: true,
                    where: detailWhere
                }
            ],
            order: [['name', 'ASC']],
            limit: Math.min(Number.parseInt(limit, 10) || 200, 500),
            transaction: options.transaction
        });

        const plainRows = rows.map(toPlain);
        return storefrontOnly
            ? applyStorefrontLocationAvailability(plainRows, location_id, options)
            : plainRows;
    },

    async findServiceItemById(itemId, options = {}) {
        const Item = dbStore.get('Item');
        const row = await Item.findOne({
            where: buildVisibleWhere(
                { item_id: itemId, category: 'service' },
                { statusField: 'status', excludeInactiveStatus: true }
            ),
            include: serviceItemInclude(),
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        const payload = toPlain(row);
        if (!payload || !options.storefrontLocationId) return payload;

        const availableRows = await applyStorefrontLocationAvailability(
            [payload],
            options.storefrontLocationId,
            options
        );
        return availableRows[0] || null;
    },
    async isServiceItemAvailableForStorefrontLocation(itemId, locationId, options = {}) {
        const normalizedItemId = toPositiveInt(itemId);
        const normalizedLocationId = toPositiveInt(locationId);
        if (!normalizedItemId || !normalizedLocationId) return true;
        const availableRows = await applyStorefrontLocationAvailability(
            [{ item_id: normalizedItemId }],
            normalizedLocationId,
            options
        );
        return availableRows.length > 0;
    },

    async createServiceItem(payload = {}, options = {}) {
        const Item = dbStore.get('Item');
        const row = await Item.create(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async updateServiceItem(itemId, payload = {}, options = {}) {
        const Item = dbStore.get('Item');
        const row = await Item.findOne({
            where: buildVisibleWhere(
                { item_id: itemId, category: 'service' },
                { statusField: 'status', excludeInactiveStatus: false }
            ),
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async upsertServiceDetail(itemId, payload = {}, options = {}) {
        const ServiceItemDetail = dbStore.get('ServiceItemDetail');
        const existing = await ServiceItemDetail.findOne({
            where: { item_id: itemId },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (existing) {
            await existing.update(payload, { transaction: options.transaction });
            return toPlain(existing);
        }
        const created = await ServiceItemDetail.create({
            ...payload,
            item_id: itemId
        }, { transaction: options.transaction });
        return toPlain(created);
    },

    async listResources({ includeInactive = false } = {}, options = {}) {
        const ServiceResource = dbStore.get('ServiceResource');
        const where = includeInactive ? {} : { is_active: true };
        const rows = await ServiceResource.findAll({
            where,
            order: [['resource_type', 'ASC'], ['name', 'ASC']],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async createResource(payload = {}, options = {}) {
        const ServiceResource = dbStore.get('ServiceResource');
        const row = await ServiceResource.create(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async findResourceById(resourceId, options = {}) {
        const ServiceResource = dbStore.get('ServiceResource');
        const row = await ServiceResource.findByPk(resourceId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async listActiveAssignmentsForService(itemId, options = {}) {
        const ServiceProviderAssignment = dbStore.get('ServiceProviderAssignment');
        const rows = await ServiceProviderAssignment.findAll({
            where: {
                item_id: itemId,
                is_active: true
            },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlain);
    },

    async listAssignments({ includeInactive = false, itemId = null } = {}, options = {}) {
        const ServiceProviderAssignment = dbStore.get('ServiceProviderAssignment');
        const where = {};
        if (!includeInactive) where.is_active = true;
        if (itemId) where.item_id = itemId;
        const rows = await ServiceProviderAssignment.findAll({
            where,
            include: assignmentInclude(),
            order: [['item_id', 'ASC'], ['assignment_id', 'ASC']],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async createAssignment(payload = {}, options = {}) {
        const ServiceProviderAssignment = dbStore.get('ServiceProviderAssignment');
        const row = await ServiceProviderAssignment.create(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async updateAssignmentById(assignmentId, payload = {}, options = {}) {
        const ServiceProviderAssignment = dbStore.get('ServiceProviderAssignment');
        const row = await ServiceProviderAssignment.findByPk(assignmentId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async findStoreCustomerByEmail(email, options = {}) {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!normalizedEmail) return null;
        const StoreCustomer = dbStore.get('StoreCustomer');
        const row = await StoreCustomer.findOne({
            where: { email: normalizedEmail },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async isBookingReferenceTaken(publicReference, options = {}) {
        const ServiceBooking = dbStore.get('ServiceBooking');
        const row = await ServiceBooking.findOne({
            where: { public_reference: publicReference },
            attributes: ['booking_id'],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return Boolean(row);
    },

    async findConflictingBookings({
        providerUserId = null,
        resourceId = null,
        locationId = null,
        startAt,
        endAt,
        excludeBookingId = null
    } = {}, options = {}) {
        const ServiceBooking = dbStore.get('ServiceBooking');
        const or = [];
        if (providerUserId) or.push({ provider_user_id: providerUserId });
        if (resourceId) or.push({ resource_id: resourceId });
        if (locationId && !providerUserId && !resourceId) or.push({ location_id: locationId });
        if (or.length === 0) return [];

        const where = {
            status: { [Op.in]: ['requested', 'confirmed', 'checked_in', 'in_service'] },
            start_at: { [Op.lt]: endAt },
            end_at: { [Op.gt]: startAt },
            [Op.or]: or
        };
        if (excludeBookingId) where.booking_id = { [Op.ne]: excludeBookingId };

        const rows = await ServiceBooking.findAll({
            where,
            order: [['start_at', 'ASC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlain);
    },

    async findAvailabilityConflicts({
        serviceItemId = null,
        providerUserIds = [],
        resourceIds = [],
        locationIds = [],
        startAt,
        endAt
    } = {}, options = {}) {
        const ServiceBooking = dbStore.get('ServiceBooking');
        const or = [];
        const normalizedProviderIds = [...new Set(providerUserIds.map((id) => Number(id)).filter(Boolean))];
        const normalizedResourceIds = [...new Set(resourceIds.map((id) => Number(id)).filter(Boolean))];
        const normalizedLocationIds = [...new Set(locationIds.map((id) => Number(id)).filter(Boolean))];
        if (normalizedProviderIds.length > 0) or.push({ provider_user_id: { [Op.in]: normalizedProviderIds } });
        if (normalizedResourceIds.length > 0) or.push({ resource_id: { [Op.in]: normalizedResourceIds } });
        if (normalizedLocationIds.length > 0) or.push({ location_id: { [Op.in]: normalizedLocationIds } });
        if (or.length === 0) return [];

        const where = {
            status: { [Op.in]: ['requested', 'confirmed', 'checked_in', 'in_service'] },
            start_at: { [Op.lt]: endAt },
            end_at: { [Op.gt]: startAt },
            [Op.or]: or
        };
        if (serviceItemId) where.service_item_id = serviceItemId;

        const rows = await ServiceBooking.findAll({
            where,
            order: [['start_at', 'ASC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlain);
    },

    async findConflictingHolds({
        providerUserId = null,
        resourceId = null,
        locationId = null,
        startAt,
        endAt,
        excludeHoldId = null
    } = {}, options = {}) {
        const ServiceBookingHold = dbStore.get('ServiceBookingHold');
        const or = [];
        if (providerUserId) or.push({ provider_user_id: providerUserId });
        if (resourceId) or.push({ resource_id: resourceId });
        if (locationId && !providerUserId && !resourceId) or.push({ location_id: locationId });
        if (or.length === 0) return [];

        const where = {
            status: 'active',
            expires_at: { [Op.gt]: new Date() },
            start_at: { [Op.lt]: endAt },
            end_at: { [Op.gt]: startAt },
            [Op.or]: or
        };
        if (excludeHoldId) where.hold_id = { [Op.ne]: excludeHoldId };

        const rows = await ServiceBookingHold.findAll({
            where,
            order: [['start_at', 'ASC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlain);
    },

    async findAvailabilityHoldConflicts({
        providerUserIds = [],
        resourceIds = [],
        locationIds = [],
        startAt,
        endAt
    } = {}, options = {}) {
        const ServiceBookingHold = dbStore.get('ServiceBookingHold');
        const or = [];
        const normalizedProviderIds = [...new Set(providerUserIds.map((id) => Number(id)).filter(Boolean))];
        const normalizedResourceIds = [...new Set(resourceIds.map((id) => Number(id)).filter(Boolean))];
        const normalizedLocationIds = [...new Set(locationIds.map((id) => Number(id)).filter(Boolean))];
        if (normalizedProviderIds.length > 0) or.push({ provider_user_id: { [Op.in]: normalizedProviderIds } });
        if (normalizedResourceIds.length > 0) or.push({ resource_id: { [Op.in]: normalizedResourceIds } });
        if (normalizedLocationIds.length > 0) or.push({ location_id: { [Op.in]: normalizedLocationIds } });
        if (or.length === 0) return [];

        const rows = await ServiceBookingHold.findAll({
            where: {
                status: 'active',
                expires_at: { [Op.gt]: new Date() },
                start_at: { [Op.lt]: endAt },
                end_at: { [Op.gt]: startAt },
                [Op.or]: or
            },
            order: [['start_at', 'ASC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlain);
    },

    async createBookingHold(payload = {}, options = {}) {
        const ServiceBookingHold = dbStore.get('ServiceBookingHold');
        const row = await ServiceBookingHold.create(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async findActiveHoldByToken(holdToken, options = {}) {
        const normalized = String(holdToken || '').trim();
        if (!normalized) return null;
        const ServiceBookingHold = dbStore.get('ServiceBookingHold');
        const row = await ServiceBookingHold.findOne({
            where: {
                hold_token: normalized,
                status: 'active',
                expires_at: { [Op.gt]: new Date() }
            },
            include: holdInclude(),
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async findHoldsByIdempotencyKey(idempotencyKey, options = {}) {
        const normalized = String(idempotencyKey || '').trim();
        if (!normalized) return [];
        const ServiceBookingHold = dbStore.get('ServiceBookingHold');
        const rows = await ServiceBookingHold.findAll({
            where: { idempotency_key: normalized },
            include: holdInclude(),
            order: [['hold_id', 'ASC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlain);
    },

    async updateHoldById(holdId, payload = {}, options = {}) {
        const ServiceBookingHold = dbStore.get('ServiceBookingHold');
        const row = await ServiceBookingHold.findByPk(holdId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async createBooking(payload = {}, options = {}) {
        const ServiceBooking = dbStore.get('ServiceBooking');
        const row = await ServiceBooking.create(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async findBookingsByIdempotencyKey(idempotencyKey, options = {}) {
        const normalized = String(idempotencyKey || '').trim();
        if (!normalized) return [];
        const ServiceBooking = dbStore.get('ServiceBooking');
        const rows = await ServiceBooking.findAll({
            where: { idempotency_key: normalized },
            include: bookingInclude(),
            order: [['booking_id', 'ASC']],
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlain);
    },

    async getBookingById(bookingId, options = {}) {
        const ServiceBooking = dbStore.get('ServiceBooking');
        const row = await ServiceBooking.findByPk(bookingId, {
            include: bookingInclude(),
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async getBookingByReference(publicReference, options = {}) {
        const ServiceBooking = dbStore.get('ServiceBooking');
        const row = await ServiceBooking.findOne({
            where: { public_reference: String(publicReference || '').trim().toUpperCase() },
            include: bookingInclude(),
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async listBookings(query = {}, options = {}) {
        const ServiceBooking = dbStore.get('ServiceBooking');
        const where = {};
        const status = String(query.status || '').trim();
        if (status) where.status = status;
        const statuses = String(query.statuses || '').split(',').map((entry) => entry.trim()).filter(Boolean);
        if (statuses.length > 0) {
            where.status = { [Op.in]: statuses };
        }
        const customerId = Number.parseInt(query.store_customer_id, 10);
        if (Number.isInteger(customerId) && customerId > 0) {
            where.store_customer_id = customerId;
        }
        const rows = await ServiceBooking.findAll({
            where,
            include: bookingInclude(),
            order: [['start_at', 'DESC']],
            limit: Math.min(Number.parseInt(query.limit, 10) || 100, 300),
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async getDashboardMetrics(options = {}) {
        const ServiceBooking = dbStore.get('ServiceBooking');
        const now = new Date();
        const todayKey = now.toISOString().slice(0, 10);
        const next24Hours = new Date(now.getTime() + (24 * 60 * 60 * 1000));
        const activeStatuses = ['requested', 'confirmed', 'checked_in', 'in_service'];
        const rows = await ServiceBooking.findAll({
            where: {
                status: { [Op.in]: activeStatuses }
            },
            include: bookingInclude(),
            order: [['start_at', 'ASC']],
            limit: 2000,
            transaction: options.transaction
        });
        const bookings = rows.map(toPlain);
        return bookings.reduce((acc, booking) => {
            const amount = Number(booking?.serviceItem?.default_sale_price || 0) * Math.max(1, Number(booking?.quantity || 1));
            const startAt = new Date(booking.start_at);
            const startsInFuture = startAt.getTime() >= now.getTime();
            const startsToday = Number.isFinite(startAt.getTime()) && startAt.toISOString().slice(0, 10) === todayKey;
            if (startsInFuture) {
                acc.future_bookings += 1;
                acc.expected_revenue += amount;
            }
            if (startsToday) {
                acc.today_bookings += 1;
            }
            if (booking.status === 'checked_in') {
                acc.checked_in_count += 1;
            }
            if (booking.status === 'in_service') {
                acc.in_service_count += 1;
            }
            if (
                startsInFuture
                && startAt.getTime() <= next24Hours.getTime()
                && (booking.customer_email || booking.customer_phone)
            ) {
                acc.reminders_due += 1;
            }
            if (startAt.getTime() < now.getTime() && ['requested', 'confirmed'].includes(booking.status)) {
                acc.overdue_no_show_candidates += 1;
            }
            if (booking.payment_timing === 'postpaid' && booking.payment_status === 'unpaid') {
                acc.postpaid_aging_total += amount;
            }
            return acc;
        }, {
            future_bookings: 0,
            today_bookings: 0,
            checked_in_count: 0,
            in_service_count: 0,
            reminders_due: 0,
            overdue_no_show_candidates: 0,
            expected_revenue: 0,
            postpaid_aging_total: 0
        });
    },

    async updateBookingById(bookingId, payload = {}, options = {}) {
        const ServiceBooking = dbStore.get('ServiceBooking');
        const row = await ServiceBooking.findByPk(bookingId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async listWaitlistEntries({ status = '', limit = 100 } = {}, options = {}) {
        const ServiceWaitlistEntry = dbStore.get('ServiceWaitlistEntry');
        const where = {};
        if (status) where.status = status;
        const rows = await ServiceWaitlistEntry.findAll({
            where,
            include: waitlistInclude(),
            order: [['created_at', 'DESC']],
            limit: Math.min(Number.parseInt(limit, 10) || 100, 300),
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async createWaitlistEntry(payload = {}, options = {}) {
        const ServiceWaitlistEntry = dbStore.get('ServiceWaitlistEntry');
        const row = await ServiceWaitlistEntry.create(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async updateWaitlistEntryById(waitlistEntryId, payload = {}, options = {}) {
        const ServiceWaitlistEntry = dbStore.get('ServiceWaitlistEntry');
        const row = await ServiceWaitlistEntry.findByPk(waitlistEntryId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async listClientHistory({ limit = 100 } = {}, options = {}) {
        const ServiceBooking = dbStore.get('ServiceBooking');
        const rows = await ServiceBooking.findAll({
            include: bookingInclude(),
            order: [['start_at', 'DESC']],
            limit: Math.min(Number.parseInt(limit, 10) || 100, 300),
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async countWaitlistByStatus(options = {}) {
        const ServiceWaitlistEntry = dbStore.get('ServiceWaitlistEntry');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const rows = await ServiceWaitlistEntry.findAll({
            attributes: [
                'status',
                [sequelize.fn('COUNT', sequelize.col('waitlist_entry_id')), 'count']
            ],
            group: ['status'],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    },

    async listReminderOutbox({ status = '', limit = 100 } = {}, options = {}) {
        const ServiceReminderOutbox = dbStore.get('ServiceReminderOutbox');
        const where = {};
        if (status) where.status = status;
        const rows = await ServiceReminderOutbox.findAll({
            where,
            include: reminderInclude(),
            order: [['scheduled_for', 'ASC'], ['reminder_id', 'ASC']],
            limit: Math.min(Number.parseInt(limit, 10) || 100, 300),
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlain);
    },

    async listReminderCandidateBookings({ from = new Date(), to = new Date(Date.now() + 24 * 60 * 60 * 1000), limit = 200 } = {}, options = {}) {
        const ServiceBooking = dbStore.get('ServiceBooking');
        const rows = await ServiceBooking.findAll({
            where: {
                status: { [Op.in]: ['requested', 'confirmed'] },
                start_at: { [Op.gte]: from, [Op.lte]: to },
                [Op.or]: [
                    { customer_email: { [Op.ne]: null } },
                    { customer_phone: { [Op.ne]: null } }
                ]
            },
            include: bookingInclude(),
            order: [['start_at', 'ASC']],
            limit: Math.min(Number.parseInt(limit, 10) || 200, 300),
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return rows.map(toPlain);
    },

    async findReminderByBookingChannelType({ bookingId, channel, reminderType } = {}, options = {}) {
        const ServiceReminderOutbox = dbStore.get('ServiceReminderOutbox');
        const row = await ServiceReminderOutbox.findOne({
            where: {
                booking_id: bookingId,
                channel,
                reminder_type: reminderType
            },
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        return toPlain(row);
    },

    async createReminder(payload = {}, options = {}) {
        const ServiceReminderOutbox = dbStore.get('ServiceReminderOutbox');
        const row = await ServiceReminderOutbox.create(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async updateReminderById(reminderId, payload = {}, options = {}) {
        const ServiceReminderOutbox = dbStore.get('ServiceReminderOutbox');
        const row = await ServiceReminderOutbox.findByPk(reminderId, {
            transaction: options.transaction,
            lock: options.lock && options.transaction ? options.transaction.LOCK.UPDATE : undefined
        });
        if (!row) return null;
        await row.update(payload, { transaction: options.transaction });
        return toPlain(row);
    },

    async countBookingsByStatus(options = {}) {
        const ServiceBooking = dbStore.get('ServiceBooking');
        const sequelize = dbStore.getStore()?.sequelize || dbStore.get('sequelize');
        const rows = await ServiceBooking.findAll({
            attributes: [
                'status',
                [sequelize.fn('COUNT', sequelize.col('booking_id')), 'count']
            ],
            group: ['status'],
            transaction: options.transaction
        });
        return rows.map(toPlain);
    }
};
