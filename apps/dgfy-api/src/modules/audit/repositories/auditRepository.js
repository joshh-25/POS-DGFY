import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (row) => (row && typeof row.get === 'function' ? row.get({ plain: true }) : row);
const positiveInt = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const dateStart = (value) => new Date(`${value}T00:00:00.000Z`);
const dateEnd = (value) => new Date(`${value}T23:59:59.999Z`);
const SECRET_KEY_PATTERN = /(password|passwd|pin|token|secret|authorization|access[_-]?token|refresh[_-]?token)/i;
const AUDIT_SEARCH_FIELDS = [
    'event_type',
    'entity_type',
    'entity_id',
    'action',
    'actor_username',
    'terminal_id',
    'shift_id',
    'location_id',
    'reason',
    'request_id',
    'changes'
];
const AUDIT_SEARCH_ALIASES = Object.freeze({
    order: ['sale', 'transaction', 'checkout', 'parked_sale', 'delivery_job'],
    orders: ['sale', 'transaction', 'checkout', 'parked_sale', 'delivery_job'],
    image: ['photo', 'picture', 'catalog_image', 'item_image'],
    images: ['photo', 'picture', 'catalog_image', 'item_image'],
    cost: ['price', 'amount', 'unit_cost', 'selling_price'],
    confirm: ['confirmed', 'approved', 'completed', 'checkout'],
    confirming: ['confirmed', 'approved', 'completed', 'checkout'],
    reject: ['rejected', 'declined', 'cancelled', 'failed'],
    rejected: ['reject', 'declined', 'cancelled', 'failed']
});
const parseJsonObject = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
};
const scrubSecrets = (value, depth = 0) => {
    if (depth > 10) return null;
    if (Array.isArray(value)) return value.map((entry) => scrubSecrets(entry, depth + 1));
    if (!value || typeof value !== 'object') return value;
    return Object.entries(value).reduce((safe, [key, entry]) => {
        if (!SECRET_KEY_PATTERN.test(key)) safe[key] = scrubSecrets(entry, depth + 1);
        return safe;
    }, {});
};

const buildWhere = (query = {}) => {
    const where = {};
    const addLike = (key, value) => {
        const normalized = String(value || '').trim();
        if (normalized) where[key] = { [Op.like]: `%${normalized}%` };
    };
    if (query.event_type) addLike('event_type', query.event_type);
    if (query.action) where.action = query.action;
    if (query.entity_type) addLike('entity_type', query.entity_type);
    if (query.user_id) where.user_id = positiveInt(query.user_id);
    if (query.terminal_id) addLike('terminal_id', query.terminal_id);
    if (query.shift_id) where.shift_id = positiveInt(query.shift_id);
    if (query.date_from || query.date_to) {
        where.timestamp = {};
        if (query.date_from) where.timestamp[Op.gte] = dateStart(query.date_from);
        if (query.date_to) where.timestamp[Op.lte] = dateEnd(query.date_to);
    }
    const searchTerms = String(query.search || '')
        .trim()
        .split(/\s+/)
        .map((term) => term.trim())
        .filter(Boolean);
    if (searchTerms.length > 0) {
        where[Op.and] = searchTerms.map((term) => {
            const searchTokens = [term, ...(AUDIT_SEARCH_ALIASES[term.toLowerCase()] || [])];
            return {
                [Op.or]: searchTokens.flatMap((token) => AUDIT_SEARCH_FIELDS.map((field) => ({
                    [field]: { [Op.like]: `%${token}%` }
                })))
            };
        });
    }

    // GET /pos/device/status is read-only health telemetry. Older builds wrote
    // one VIEW row for every status check, which buried meaningful cashier
    // actions under thousands of repeated bridge entries. Keep those rows in
    // the database for diagnostics, but omit them from the human audit feed.
    where[Op.and] = [
        ...(Array.isArray(where[Op.and]) ? where[Op.and] : []),
        {
            [Op.or]: [
                { entity_type: { [Op.ne]: 'pos_device_bridge' } },
                { entity_type: 'pos_device_bridge', action: { [Op.ne]: 'VIEW' } }
            ]
        }
    ];
    return where;
};

const serialize = (row) => {
    const plain = toPlain(row) || {};
    const changes = scrubSecrets(parseJsonObject(plain.changes));
    return {
        log_id: plain.log_id,
        event_type: plain.event_type || changes.event || changes.event_type || changes.operation || `${plain.entity_type}.${String(plain.action || '').toLowerCase()}`,
        action: plain.action,
        entity_type: plain.entity_type,
        entity_id: plain.entity_id,
        actor: {
            user_id: plain.user_id || null,
            username: plain.actor_username || plain.user?.username || null,
            email: plain.user?.email || null
        },
        terminal_id: plain.terminal_id || changes.terminal_id || null,
        shift_id: plain.shift_id || changes.shift_id || null,
        location_id: plain.location_id || changes.location_id || null,
        reason: plain.reason || changes.reason || changes.void_reason || changes.cancel_reason || null,
        request_id: plain.request_id || changes.request_id || null,
        changes,
        timestamp: plain.timestamp || null
    };
};

export const auditRepository = {
    async list(query = {}) {
        const AuditLog = dbStore.get('AuditLog');
        const User = dbStore.get('User');
        if (!AuditLog) throw new Error('AuditLog model is unavailable');
        const page = positiveInt(query.page) || 1;
        const limit = Math.min(100, positiveInt(query.limit) || 25);
        const result = await AuditLog.findAndCountAll({
            where: buildWhere(query),
            include: User ? [{ model: User, as: 'user', attributes: ['user_id', 'username', 'email'], required: false }] : [],
            order: [['timestamp', 'DESC'], ['log_id', 'DESC']],
            limit,
            offset: (page - 1) * limit,
            distinct: true
        });
        const total = Number(result.count || 0);
        return {
            logs: (result.rows || []).map(serialize),
            pagination: {
                page,
                limit,
                total,
                total_pages: Math.max(1, Math.ceil(total / limit))
            }
        };
    }
};
