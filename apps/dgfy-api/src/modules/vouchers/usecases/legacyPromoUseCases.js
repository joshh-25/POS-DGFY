// #2159: transitional read/revoke use cases for setting-backed legacy promos
// (`storefront_promo` / `storefront_promos`). Read-only list plus a revoke-only mutation; there is
// deliberately no create/edit/reset/reactivate operation here -- #991 retires the whole path.
//
// Concurrency contract: revocation runs in one tenant transaction that locks the exact setting row,
// re-reads its latest JSON, and writes the revoked entry back without touching any other field.
// Checkout paths lock the same rows before evaluating (Storefront via resolveCheckoutContext's
// transaction options, POS directly), so either revoke commits first and checkout's locked re-read
// rejects the code, or checkout commits first and the revocation preserves its fresh `used_count`.

import logger from '../../../config/logger.js';
import dbStore from '../../../utils/dbStore.js';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode, isDomainError } from '../../shared/contracts/domainErrors.js';
import {
    normalizePromoCode,
    parseCommercialPromoConfigs,
    resolveCommercialPromoEffectiveState,
    resolveCommercialPromoTimezone
} from '../../shared/utils/commercialPromoPolicy.js';
import {
    LEGACY_PROMO_SETTING_KEYS,
    buildRevokedLegacyPromoValue,
    listLegacyPromoDtos,
    locateLegacyPromoConfig,
    toLegacyPromoDto
} from '../domain/legacyPromoPolicy.js';

const parseSettingValue = (rawValue) => {
    if (rawValue == null) return null;
    if (typeof rawValue !== 'string') return rawValue;
    try {
        return JSON.parse(rawValue);
    } catch {
        return rawValue;
    }
};

const mapSettings = (rows = []) => Object.fromEntries((rows || [])
    .filter((row) => row && row.setting_key)
    .map((row) => [row.setting_key, { ...row, value: parseSettingValue(row.setting_value) }]));

const currentTenantAccessContext = () => {
    const store = dbStore.getStore?.() || {};
    return { tenantId: store.tenantId };
};

const mapLegacyPromoUseCaseError = (error, fallbackMessage) => (
    isDomainError(error)
        ? error
        : new DomainError(DomainErrorCode.INTERNAL_ERROR, fallbackMessage, { cause: error })
);

export const buildListLegacyPromosUseCase = ({ repository }) => {
    return async () => {
        try {
            const rows = await repository.findSettingsByKeys(LEGACY_PROMO_SETTING_KEYS);
            const settings = mapSettings(rows);
            const now = new Date();
            return ok({
                promos: listLegacyPromoDtos(settings, { now }),
                timezone: resolveCommercialPromoTimezone(settings),
                generated_at: now.toISOString()
            });
        } catch (error) {
            return fail(mapLegacyPromoUseCaseError(error, 'Failed to load legacy promos'));
        }
    };
};

export const buildRevokeLegacyPromoUseCase = ({ repository, syncStorefrontDiscovery = null }) => {
    return async ({ payload = {}, actorUser = null } = {}) => {
        const sourceKey = String(payload.source_key || '').trim();
        const promoId = String(payload.promo_id || '').trim();
        const promoCode = normalizePromoCode(payload.promo_code);
        const sourceIndex = Number.isInteger(payload.source_index) ? payload.source_index : null;
        const actorUsername = String(actorUser?.username || '').trim() || null;

        let transaction = null;
        try {
            transaction = await repository.beginTransaction();
            // Lock ONLY the target setting row. Checkout locks this same row (plus sibling settings)
            // before it evaluates, so this is sufficient serialization; locking extra rows here
            // would only widen the contention window.
            const targetRow = await repository.findSettingByKey(sourceKey, { transaction, lock: true });
            if (!targetRow) {
                throw new DomainError(
                    DomainErrorCode.RESOURCE_NOT_FOUND,
                    'Legacy promo entry was not found.',
                    { statusCode: 404, details: { source_key: sourceKey } }
                );
            }
            const hoursRow = await repository.findSettingByKey('storefront_hours', { transaction });
            const settings = mapSettings([targetRow, hoursRow]);
            const timezone = resolveCommercialPromoTimezone(settings);
            const now = new Date();
            const config = locateLegacyPromoConfig(
                parseCommercialPromoConfigs(settings),
                { sourceKey, promoId, promoCode, sourceIndex }
            );

            if (config.revoked) {
                // Idempotent replay: no counter change, no second audit row, no discovery churn.
                await transaction.commit();
                transaction = null;
                return ok({
                    promo: toLegacyPromoDto(config, { now, timezone }),
                    idempotent_replay: true
                });
            }

            const revokedAt = now.toISOString();
            const nextValue = buildRevokedLegacyPromoValue({
                sourceKey,
                sourceIndex: config.sourceIndex,
                entryValue: settings[sourceKey]?.value,
                actorUsername,
                revokedAt
            });
            await repository.updateSettingValueByKey(sourceKey, nextValue, { transaction, lock: true });
            await repository.createAuditLog({
                user_id: actorUser?.user_id || null,
                actor_username: actorUsername,
                entity_type: 'legacy_promo',
                entity_id: null,
                action: 'UPDATE',
                event_type: 'legacy_promo.revoked',
                changes: {
                    source_key: sourceKey,
                    source_index: Number.isInteger(config.sourceIndex) ? config.sourceIndex : null,
                    promo_id: config.promoId || null,
                    promo_code: config.promoCode || null,
                    revoked_at: revokedAt,
                    revoked_by: actorUsername,
                    previous: {
                        active: config.active,
                        used_count: config.usedCount
                    },
                    effective_state: resolveCommercialPromoEffectiveState(
                        { ...config, revoked: true },
                        { now, timezone }
                    )
                }
            }, { transaction });

            await transaction.commit();
            transaction = null;

            const { tenantId } = currentTenantAccessContext();
            if (tenantId && typeof syncStorefrontDiscovery === 'function') {
                // Fire-and-forget after commit, matching settingsHandlers.js's post-update pattern:
                // the revoke is authoritative for checkout the moment it commits, and the discovery
                // index rebuild must never block or fail the operator's response. A degraded index
                // is logged; the next sync/reconcile repairs it.
                Promise.resolve()
                    .then(() => syncStorefrontDiscovery({ tenantId, source: 'legacy_promo_revoke' }))
                    .then((result) => {
                        if (result && result.ok === false) {
                            logger.warn('[LegacyPromo] Storefront discovery sync degraded after revoke', {
                                tenantId,
                                attempts: result.attempts || 0,
                                errors: result.errors || []
                            });
                        }
                    })
                    .catch((error) => {
                        logger.warn('[LegacyPromo] Storefront discovery sync failed after revoke', {
                            tenantId,
                            error: error?.message || 'unknown_error'
                        });
                    });
            }

            return ok({
                promo: toLegacyPromoDto(
                    { ...config, revoked: true, revokedBy: actorUsername || '', revokedAt },
                    { now, timezone }
                ),
                idempotent_replay: false
            });
        } catch (error) {
            if (transaction && !transaction.finished) {
                await transaction.rollback().catch(() => {});
            }
            return fail(mapLegacyPromoUseCaseError(error, 'Failed to revoke the legacy promo'));
        }
    };
};
