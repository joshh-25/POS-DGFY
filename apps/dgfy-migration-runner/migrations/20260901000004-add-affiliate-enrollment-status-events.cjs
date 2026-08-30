'use strict';

// #1202 (Phase 214): a per-enrollment status-transition history for
// dgfy_affiliate_enrollments.status, replacing "the last write wins" with a real timeline. See
// PHASE_214_PLAN.md (this branch's root) for the full option (a) vs (b) analysis - this is option
// (b), a dedicated append-only events table.
//
// The three Phase 199 columns on dgfy_affiliate_enrollments (revoked_at, revoked_by,
// revocation_reason) are UNCHANGED by this migration and stay exactly as they are - they become a
// denormalized cache of the most recent demotion event, not the authority. On any disagreement
// between the two (they can disagree about WHICH KIND of demotion happened - revoked_at conflates
// suspended/revoked, see Phase 199/#450), this events table wins. Documented in the model too.
//
// Design notes (mirrored in DgfyAffiliateEnrollmentStatusEvent.js):
//   (a) enrollment_id/tenant_id are held BY VALUE, no FK - same landlord by-value convention every
//       other affiliate table in this module uses (ADR 0036 Decision 1), and deliberate here so a
//       future enrollment hard-delete cannot cascade away audit evidence.
//   (b) no unique index - repeated identical transitions are legitimate history, not duplicates.
//       This means the write is not idempotent by itself; every write site wraps the event insert
//       in the same transaction as the status change it records, so a retried request that writes
//       a second event is a retry that also performed a second status change (i.e. genuinely two
//       events). Do not "fix" this with a unique index later.
//   (c) `source` distinguishes a captured event ('admin_api' | 'invite_accept' | 'auto_enroll')
//       from a backfilled one ('backfill') - never conflate them.
//
// Backfill (this migration, guarded on the table being empty at first run):
//   1. One 'enrolled' row per existing enrollment, from_status = NULL, to_status = 'active',
//      created_at = enrollment.created_at, source = 'backfill'.
//   2. One demotion row ONLY where revoked_at IS NOT NULL AND status IN ('suspended','revoked') -
//      the demotion target is knowable there. from_status is ASSUMED to be 'active' (flagged in
//      metadata.backfill_assumption); actor_username is unrecoverable (NULL) - that is precisely
//      the gap this table exists to close going forward.
//   3. Rows with revoked_at IS NOT NULL AND status IN ('active','pending') are SKIPPED entirely -
//      the demotion target is unknowable (a suspend-then-reactivate cycle looks identical to a
//      revoke-then-reactivate cycle from revoked_at alone) and the reactivation timestamp was
//      never recorded pre-Phase-214. Fabricating either field would be worse than leaving a gap.
//
// Idempotent throughout via describeTable/showIndex guards, mirroring
// 20260901000001-add-affiliate-category-rates.cjs. down() drops the table.

const TABLE_EVENTS = 'dgfy_affiliate_enrollment_status_events';
const TABLE_ENROLLMENTS = 'dgfy_affiliate_enrollments';

const tableExists = async (queryInterface, tableName) => Boolean(
    await queryInterface.describeTable(tableName).catch(() => null)
);

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
    const indexes = await queryInterface.showIndex(tableName).catch(() => []);
    if (indexes.some((index) => index.name === options.name)) return;
    await queryInterface.addIndex(tableName, fields, options);
};

const STATUS_ENUM_VALUES = ['pending', 'active', 'suspended', 'revoked'];
const EVENT_TYPE_ENUM_VALUES = ['enrolled', 'suspended', 'revoked', 'reactivated'];
const ACTOR_TYPE_ENUM_VALUES = ['tenant_user', 'dgfy_account', 'system'];
const SOURCE_ENUM_VALUES = ['admin_api', 'invite_accept', 'auto_enroll', 'backfill'];

module.exports = {
    async up(queryInterface, Sequelize) {
        if (!(await tableExists(queryInterface, TABLE_ENROLLMENTS))) {
            throw new Error(`Required landlord table is missing: ${TABLE_ENROLLMENTS}`);
        }

        const alreadyCreated = await tableExists(queryInterface, TABLE_EVENTS);
        if (!alreadyCreated) {
            await queryInterface.createTable(TABLE_EVENTS, {
                status_event_id: {
                    type: Sequelize.BIGINT,
                    primaryKey: true,
                    autoIncrement: true,
                    allowNull: false
                },
                // Value link to dgfy_affiliate_enrollments.enrollment_id - no FK, see header note (a).
                enrollment_id: {
                    type: Sequelize.INTEGER,
                    allowNull: false
                },
                // Denormalized so every read is tenant-scoped without a join.
                tenant_id: {
                    type: Sequelize.UUID,
                    allowNull: false
                },
                // NULL = enrollment creation (there was no prior status).
                from_status: {
                    type: Sequelize.ENUM(...STATUS_ENUM_VALUES),
                    allowNull: true
                },
                to_status: {
                    type: Sequelize.ENUM(...STATUS_ENUM_VALUES),
                    allowNull: false
                },
                // Derived, not free-text - the field a UI filters/labels on. Mirrors
                // dgfy_account_admin_audit_logs.action.
                event_type: {
                    type: Sequelize.ENUM(...EVENT_TYPE_ENUM_VALUES),
                    allowNull: false
                },
                actor_type: {
                    type: Sequelize.ENUM(...ACTOR_TYPE_ENUM_VALUES),
                    allowNull: false
                },
                // Tenant-DB users.user_id, by value, no FK - same convention as revoked_by.
                actor_user_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true
                },
                // The point of this table (#1202 F4): denormalized at write time from
                // req.user.username so a UI can render "by Ana" instead of "by user #7". Nullable
                // because 'system'/'dgfy_account' actors have no tenant username.
                actor_username: {
                    type: Sequelize.STRING(120),
                    allowNull: true
                },
                // Set on dgfy_account-actor events (invite acceptance).
                actor_dgfy_account_id: {
                    type: Sequelize.UUID,
                    allowNull: true
                },
                reason: {
                    type: Sequelize.STRING(500),
                    allowNull: true
                },
                source: {
                    type: Sequelize.ENUM(...SOURCE_ENUM_VALUES),
                    allowNull: false
                },
                metadata: {
                    type: Sequelize.JSON,
                    allowNull: true
                },
                created_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                }
            });
        }

        await addIndexIfMissing(queryInterface, TABLE_EVENTS, ['enrollment_id', 'created_at'], {
            name: 'idx_affiliate_status_events_enrollment_time'
        });
        await addIndexIfMissing(queryInterface, TABLE_EVENTS, ['tenant_id', 'created_at'], {
            name: 'idx_affiliate_status_events_tenant_time'
        });
        await addIndexIfMissing(queryInterface, TABLE_EVENTS, ['event_type'], {
            name: 'idx_affiliate_status_events_event_type'
        });

        // --- J3: partial, unambiguous-only backfill - only on the run that actually created the
        // table, so a re-run against an already-migrated database never double-inserts (there is
        // deliberately no unique index to catch that for us - see header note (b)).
        if (!alreadyCreated) {
            const [enrollments] = await queryInterface.sequelize.query(
                `SELECT enrollment_id, tenant_id, status, created_at, revoked_at, revoked_by, revocation_reason
                 FROM ${TABLE_ENROLLMENTS}`
            );

            for (const enrollment of enrollments) {
                const enrolledCreatedAt = enrollment.created_at instanceof Date
                    ? enrollment.created_at
                    : new Date(enrollment.created_at);

                // eslint-disable-next-line no-await-in-loop
                await queryInterface.bulkInsert(TABLE_EVENTS, [{
                    enrollment_id: enrollment.enrollment_id,
                    tenant_id: enrollment.tenant_id,
                    from_status: null,
                    to_status: 'active',
                    event_type: 'enrolled',
                    actor_type: 'system',
                    actor_user_id: null,
                    actor_username: null,
                    actor_dgfy_account_id: null,
                    reason: null,
                    source: 'backfill',
                    metadata: null,
                    created_at: enrolledCreatedAt
                }]);

                const hasRevocationTimestamp = Boolean(enrollment.revoked_at);
                const isKnowableDemotionTarget = enrollment.status === 'suspended' || enrollment.status === 'revoked';
                if (hasRevocationTimestamp && isKnowableDemotionTarget) {
                    const revokedAt = enrollment.revoked_at instanceof Date
                        ? enrollment.revoked_at
                        : new Date(enrollment.revoked_at);

                    // eslint-disable-next-line no-await-in-loop
                    await queryInterface.bulkInsert(TABLE_EVENTS, [{
                        enrollment_id: enrollment.enrollment_id,
                        tenant_id: enrollment.tenant_id,
                        // Assumed, not observed - flagged in metadata.backfill_assumption. The real
                        // prior status is unrecoverable from the three Phase 199 columns alone.
                        from_status: 'active',
                        to_status: enrollment.status,
                        event_type: enrollment.status,
                        actor_type: 'system',
                        actor_user_id: enrollment.revoked_by ?? null,
                        // Unrecoverable - F4 is precisely why it was never stored pre-Phase-214.
                        actor_username: null,
                        actor_dgfy_account_id: null,
                        reason: enrollment.revocation_reason ?? null,
                        source: 'backfill',
                        metadata: JSON.stringify({ backfill_assumption: 'from_status assumed active; true prior status unrecoverable' }),
                        created_at: revokedAt
                    }]);
                }
                // else: revoked_at IS NOT NULL AND status IN ('active','pending') - skipped
                // outright per J3. The demotion target is unknowable and the reactivation
                // timestamp was never recorded; fabricating either would be worse than a gap.
            }
        }
    },

    async down(queryInterface) {
        await queryInterface.removeIndex(TABLE_EVENTS, 'idx_affiliate_status_events_event_type').catch(() => null);
        await queryInterface.removeIndex(TABLE_EVENTS, 'idx_affiliate_status_events_tenant_time').catch(() => null);
        await queryInterface.removeIndex(TABLE_EVENTS, 'idx_affiliate_status_events_enrollment_time').catch(() => null);
        await queryInterface.dropTable(TABLE_EVENTS).catch(() => null);
    }
};
