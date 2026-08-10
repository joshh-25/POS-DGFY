import { posRepository } from '../modules/pos/repositories/posRepository.js';

const toPositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

export const findOwnedOpenShiftForCompanySwitch = async ({ tenantUserId } = {}) => {
    const cashierId = toPositiveInt(tenantUserId);
    if (!cashierId) return null;

    const shift = await posRepository.findOpenTerminalShift({ cashierId });
    if (!shift) return null;

    return {
        shift_id: toPositiveInt(shift.pos_terminal_shift_id),
        terminal_id: String(shift.terminal_id || '').trim() || null,
        location_id: toPositiveInt(shift.location_id),
        cashier_id: toPositiveInt(shift.cashier_id)
    };
};
