import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';
import { parseAmountToCentavos, roundHalfUp } from '../../availments/usecases/money.js';

// cartValidation.js — the SINGLE server-side cart re-pricer every checkout
// path (guest and account, cash and PayMongo, 10-06) reuses (T-10-03-01).
// For each cart line, resolves the product from the TENANT catalog via the
// injected productRepository (Phase 8's ../../products/repositories/
// productRepository.js), rejects unknown/inactive products, snapshots
// name + unit price from the catalog (never the client), and recomputes
// every amount in integer centavos using ../../availments/usecases/
// money.js's roundHalfUp — the exact rounding convention Phase 9's POS
// checkout already uses, reused here rather than re-implemented.
//
// A client-supplied price/total is never read at all — there is simply no
// code path that consults `line.unit_price` or any client-total field, so
// a tampered cart payload cannot influence the recomputed totals.

const validationError = (message) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400 }
);

const productNotFoundError = (productId) => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    `Product ${productId} was not found.`,
    { statusCode: 404, details: { error_code: 'PRODUCT_NOT_FOUND', productId } }
);

const productUnavailableError = (productId) => new DomainError(
    DomainErrorCode.CONFLICT,
    `Product ${productId} is no longer available.`,
    { statusCode: 409, details: { error_code: 'PRODUCT_UNAVAILABLE', productId } }
);

/**
 * Duck-types on `error.name === 'TenantDatabaseUnavailableError'` rather
 * than importing productRepository.js's class directly — mirrors
 * productUseCases.js's self-contained convention.
 * @param {Error} error
 */
const isTenantDatabaseUnavailableError = (error) => Boolean(error) && error.name === 'TenantDatabaseUnavailableError';

const noTenantDatabaseError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'No tenant database is registered for this business.',
    { statusCode: 404, details: { error_code: 'NO_TENANT_DATABASE' } }
);

const mapTenantDatabaseError = (error) => {
    if (error.reason === 'missing' || error.reason === 'not_configured') {
        return noTenantDatabaseError();
    }
    return new DomainError(
        DomainErrorCode.SERVICE_UNAVAILABLE,
        error.message,
        { statusCode: 503, details: { error_code: 'TENANT_DATABASE_UNAVAILABLE', reason: error.reason } }
    );
};

const isPositiveFiniteNumber = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

/**
 * Validates and re-prices a cart against the live tenant catalog.
 *
 * @param {{productRepository}} deps
 * @returns {(input: {businessId: string, lines: Array<{productId: number|string, quantity: number}>}) => Promise<ApplicationResult<{normalizedLines: Array<Object>, totalCentavos: number}>>}
 */
export function buildValidateCartUseCase({ productRepository }) {
    return async (input = {}) => {
        const { businessId, lines } = input;

        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }
        if (!Array.isArray(lines) || lines.length === 0) {
            return ApplicationResult.failure(validationError('Cart must contain at least one line.'));
        }

        const normalizedLines = [];
        let totalCentavos = 0;

        for (const line of lines) {
            const productId = line?.productId;
            if (productId === undefined || productId === null) {
                return ApplicationResult.failure(validationError('Each cart line requires a productId.'));
            }

            const quantity = Number(line?.quantity);
            if (!isPositiveFiniteNumber(quantity)) {
                return ApplicationResult.failure(
                    validationError(`quantity must be a positive number for product ${productId}.`)
                );
            }

            let product;
            try {
                product = await productRepository.findById(businessId, productId);
            } catch (tenantError) {
                if (isTenantDatabaseUnavailableError(tenantError)) {
                    return ApplicationResult.failure(mapTenantDatabaseError(tenantError));
                }
                throw tenantError;
            }

            if (!product) {
                return ApplicationResult.failure(productNotFoundError(productId));
            }
            if (!product.is_active) {
                return ApplicationResult.failure(productUnavailableError(productId));
            }

            // Snapshot name + unit price from the CATALOG, never the client
            // (T-10-03-01) — `line.unit_price`/`line.clientTotalCentavos`
            // (if a caller sent them) are never read.
            const unitPriceCentavos = parseAmountToCentavos(product.base_price);
            const lineTotalCentavos = roundHalfUp(quantity * unitPriceCentavos, 1);

            normalizedLines.push({
                product_id: product.id,
                name: product.name,
                quantity,
                unit_price_centavos: unitPriceCentavos,
                line_total_centavos: lineTotalCentavos
            });
            totalCentavos += lineTotalCentavos;
        }

        return ApplicationResult.success({ normalizedLines, totalCentavos });
    };
}

export default buildValidateCartUseCase;
