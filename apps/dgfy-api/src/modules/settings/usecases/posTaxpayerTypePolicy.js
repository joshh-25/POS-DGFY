import {
    getPosTaxpayerTypeReadiness,
    POS_TAXPAYER_TYPE_SETTING_KEY,
    resolvePosTaxpayerType
} from '@sieitzz/shared-constants/posTaxpayerType';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

const INVALID_TAXPAYER_TYPE_MESSAGE = 'pos_taxpayer_type must be VAT, VAT registered, non-VAT, or non-VAT registered.';

export const assertValidPosTaxpayerType = (value) => {
    if (typeof value === 'string' && value.trim() === '') return;
    if (typeof value === 'string' && resolvePosTaxpayerType(value)) return;

    throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        INVALID_TAXPAYER_TYPE_MESSAGE,
        {
            statusCode: 422,
            details: {
                reason_code: 'POS_TAXPAYER_TYPE_UNRECOGNIZED',
                setting_key: POS_TAXPAYER_TYPE_SETTING_KEY
            }
        }
    );
};

export const assertValidPosTaxpayerTypeChanges = (settingsData = {}) => {
    if (Object.prototype.hasOwnProperty.call(settingsData, POS_TAXPAYER_TYPE_SETTING_KEY)) {
        assertValidPosTaxpayerType(settingsData[POS_TAXPAYER_TYPE_SETTING_KEY]);
    }
};

export const buildPosTaxpayerTypeReadProjection = (setting = null) => {
    const readiness = getPosTaxpayerTypeReadiness(setting?.value);
    const updatedAt = setting?.updated_at || null;
    return {
        pos_taxpayer_type_resolved: {
            value: readiness.taxpayer_type,
            data_type: 'string',
            description: 'Runtime canonical POS taxpayer classification resolved from the persisted setting.',
            source: 'runtime',
            updated_at: updatedAt
        },
        pos_fiscal_setup_readiness: {
            value: readiness,
            data_type: 'json',
            description: 'Runtime readiness state for the POS taxpayer classification required by fiscal documents.',
            source: 'runtime',
            updated_at: updatedAt
        }
    };
};

export const buildSinglePosTaxpayerTypeReadProjection = (setting = null) => {
    const readiness = getPosTaxpayerTypeReadiness(setting?.value);
    return {
        resolved_value: readiness.taxpayer_type,
        readiness
    };
};

export const assertPosTaxpayerTypeReadyForFiscalIssuance = (settings = {}) => {
    const setting = settings?.[POS_TAXPAYER_TYPE_SETTING_KEY];
    const readiness = getPosTaxpayerTypeReadiness(setting?.value);
    if (readiness.status === 'configured') return readiness;

    throw new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Fiscal issuance requires a recognized POS taxpayer type. Configure VAT or non-VAT before issuing a fiscal invoice.',
        {
            statusCode: 422,
            details: {
                reason_code: 'FISCAL_SETUP_INCOMPLETE',
                setting_key: POS_TAXPAYER_TYPE_SETTING_KEY,
                readiness
            }
        }
    );
};
