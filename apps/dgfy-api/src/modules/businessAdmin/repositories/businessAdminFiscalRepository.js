import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';

const toPlain = (value) => (
    value && typeof value.toJSON === 'function' ? value.toJSON() : value
);

const parseJson = (value, fallback = {}) => {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string') return fallback;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
        return fallback;
    }
};

const buildLocationWhere = ({ branchId = null, allowedLocationIds = null } = {}) => {
    if (branchId) return branchId;
    if (Array.isArray(allowedLocationIds)) return { [Op.in]: allowedLocationIds };
    return undefined;
};

const listMonthTokens = (dateFrom, dateTo) => {
    const start = new Date(`${dateFrom}T00:00:00.000Z`);
    const end = new Date(`${dateTo}T00:00:00.000Z`);
    const tokens = [];
    for (let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
        tokens.push(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    return tokens;
};

const normalizeSnapshot = (row, locationNames) => {
    const value = toPlain(row) || {};
    const locationId = value.location_id == null ? null : Number(value.location_id);
    const summary = parseJson(value.summary);
    return {
        snapshot_id: value.pos_z_reading_snapshot_id || null,
        business_date: value.business_date || null,
        location_id: locationId,
        location_name: locationId ? locationNames.get(locationId) || `Branch ${locationId}` : null,
        reading_identifier: value.reading_identifier || null,
        z_counter_value: value.z_counter_value == null ? null : Number(value.z_counter_value),
        reset_counter_value: value.reset_counter_value == null ? null : Number(value.reset_counter_value),
        lifetime_grand_total_cents: value.lifetime_grand_total_cents == null ? null : Number(value.lifetime_grand_total_cents),
        summary,
        closed_by_user_id: value.closed_by_user_id || null,
        closed_from_terminal_id: value.closed_from_terminal_id || null,
        day_close_pin_confirmed_at: value.day_close_pin_confirmed_at || null,
        generated_at: value.generated_at || null,
        immutable: true,
        source: 'pos_z_reading_snapshots'
    };
};

const normalizeESalesReport = (row) => {
    const value = toPlain(row) || {};
    return {
        report_id: value.pos_esales_report_id || null,
        report_month: value.report_month || null,
        status: value.status || null,
        payload_hash: value.payload_hash || null,
        evidence_ref: value.evidence_ref || null,
        generated_by: value.generated_by || null,
        submitted_by: value.submitted_by || null,
        submitted_at: value.submitted_at || null,
        status_evidence_ref: value.status_evidence_ref || null,
        status_note: value.status_note || null,
        source: 'pos_esales_reports'
    };
};

const buildDayWindow = (businessDate) => {
    const startAt = new Date(`${businessDate}T00:00:00.000+08:00`);
    return {
        startAt,
        endAt: new Date(startAt.getTime() + (24 * 60 * 60 * 1000))
    };
};

export const businessAdminFiscalRepository = {
    async getFiscalWorkspace({
        dateFrom,
        dateTo,
        branchId = null,
        terminalId = null,
        allowedLocationIds = null,
        posRepository
    } = {}) {
        const PosZReadingSnapshot = dbStore.get('PosZReadingSnapshot');
        const PosESalesReport = dbStore.get('PosESalesReport');
        const TenantLocation = dbStore.get('TenantLocation');
        const locationWhere = buildLocationWhere({ branchId, allowedLocationIds });
        const snapshotWhere = {
            business_date: { [Op.between]: [dateFrom, dateTo] },
            reading_identifier: { [Op.like]: 'ZR-%' }
        };
        if (locationWhere !== undefined) snapshotWhere.location_id = locationWhere;

        const [snapshots, locations, esalesRows] = await Promise.all([
            PosZReadingSnapshot.findAll({
                where: snapshotWhere,
                order: [['business_date', 'DESC'], ['generated_at', 'DESC'], ['pos_z_reading_snapshot_id', 'DESC']],
                raw: true
            }),
            TenantLocation.findAll({
                where: locationWhere === undefined ? {} : { location_id: locationWhere },
                attributes: ['location_id', 'name'],
                raw: true
            }),
            PosESalesReport
                ? PosESalesReport.findAll({
                    where: { report_month: { [Op.in]: listMonthTokens(dateFrom, dateTo) } },
                    order: [['report_month', 'DESC'], ['pos_esales_report_id', 'DESC']],
                    raw: true
                })
                : []
        ]);

        const locationNames = new Map(locations.map((location) => [Number(location.location_id), location.name]));
        const summaryLocations = branchId
            ? [branchId]
            : (Array.isArray(allowedLocationIds) ? allowedLocationIds : [null]);
        const { startAt, endAt } = buildDayWindow(dateTo);
        const xReadings = await Promise.all(summaryLocations.map(async (locationId) => {
            const summary = typeof posRepository?.getZReadingSummary === 'function'
                ? await posRepository.getZReadingSummary({ startAt, endAt, terminalId, locationId })
                : null;
            return {
                business_date: dateTo,
                location_id: locationId,
                location_name: locationId ? locationNames.get(Number(locationId)) || `Branch ${locationId}` : null,
                terminal_id: terminalId || null,
                generated_at: new Date().toISOString(),
                reading_identifier: `XR-${String(dateTo).replace(/-/g, '')}`,
                summary: summary || {},
                snapshot_persisted: false,
                immutable: false,
                source: 'pos_z_reading_summary'
            };
        }));

        return {
            current_x_readings: xReadings,
            z_readings: snapshots.map((row) => normalizeSnapshot(row, locationNames)),
            esales_reports: esalesRows.map(normalizeESalesReport),
            filters: {
                date_from: dateFrom,
                date_to: dateTo,
                branch_id: branchId,
                terminal_id: terminalId || null
            },
            meta: {
                timezone: 'Asia/Manila',
                source: 'pos_fiscal_read_models',
                as_of: new Date().toISOString(),
                read_only: true
            }
        };
    }
};
