import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode, isDomainError } from '../../shared/contracts/domainErrors.js';

const normalizeReason = (reason) => String(reason || '').trim().slice(0, 500);

// #1190 (Phase 213) - landlord-admin-only write path for max_affiliate_slots (#447 D5: raising
// the cap is a manual, out-of-band admin action; no self-serve merchant surface -- see
// dgfyAffiliateUseCases.js's buildUpdateAffiliateSettingsUseCase, whose per-field allowlist does
// not include max_affiliate_slots and must never be extended to do so).
//
// Pat's E2 decision (#1190, 2026-08-31): lowering the cap below current consumption is allowed.
// Existing enrollments/invites are grandfathered -- this use case never suspends, revokes, or
// otherwise mutates any enrollment or invite row, regardless of how far below consumption the new
// cap lands. `slots_used` at write time is recorded on the audit row (and returned in the
// response) so an over-cap state is visible, not hidden.
export const buildUpdateTenantAffiliateSlotsUseCase = ({
    tenantAdminRepository,
    dgfyAffiliateRepository,
    logger
}) => {
    return async ({ id, body = {}, actor = {}, metadata = {} }) => {
        try {
            const reason = normalizeReason(body?.reason);
            if (reason.length < 3) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'reason is required and must be at least 3 characters',
                    { statusCode: 422 }
                ));
            }

            const newValue = Number(body?.max_affiliate_slots);
            if (!Number.isInteger(newValue) || newValue < 1) {
                return fail(new DomainError(
                    DomainErrorCode.VALIDATION_FAILED,
                    'max_affiliate_slots must be a positive integer',
                    { statusCode: 422 }
                ));
            }

            const tenant = await tenantAdminRepository.findTenantById(id);
            if (!tenant) {
                return fail(new DomainError(DomainErrorCode.TENANT_NOT_FOUND, 'Tenant not found', { statusCode: 404 }));
            }

            const actorUsername = String(actor?.username || 'platform_admin').slice(0, 120);

            const result = await tenantAdminRepository.transaction(async (t) => {
                // Must be the very first statement of the transaction -- see this method's own
                // comment in dgfyAffiliateRepository.js (#1187 RF-6). Establishes both the row
                // lock and the REPEATABLE READ snapshot every later read in this transaction relies
                // on, and puts this write in the same serialization order as every slot-consuming
                // write (createEnrollment/createInvite's own assertAffiliateSlotAvailable call).
                await dgfyAffiliateRepository.acquireAffiliateSlotLock(id, { transaction: t });

                // RF-1 (PR #1228 round-1 review): must read on the same transaction/connection as
                // the lock and the write, not a separate implicit connection -- otherwise
                // before_snapshot.max_affiliate_slots is not guaranteed to reflect the locked row.
                const before = await dgfyAffiliateRepository.getSettings(id, { transaction: t });
                const slotsUsed = await dgfyAffiliateRepository.countConsumedSlots(id, { transaction: t });
                const previousValue = Number.isInteger(before?.max_affiliate_slots)
                    ? before.max_affiliate_slots
                    : before?.max_affiliate_slots;

                // E2 (Pat, 2026-08-31): no rejection -- a below-consumption write is allowed and
                // never touches an existing enrollment or invite. overCapAfterWrite is recorded
                // (audit metadata + response) purely as evidence, never as a gate.
                const overCapAfterWrite = slotsUsed > newValue;

                await dgfyAffiliateRepository.upsertSettings(id, { max_affiliate_slots: newValue }, { transaction: t });

                // Written inside the same transaction as the settings write, unlike the pos-metadata
                // use case's audit insert -- a cap write that lands without its audit row is exactly
                // the state #1190 exists to eliminate, so the two must commit or fail together.
                await tenantAdminRepository.createTenantAdminAuditLog({
                    tenant_id: tenant.id,
                    action: 'affiliate_slots_update',
                    actor_username: actorUsername,
                    reason,
                    request_id: metadata?.request_id || null,
                    ip_address: metadata?.ip_address || null,
                    user_agent: metadata?.user_agent || null,
                    before_snapshot: { max_affiliate_slots: previousValue, slots_used: slotsUsed },
                    after_snapshot: { max_affiliate_slots: newValue },
                    metadata: {
                        previous_value: previousValue,
                        new_value: newValue,
                        delta: Number.isInteger(previousValue) ? newValue - previousValue : null,
                        slots_used_at_write: slotsUsed,
                        over_cap_after_write: overCapAfterWrite,
                        source: 'platform_admin_api'
                    }
                }, { transaction: t });

                return { previousValue, slotsUsed, overCapAfterWrite };
            });

            return ok({
                tenant_id: tenant.id,
                tenant_name: tenant.name,
                max_affiliate_slots: newValue,
                previous_max_affiliate_slots: result.previousValue,
                slots_used: result.slotsUsed,
                over_cap: result.overCapAfterWrite
            });
        } catch (error) {
            logger?.error?.('Update tenant affiliate slots error:', error);
            if (isDomainError(error)) {
                return fail(error);
            }
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Failed to update tenant affiliate slots',
                { statusCode: 500 }
            ));
        }
    };
};

export const buildGetTenantAffiliateSlotsUseCase = ({
    tenantAdminRepository,
    dgfyAffiliateRepository,
    logger
}) => {
    return async ({ id }) => {
        try {
            const tenant = await tenantAdminRepository.findTenantById(id);
            if (!tenant) {
                return fail(new DomainError(DomainErrorCode.TENANT_NOT_FOUND, 'Tenant not found', { statusCode: 404 }));
            }

            const [maxAffiliateSlots, slotsUsed, settings] = await Promise.all([
                dgfyAffiliateRepository.getMaxAffiliateSlots(id),
                dgfyAffiliateRepository.countConsumedSlots(id),
                dgfyAffiliateRepository.getSettings(id)
            ]);

            return ok({
                tenant_id: tenant.id,
                tenant_name: tenant.name,
                max_affiliate_slots: maxAffiliateSlots,
                slots_used: slotsUsed,
                program_enabled: Boolean(settings?.program_enabled),
                over_cap: slotsUsed > maxAffiliateSlots
            });
        } catch (error) {
            logger?.error?.('Get tenant affiliate slots error:', error);
            return fail(new DomainError(
                DomainErrorCode.INTERNAL_ERROR,
                error.message || 'Failed to load tenant affiliate slots',
                { statusCode: 500 }
            ));
        }
    };
};
