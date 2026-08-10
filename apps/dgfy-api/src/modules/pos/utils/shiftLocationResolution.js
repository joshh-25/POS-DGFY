const RESOLUTION_SOURCE = Object.freeze({
    TRANSACTION_UNIQUE_LOCATION: 'transaction_unique_location',
    TERMINAL_HOME_LOCATION: 'terminal_home_location',
    TENANT_PRIMARY_LOCATION: 'tenant_primary_location',
    ACTIVE_LOCATION_FALLBACK: 'active_location_fallback',
    NO_RESOLUTION: 'no_resolution'
});

const LOW_CONFIDENCE_RESOLUTION_SOURCES = new Set([
    RESOLUTION_SOURCE.ACTIVE_LOCATION_FALLBACK,
    RESOLUTION_SOURCE.NO_RESOLUTION
]);

const toPositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

export const resolveShiftLocationCandidate = ({
    txDistinctLocationCount = 0,
    txLocationId = null,
    terminalHomeLocationId = null,
    tenantPrimaryLocationId = null,
    activeLocationFallbackId = null
} = {}) => {
    const txDistinctCount = Number.parseInt(txDistinctLocationCount, 10) || 0;
    const resolvedTxLocationId = toPositiveInt(txLocationId);
    if (txDistinctCount === 1 && resolvedTxLocationId) {
        return {
            resolvedLocationId: resolvedTxLocationId,
            resolutionSource: RESOLUTION_SOURCE.TRANSACTION_UNIQUE_LOCATION,
            resolutionReason: 'TX_UNIQUE_LOCATION'
        };
    }

    const resolvedTerminalHomeLocationId = toPositiveInt(terminalHomeLocationId);
    if (resolvedTerminalHomeLocationId) {
        return {
            resolvedLocationId: resolvedTerminalHomeLocationId,
            resolutionSource: RESOLUTION_SOURCE.TERMINAL_HOME_LOCATION,
            resolutionReason: 'TERMINAL_HOME_LOCATION'
        };
    }

    const resolvedTenantPrimaryLocationId = toPositiveInt(tenantPrimaryLocationId);
    if (resolvedTenantPrimaryLocationId) {
        return {
            resolvedLocationId: resolvedTenantPrimaryLocationId,
            resolutionSource: RESOLUTION_SOURCE.TENANT_PRIMARY_LOCATION,
            resolutionReason: 'TENANT_PRIMARY_LOCATION'
        };
    }

    const resolvedActiveLocationFallbackId = toPositiveInt(activeLocationFallbackId);
    if (resolvedActiveLocationFallbackId) {
        return {
            resolvedLocationId: resolvedActiveLocationFallbackId,
            resolutionSource: RESOLUTION_SOURCE.ACTIVE_LOCATION_FALLBACK,
            resolutionReason: 'ACTIVE_LOCATION_FALLBACK'
        };
    }

    return {
        resolvedLocationId: null,
        resolutionSource: RESOLUTION_SOURCE.NO_RESOLUTION,
        resolutionReason: 'NO_RESOLUTION'
    };
};

export const shiftLocationResolution = Object.freeze({
    RESOLUTION_SOURCE,
    LOW_CONFIDENCE_RESOLUTION_SOURCES
});
