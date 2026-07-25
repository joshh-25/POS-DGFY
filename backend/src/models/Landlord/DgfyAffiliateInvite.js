import { DataTypes, Model } from 'sequelize';

// A pending affiliate invitation, keyed by the invitee's email. Unlike DgfyAffiliateEnrollment
// (which requires a dgfy_account_id up front), an invite can exist before the person has a DGFY
// account at all - that's the whole point. When the invite is claimed (existing account accepts,
// or a brand-new account registers with the same email), a real enrollment is materialized and the
// invite flips to `accepted`. Mirrors the token_hash/expires_at/status convention of UserInvitation
// and DgfyReviewInvite - only the SHA-256 hash of the opaque token is ever persisted; the raw token
// lives only inside the emailed magic link.
export default (sequelize) => {
    class DgfyAffiliateInvite extends Model { }

    DgfyAffiliateInvite.init({
        invite_id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        // Normalized (lowercased/trimmed) invitee email - the pending-match key used both by the
        // explicit accept path and by the on-register auto-enroll hook.
        email: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        token_hash: {
            type: DataTypes.STRING(128),
            allowNull: false,
            unique: true
        },
        // Per-affiliate commission override in basis points to apply when the enrollment is created.
        // NULL = inherit tenant_affiliate_settings.default_rate_bps.
        commission_rate_bps: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('pending', 'accepted', 'expired', 'cancelled'),
            allowNull: false,
            defaultValue: 'pending'
        },
        // Filled in when the invite is claimed - the account the resulting enrollment belongs to.
        dgfy_account_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        // The tenant User who sent the invite (POS side). Nullable so the record survives even if
        // that user is later removed.
        invited_by: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        expires_at: {
            type: DataTypes.DATE,
            allowNull: false
        },
        last_sent_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        accepted_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'DgfyAffiliateInvite',
        tableName: 'dgfy_affiliate_invites',
        underscored: true,
        timestamps: true,
        indexes: [
            { unique: true, fields: ['token_hash'], name: 'unique_dgfy_affiliate_invites_token_hash' },
            { fields: ['tenant_id', 'status'], name: 'idx_dgfy_affiliate_invites_tenant_status' },
            { fields: ['email'], name: 'idx_dgfy_affiliate_invites_email' }
        ]
    });

    return DgfyAffiliateInvite;
};
