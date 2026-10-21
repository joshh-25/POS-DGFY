export const AFFILIATE_LOCAL_PREVIEW_QUERY_PARAM = 'affiliate_preview';

const PREVIEW_ENABLED_VALUES = new Set(['1', 'true', 'yes']);

export const isAffiliateLocalPreviewEnabled = () => {
    if (typeof window === 'undefined') return false;
    const value = new URLSearchParams(window.location.search)
        .get(AFFILIATE_LOCAL_PREVIEW_QUERY_PARAM)
        ?.trim()
        .toLowerCase();
    return PREVIEW_ENABLED_VALUES.has(value);
};

const account = (firstName, lastName, email) => ({
    first_name: firstName,
    last_name: lastName,
    email
});

const earnings = (pending, available, paid) => ({
    pending_centavos: pending,
    available_centavos: available,
    paid_centavos: paid
});

const enrollment = ({
    enrollmentId,
    shortCode,
    status,
    rateBps,
    salesCentavos,
    joinedAt,
    firstName,
    lastName,
    email,
    pendingCentavos,
    availableCentavos,
    paidCentavos,
    revokedAt,
    revokedBy,
    revocationReason
}) => ({
    enrollment_id: enrollmentId,
    short_code: shortCode,
    status,
    commission_rate_bps: rateBps,
    attributed_sales_centavos: salesCentavos,
    activated_at: status === 'active' ? joinedAt : null,
    created_at: joinedAt,
    revoked_at: revokedAt || null,
    revoked_by: revokedBy || null,
    revocation_reason: revocationReason || null,
    dgfyAccount: account(firstName, lastName, email),
    earnings: earnings(pendingCentavos, availableCentavos, paidCentavos)
});

const cashout = ({
    cashoutId,
    enrollmentId,
    status,
    amountCentavos,
    requestedAt,
    payoutSnapshot,
    externalPaymentRef,
    rejectionReason,
    affiliate
}) => ({
    cashout_id: cashoutId,
    enrollment_id: enrollmentId,
    status,
    amount_centavos: amountCentavos,
    requested_at: requestedAt,
    payout_snapshot: payoutSnapshot,
    external_payment_ref: externalPaymentRef || null,
    rejection_reason: rejectionReason || null,
    enrollment: {
        enrollment_id: affiliate.enrollment_id,
        dgfyAccount: { ...affiliate.dgfyAccount }
    }
});

export const createAffiliateLocalPreviewData = () => {
    const john = enrollment({
        enrollmentId: 9101,
        shortCode: 'AF-JDOE01',
        status: 'active',
        rateBps: 500,
        salesCentavos: 1250000,
        joinedAt: '2026-01-15T00:00:00.000Z',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        pendingCentavos: 22500,
        availableCentavos: 35000,
        paidCentavos: 80000
    });
    const jane = enrollment({
        enrollmentId: 9102,
        shortCode: 'AF-JSMITH02',
        status: 'active',
        rateBps: 750,
        salesCentavos: 875000,
        joinedAt: '2026-02-03T00:00:00.000Z',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        pendingCentavos: 15000,
        availableCentavos: 20000,
        paidCentavos: 50000
    });
    const david = enrollment({
        enrollmentId: 9103,
        shortCode: 'AF-DREYES03',
        status: 'pending',
        rateBps: null,
        salesCentavos: 0,
        joinedAt: '2026-02-18T00:00:00.000Z',
        firstName: 'David',
        lastName: 'Reyes',
        email: 'david.reyes@example.com',
        pendingCentavos: 0,
        availableCentavos: 0,
        paidCentavos: 0
    });
    const mark = enrollment({
        enrollmentId: 9104,
        shortCode: 'AF-MVILLA04',
        status: 'suspended',
        rateBps: 1000,
        salesCentavos: 430000,
        joinedAt: '2025-12-08T00:00:00.000Z',
        firstName: 'Mark',
        lastName: 'Villafuerte',
        email: 'mark.villafuerte@example.com',
        pendingCentavos: 8000,
        availableCentavos: 12000,
        paidCentavos: 30000
    });
    const lena = enrollment({
        enrollmentId: 9105,
        shortCode: 'AF-LCHEN05',
        status: 'revoked',
        rateBps: 500,
        salesCentavos: 210000,
        joinedAt: '2025-11-21T00:00:00.000Z',
        firstName: 'Lena',
        lastName: 'Chen',
        email: 'lena.chen@example.com',
        pendingCentavos: 0,
        availableCentavos: 0,
        paidCentavos: 18000,
        revokedAt: '2026-03-01T00:00:00.000Z',
        revokedBy: 42,
        revocationReason: 'Preview fixture'
    });
    const maria = enrollment({
        enrollmentId: 9106,
        shortCode: 'AF-MSANTOS06',
        status: 'active',
        rateBps: 650,
        salesCentavos: 315000,
        joinedAt: '2026-03-07T00:00:00.000Z',
        firstName: 'Maria',
        lastName: 'Santos',
        email: 'maria.santos@example.com',
        pendingCentavos: 9200,
        availableCentavos: 18000,
        paidCentavos: 12000
    });
    const noah = enrollment({
        enrollmentId: 9107,
        shortCode: 'AF-NCRUZ07',
        status: 'pending',
        rateBps: null,
        salesCentavos: 0,
        joinedAt: '2026-03-12T00:00:00.000Z',
        firstName: 'Noah',
        lastName: 'Cruz',
        email: 'noah.cruz@example.com',
        pendingCentavos: 0,
        availableCentavos: 0,
        paidCentavos: 0
    });
    const oliver = enrollment({
        enrollmentId: 9108,
        shortCode: 'AF-OREYES08',
        status: 'suspended',
        rateBps: 800,
        salesCentavos: 285000,
        joinedAt: '2026-03-18T00:00:00.000Z',
        firstName: 'Oliver',
        lastName: 'Reyes',
        email: 'oliver.reyes@example.com',
        pendingCentavos: 4000,
        availableCentavos: 7000,
        paidCentavos: 9000
    });

    return {
        settings: {
            program_enabled: true,
            default_rate_bps: 500,
            min_cashout_centavos: 20000,
            auto_approve_enrollment: false,
            commission_type: 'PERCENTAGE_OF_BASE',
            settlement_policy: null,
            commission_base_mode: 'discounted_subtotal'
        },
        affiliates: [john, jane, david, mark, lena, maria, noah, oliver],
        cashouts: [
            cashout({
                cashoutId: 9501,
                enrollmentId: john.enrollment_id,
                status: 'requested',
                amountCentavos: 18000,
                requestedAt: '2026-03-05T00:00:00.000Z',
                payoutSnapshot: { method_type: 'gcash', mobile_number: '09171234567' },
                affiliate: john
            }),
            cashout({
                cashoutId: 9502,
                enrollmentId: jane.enrollment_id,
                status: 'approved',
                amountCentavos: 25000,
                requestedAt: '2026-03-01T00:00:00.000Z',
                payoutSnapshot: {
                    method_type: 'bank',
                    bank_name: 'BDO',
                    account_number: '****1234',
                    account_name: 'Jane Smith'
                },
                affiliate: jane
            }),
            cashout({
                cashoutId: 9503,
                enrollmentId: mark.enrollment_id,
                status: 'paid',
                amountCentavos: 12000,
                requestedAt: '2026-02-15T00:00:00.000Z',
                externalPaymentRef: 'DEMO-PAY-9503',
                payoutSnapshot: { method_type: 'maya', mobile_number: '09987654321' },
                affiliate: mark
            }),
            cashout({
                cashoutId: 9504,
                enrollmentId: lena.enrollment_id,
                status: 'rejected',
                amountCentavos: 8000,
                requestedAt: '2026-02-10T00:00:00.000Z',
                rejectionReason: 'Preview fixture',
                payoutSnapshot: {
                    method_type: 'bank',
                    bank_name: 'UnionBank',
                    account_number: '****5678',
                    account_name: 'Lena Chen'
                },
                affiliate: lena
            })
        ],
        invites: [
            {
                invite_id: 9701,
                email: 'preview.invite@example.com',
                status: 'pending',
                created_at: '2026-02-20T08:00:00.000Z'
            },
            {
                invite_id: 9702,
                email: 'second.invite@example.com',
                status: 'pending',
                created_at: '2026-02-19T08:00:00.000Z'
            },
            {
                invite_id: 9703,
                email: 'partner.invite@example.com',
                status: 'pending',
                created_at: '2026-02-18T08:00:00.000Z'
            },
            {
                invite_id: 9704,
                email: 'sales.invite@example.com',
                status: 'pending',
                created_at: '2026-02-17T08:00:00.000Z'
            },
            {
                invite_id: 9705,
                email: 'new.affiliate@example.com',
                status: 'pending',
                created_at: '2026-02-16T08:00:00.000Z'
            }
        ],
        priceRules: []
    };
};
