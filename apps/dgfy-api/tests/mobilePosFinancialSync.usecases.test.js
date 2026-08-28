import crypto from 'crypto';
import fs from 'fs';
import { jest } from '@jest/globals';

const mockGetAllSettingsUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/settings/index.js', () => ({
    getAllSettingsUseCase: mockGetAllSettingsUseCase
}));

let buildGetMobilePosDevicePolicyUseCase;
let buildGetMobilePosTransactionCheckpointUseCase;
let buildSyncMobilePosCheckoutsUseCase;
let buildSyncMobilePosVoidsUseCase;

beforeAll(async () => {
    ({
        buildGetMobilePosDevicePolicyUseCase,
        buildGetMobilePosTransactionCheckpointUseCase,
        buildSyncMobilePosCheckoutsUseCase,
        buildSyncMobilePosVoidsUseCase
    } = await import('../src/modules/pos/usecases/mobilePosUseCases.js'));
});

const seniorRule = {
    id: 1,
    type: 'senior',
    method: 'percentage',
    rate: 20,
    fixed_amount: null,
    is_vat_exempt: true,
    requires_customer_id: true,
    max_discount_amount: null,
    updated_at: '2026-08-27T00:00:00.000Z'
};

const policyRepository = () => ({
    getTerminalIdentityPolicySettings: jest.fn().mockResolvedValue({ registry_mode: 'enforced' }),
    findActiveDiscountRuleByType: jest.fn(async (type) => type === 'senior' ? seniorRule : null)
});

describe('mobile POS financial sync contracts', () => {
    const previousSecret = process.env.MOBILE_POS_POLICY_SIGNING_SECRET;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.MOBILE_POS_POLICY_SIGNING_SECRET = 'test-mobile-policy-secret';
        mockGetAllSettingsUseCase.mockResolvedValue({ success: true, data: {} });
    });

    it('injects the POS repository into the composed mobile checkout sync use case', () => {
        const compositionSource = fs.readFileSync(new URL('../src/modules/pos/index.js', import.meta.url), 'utf8');
        expect(compositionSource).toContain(
            'buildSyncMobilePosCheckoutsUseCase({ checkoutPosUseCase, posRepository })'
        );
    });

    afterAll(() => {
        if (previousSecret == null) delete process.env.MOBILE_POS_POLICY_SIGNING_SECRET;
        else process.env.MOBILE_POS_POLICY_SIGNING_SECRET = previousSecret;
    });

    it('issues a signed, expiring statutory policy and accepts that exact evidence on replay', async () => {
        const repository = policyRepository();
        const policyResult = await buildGetMobilePosDevicePolicyUseCase({ posRepository: repository })();
        const policy = policyResult.data.statutory_discount_policy;
        expect(policy).toMatchObject({ rules: [expect.objectContaining({ type: 'senior', rate: 20 })] });
        expect(policy.signature).toHaveLength(64);

        const checkoutPosUseCase = jest.fn().mockResolvedValue({
            success: true,
            data: { transaction: { pos_transaction_id: 44, payment_status: 'paid', updated_at: '2026-08-27T01:00:00.000Z' } }
        });
        const result = await buildSyncMobilePosCheckoutsUseCase({ checkoutPosUseCase, posRepository: repository })({
            payload: {
                device_id: 'device-1',
                entries: [{
                    local_transaction_id: 'sale-1',
                    payload: {
                        payment_type: 'cash',
                        governed_discount: { type: 'senior' },
                        offline_statutory_policy: {
                            version: policy.version,
                            expires_at: policy.expires_at,
                            signature: policy.signature
                        }
                    }
                }]
            },
            user: { user_id: 7 }
        });

        expect(result.success).toBe(true);
        expect(result.data.results[0]).toMatchObject({ status: 'accepted', server_transaction_id: 44 });
        expect(checkoutPosUseCase).toHaveBeenCalledWith(expect.objectContaining({
            trustedOfflineStatutoryPolicy: expect.objectContaining({
                discountType: 'senior',
                version: policy.version
            })
        }));
    });

    it('rejects tampered statutory evidence before checkout', async () => {
        const repository = policyRepository();
        const expiresAt = new Date(Date.now() + 60_000).toISOString();
        const checkoutPosUseCase = jest.fn();
        const result = await buildSyncMobilePosCheckoutsUseCase({ checkoutPosUseCase, posRepository: repository })({
            payload: {
                entries: [{
                    local_transaction_id: 'sale-2',
                    payload: {
                        governed_discount: { type: 'senior' },
                        offline_statutory_policy: { version: 'tampered', expires_at: expiresAt, signature: crypto.createHash('sha256').update('bad').digest('hex') }
                    }
                }]
            },
            user: { user_id: 7 }
        });

        expect(result.data.results[0]).toMatchObject({ status: 'rejected', error: { status_code: 409 } });
        expect(checkoutPosUseCase).not.toHaveBeenCalled();
    });

    it('returns a stable ordered checkpoint cursor', async () => {
        const listPosTransactionsUseCase = jest.fn().mockResolvedValue({
            success: true,
            data: {
                transactions: [
                    { pos_transaction_id: 1, updated_at: '2026-08-27T00:00:00.000Z' },
                    { pos_transaction_id: 2, updated_at: '2026-08-27T00:00:01.000Z' }
                ]
            }
        });
        const result = await buildGetMobilePosTransactionCheckpointUseCase({ listPosTransactionsUseCase })({
            query: { limit: 1 },
            user: { user_id: 7 }
        });

        expect(result.data).toMatchObject({
            checkpoint_version: 'mobile-pos.transactions.v1',
            transactions: [{ pos_transaction_id: 1 }],
            has_more: true,
            next_cursor: expect.any(String)
        });
    });

    it('reports accepted and conflicting voids independently', async () => {
        const voidPosTransactionUseCase = jest.fn()
            .mockResolvedValueOnce({ success: true, data: { transaction: { updated_at: '2026-08-27T01:00:00.000Z' } } })
            .mockResolvedValueOnce({ success: false, error: { message: 'Version conflict', code: 'CONFLICT', statusCode: 409, details: { reason_code: 'POS_VOID_VERSION_CONFLICT' } } });
        const result = await buildSyncMobilePosVoidsUseCase({ voidPosTransactionUseCase })({
            payload: {
                entries: [
                    { local_transaction_id: 'void-1', payload: { transaction_id: 1 } },
                    { local_transaction_id: 'void-2', payload: { transaction_id: 2 } }
                ]
            },
            user: { user_id: 7 }
        });

        expect(result.data.summary).toMatchObject({ accepted_count: 1, rejected_count: 1 });
        expect(result.data.results).toEqual([
            expect.objectContaining({ local_transaction_id: 'void-1', status: 'accepted' }),
            expect.objectContaining({ local_transaction_id: 'void-2', status: 'rejected' })
        ]);
        expect(voidPosTransactionUseCase).toHaveBeenNthCalledWith(1, expect.objectContaining({
            trustedMobileReplay: true,
            user: { user_id: 7 }
        }));
    });
});
