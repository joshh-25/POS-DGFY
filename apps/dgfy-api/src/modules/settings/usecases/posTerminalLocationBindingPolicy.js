import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

export const POS_TERMINAL_LOCATION_BINDING_ENFORCED_KEY = 'pos_terminal_location_binding_enforced';
export const POS_TERMINAL_REGISTRY_KEY = 'pos_terminal_registry';
export const POS_LOCATION_BINDING_REASON_CODE = 'POS_LOCATION_BINDING_READINESS_REQUIRED';
export const POS_TERMINAL_LOCATION_ASSIGNMENT_REQUIRED_REASON_CODE = 'POS_TERMINAL_PRIMARY_LOCATION_REQUIRED';

const parsePositiveInt = (value) => {
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

export const normalizeTerminalRegistryEntries = (rawValue) => {
    if (!Array.isArray(rawValue)) return [];
    return rawValue.map((entry) => ({
        terminal_id: String(entry?.terminal_id || '').trim().toUpperCase(),
        label: String(entry?.label || '').trim(),
        location_id: parsePositiveInt(entry?.location_id),
        is_active: entry?.is_active !== false,
        is_default: entry?.is_default === true,
        terminal_password_hash: String(entry?.terminal_password_hash || '').trim()
    }));
};

export const buildStrictBindingTransitionPatch = async ({
    settingsRepository,
    incomingRegistryEntries
}) => {
    if (typeof settingsRepository?.getSettingsByKeys !== 'function') {
        return {
            strictBindingTransitioningOn: false,
            patchedRegistry: null
        };
    }

    const currentSettings = await settingsRepository.getSettingsByKeys([
        POS_TERMINAL_LOCATION_BINDING_ENFORCED_KEY,
        POS_TERMINAL_REGISTRY_KEY
    ]);
    const strictBindingCurrentlyEnabled = currentSettings?.[POS_TERMINAL_LOCATION_BINDING_ENFORCED_KEY]?.value === true;
    if (strictBindingCurrentlyEnabled) {
        return {
            strictBindingTransitioningOn: false,
            patchedRegistry: null
        };
    }

    const normalizedRegistry = normalizeTerminalRegistryEntries(
        typeof incomingRegistryEntries === 'undefined'
            ? currentSettings?.[POS_TERMINAL_REGISTRY_KEY]?.value
            : incomingRegistryEntries
    );
    const missingActiveLocationEntries = normalizedRegistry
        .filter((entry) => entry.is_active !== false && !parsePositiveInt(entry.location_id));

    if (missingActiveLocationEntries.length === 0) {
        return {
            strictBindingTransitioningOn: true,
            patchedRegistry: null
        };
    }

    const primaryLocation = typeof settingsRepository?.getActivePrimaryTenantLocation === 'function'
        ? await settingsRepository.getActivePrimaryTenantLocation()
        : null;
    const primaryLocationId = parsePositiveInt(primaryLocation?.location_id);
    if (!primaryLocationId) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Strict POS location binding requires an active primary location for terminal auto-assignment.',
            {
                statusCode: 422,
                details: {
                    reason_code: POS_TERMINAL_LOCATION_ASSIGNMENT_REQUIRED_REASON_CODE,
                    missing_terminal_ids: missingActiveLocationEntries
                        .map((entry) => entry.terminal_id)
                        .filter(Boolean)
                }
            }
        );
    }

    return {
        strictBindingTransitioningOn: true,
        patchedRegistry: normalizedRegistry.map((entry) => {
            if (entry.is_active === false || parsePositiveInt(entry.location_id)) {
                return entry;
            }
            return {
                ...entry,
                location_id: primaryLocationId
            };
        })
    };
};

export const assertStrictBindingReadiness = async ({ settingsRepository }) => {
    if (typeof settingsRepository?.getPosLocationBindingReadinessSummary !== 'function') {
        return;
    }

    const readinessSummary = await settingsRepository.getPosLocationBindingReadinessSummary();
    const unresolvedCount = Number.parseInt(readinessSummary?.unresolved_count || 0, 10) || 0;
    const lowConfidenceCount = Number.parseInt(readinessSummary?.low_confidence_count || 0, 10) || 0;
    if (unresolvedCount > 0 || lowConfidenceCount > 0 || readinessSummary?.ready_for_strict_mode === false) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Strict POS location binding cannot be enabled until location backfill readiness is complete.',
            {
                statusCode: 422,
                details: {
                    reason_code: POS_LOCATION_BINDING_REASON_CODE,
                    location_binding_readiness: readinessSummary || null
                }
            }
        );
    }
};
