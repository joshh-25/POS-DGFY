import { jest } from '@jest/globals';
import { buildReviewComplianceStateUseCase } from '../../../../src/modules/compliance/usecases/complianceUseCases.js';
import { evaluateComplianceDecision } from '../../../../src/modules/compliance/policy/policyEngine.js';
import {
    COMPLIANCE_MODE_STATE,
    COMPLIANCE_DECISION,
    COMPLIANCE_OPERATION,
    COMPLIANCE_REASON_CODE,
    COMPLIANCE_VERIFIER_ACTOR_TYPE,
    COMPLIANCE_VERIFICATION_STATUS
} from '../../../../src/modules/compliance/policy/constants.js';

// FSC-01 gap-closure regression (08-11-PLAN.md): buildReviewComplianceStateUseCase
// (complianceUseCases.js ~274-329) only wrote compliance_mode_state.state when
// verificationStatus === 'verified'. For 'rejected'/'revoked' outcomes it patched
// only the verification metadata (via recordVerification) and left state
// untouched -- so a business that reached compliant_active and is later
// reviewed 'revoked'/'rejected' kept state: compliant_active forever, and
// evaluateComplianceDecision() (which branches exclusively on the state column)
// kept returning ALLOW for a Fiscal POS_CHECKOUT. This is a fail-open
// authorization bypass.
//
// 12-03-PLAN.md (T-12-07/T-12-08): the original fix above still called
// recordVerification() then upsertState() as two INDEPENDENT,
// non-transactional writes -- a crash/race between them could record a
// review while leaving compliance_mode_state.state un-demoted. The usecase
// now performs a single atomic repository.recordVerificationAndState() call
// (row-locked transaction, see complianceModeStateRepository.test.js for the
// repository-level atomicity coverage) carrying both the verification
// triplet and the computed state -- the old two-call path is gone.
//
// Mocked repository/businessRepository convention mirrors
// complianceModeStateRepository.test.js's makeStateRow()/getMembership()
// pattern; the policy-engine half reuses complianceChecklistGating.test.js's
// direct evaluateComplianceDecision() invocation shape.

const makeStateRow = (overrides = {}) => ({
    id: 1,
    business_id: 'biz-1',
    branch_id: null,
    state: 'compliant_active',
    compliance_profile: null,
    active_policy_pack_version: null,
    verification_status: null,
    verified_by_actor_type: null,
    verified_at: null,
    created_at: new Date('2026-07-13T00:00:00Z'),
    updated_at: new Date('2026-07-13T00:00:00Z'),
    ...overrides
});

/**
 * recordVerificationAndState() resolves a state row reflecting the single
 * atomic patch it was called with -- so the usecase's
 * createComplianceEntity(finalRow).toPlain() surfaces exactly what the one
 * repository call determined (verification triplet + computed state
 * together, never a two-call split).
 */
const makeRepository = () => ({
    recordVerificationAndState: jest.fn(async (businessId, branchId, patch) => makeStateRow({
        business_id: businessId,
        branch_id: branchId,
        ...patch
    }))
});

const makeBusinessRepository = () => ({
    getMembership: jest.fn().mockResolvedValue({ status: 'active', role: 'owner' }),
    findById: jest.fn().mockResolvedValue({ id: 'biz-1', status: 'active' })
});

describe('FSC-01: reject/revoke demotes compliance_mode_state to non_compliant_active', () => {
    test.each([
        [COMPLIANCE_VERIFICATION_STATUS.REVOKED],
        [COMPLIANCE_VERIFICATION_STATUS.REJECTED]
    ])('verificationStatus=%s demotes state to non_compliant_active with no client-supplied newState', async (verificationStatus) => {
        const repository = makeRepository();
        const businessRepository = makeBusinessRepository();
        const reviewComplianceState = buildReviewComplianceStateUseCase({ repository, businessRepository });

        const result = await reviewComplianceState({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            verifierActorType: COMPLIANCE_VERIFIER_ACTOR_TYPE.TENANT_MASTER_ADMIN,
            verificationStatus
            // Deliberately NO newState -- the demotion is unconditional to
            // non_compliant_active for reject/revoke (option to require an
            // explicit newState was rejected by the user for this closure).
        });

        expect(result.success).toBe(true);
        // Single atomic call carrying BOTH the verification triplet and the
        // computed state -- the old recordVerification()+upsertState() pair
        // is gone.
        expect(repository.recordVerificationAndState).toHaveBeenCalledTimes(1);
        expect(repository.recordVerificationAndState).toHaveBeenCalledWith(
            'biz-1',
            null,
            expect.objectContaining({
                verification_status: verificationStatus,
                state: COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE
            })
        );
        expect(result.data.compliance.state).toBe(COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE);
    });
});

describe('FSC-01/T-12-07: a verified review outcome sets state to the reviewer-supplied newState via the single atomic call', () => {
    test('verificationStatus=verified calls recordVerificationAndState once with the computed newState', async () => {
        const repository = makeRepository();
        const businessRepository = makeBusinessRepository();
        const reviewComplianceState = buildReviewComplianceStateUseCase({ repository, businessRepository });

        const result = await reviewComplianceState({
            businessId: 'biz-1',
            requestingAccountId: 'acct-1',
            verifierActorType: COMPLIANCE_VERIFIER_ACTOR_TYPE.TENANT_MASTER_ADMIN,
            verificationStatus: COMPLIANCE_VERIFICATION_STATUS.VERIFIED,
            newState: COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE
        });

        expect(result.success).toBe(true);
        expect(repository.recordVerificationAndState).toHaveBeenCalledTimes(1);
        expect(repository.recordVerificationAndState).toHaveBeenCalledWith(
            'biz-1',
            null,
            expect.objectContaining({
                verification_status: COMPLIANCE_VERIFICATION_STATUS.VERIFIED,
                state: COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE
            })
        );
        expect(result.data.compliance.state).toBe(COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE);
    });
});

describe('FSC-01: a demoted (non_compliant_active) tenant is fail-closed for Fiscal POS_CHECKOUT', () => {
    test('fiscal POS_CHECKOUT is blocked (decision !== ALLOW, reason_code NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED)', () => {
        const decision = evaluateComplianceDecision({
            tenant: { id: 'biz-1', compliance_mode_state: COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE },
            operation: COMPLIANCE_OPERATION.POS_CHECKOUT,
            context: { requested_document_context: 'fiscal' }
        });

        expect(decision.decision).not.toBe(COMPLIANCE_DECISION.ALLOW);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.NON_COMPLIANT_FISCAL_DOCUMENT_BLOCKED);
    });

    test('non_fiscal POS_CHECKOUT still resolves to ALLOW (D-05 preserved for the demoted state)', () => {
        const decision = evaluateComplianceDecision({
            tenant: { id: 'biz-1', compliance_mode_state: COMPLIANCE_MODE_STATE.NON_COMPLIANT_ACTIVE },
            operation: COMPLIANCE_OPERATION.POS_CHECKOUT,
            context: { requested_document_context: 'non_fiscal' }
        });

        expect(decision.decision).toBe(COMPLIANCE_DECISION.ALLOW);
        expect(decision.reason_code).toBe(COMPLIANCE_REASON_CODE.ALLOWED);
    });
});
