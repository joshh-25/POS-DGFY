// ComplianceEntity — Clean Architecture Entity layer (Enterprise Business
// Rules), mirroring ../../businesses/entities/businessEntity.js's role.
// Holds compliance_mode_state shape and the D-05 domain helper, completely
// separate from persistence (the ComplianceModeState Sequelize model) and
// HTTP concerns. ComplianceModeStateRepository translates Sequelize model
// rows <-> plain objects directly (toPlain()); this entity is used by the
// usecase layer to expose a stable, documented public response shape and
// the allowsFiscalChoice() domain helper.

export class ComplianceEntity {
    constructor({
        id = null,
        business_id = null,
        branch_id = null,
        state = 'non_compliant_active',
        compliance_profile = null,
        active_policy_pack_version = null,
        verification_status = null,
        verified_by_actor_type = null,
        verified_at = null,
        created_at = null,
        updated_at = null
    } = {}) {
        this.id = id;
        this.business_id = business_id;
        this.branch_id = branch_id;
        this.state = state;
        this.compliance_profile = compliance_profile;
        this.active_policy_pack_version = active_policy_pack_version;
        this.verification_status = verification_status;
        this.verified_by_actor_type = verified_by_actor_type;
        this.verified_at = verified_at;
        this.created_at = created_at;
        this.updated_at = updated_at;
    }

    /**
     * D-05: compliant_active means Fiscal is now *available to choose*
     * alongside Omni — this is just the state-row-level predicate; the
     * policy engine (../policy/policyEngine.js, via assertComplianceGate) is
     * the authority on actually gating an operation.
     * @returns {boolean}
     */
    allowsFiscalChoice() {
        return this.state === 'compliant_active';
    }

    /**
     * Public response shape for GET /compliance/state and the evidence/
     * review endpoints.
     * @returns {Object}
     */
    toPlain() {
        return {
            id: this.id,
            business_id: this.business_id,
            branch_id: this.branch_id,
            state: this.state,
            compliance_profile: this.compliance_profile,
            active_policy_pack_version: this.active_policy_pack_version,
            verification_status: this.verification_status,
            verified_by_actor_type: this.verified_by_actor_type,
            verified_at: this.verified_at,
            allows_fiscal_choice: this.allowsFiscalChoice(),
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }
}

/**
 * @param {Object} attrs
 * @returns {ComplianceEntity}
 */
export const createComplianceEntity = (attrs) => new ComplianceEntity(attrs);

export default ComplianceEntity;
