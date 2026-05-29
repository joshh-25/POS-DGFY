import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';

const mockUpdateDgfyCustomerAddressUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/dgfy/index.js', () => ({
    cancelDgfyCustomerOrderUseCase: jest.fn(),
    createDgfyCustomerAddressUseCase: jest.fn(),
    deleteDgfyCustomerAddressUseCase: jest.fn(),
    getDgfyCustomerDashboardUseCase: jest.fn(),
    getDgfyCustomerLoyaltyUseCase: jest.fn(),
    listDgfyCustomerReviewsForModerationUseCase: jest.fn(),
    listDgfyCustomerAddressesUseCase: jest.fn(),
    listDgfyCustomerActivitiesUseCase: jest.fn(),
    listDgfyCustomerBookingsUseCase: jest.fn(),
    listDgfyCustomerOrdersUseCase: jest.fn(),
    listPublicDgfyCustomerReviewsUseCase: jest.fn(),
    moderateDgfyCustomerReviewUseCase: jest.fn(),
    reorderDgfyCustomerOrderUseCase: jest.fn(),
    requestDgfyTrackingRecoveryUseCase: jest.fn(),
    submitDgfyCustomerReviewUseCase: jest.fn(),
    submitDgfyGuestReviewInviteUseCase: jest.fn(),
    trackDgfyCustomerReferenceUseCase: jest.fn(),
    updateDgfyCustomerAddressUseCase: mockUpdateDgfyCustomerAddressUseCase,
    validateDgfyReviewInviteUseCase: jest.fn(),
    verifyDgfyTrackingRecoveryUseCase: jest.fn()
}));

const createRes = () => {
    const res = {
        status: jest.fn(),
        json: jest.fn()
    };
    res.status.mockReturnValue(res);
    return res;
};

let setDefaultDgfyCustomerAddress;

beforeAll(async () => {
    ({ setDefaultDgfyCustomerAddress } = await import('../src/modules/dgfy/controllers/dgfyCustomerHandlers.js'));
});

describe('dgfyCustomerHandlers transport contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('maps the default-address alias to an is_default update for the authenticated DGFY account', async () => {
        mockUpdateDgfyCustomerAddressUseCase.mockResolvedValue({
            success: true,
            data: {
                address: {
                    address_id: 7,
                    address_line: 'Iloilo Home',
                    is_default: true
                }
            }
        });

        const req = {
            dgfyAccount: { id: 'dgfy-account-1' },
            params: { address_id: '7' }
        };
        const res = createRes();
        const next = jest.fn();

        await setDefaultDgfyCustomerAddress(req, res, next);

        expect(mockUpdateDgfyCustomerAddressUseCase).toHaveBeenCalledWith({
            account: req.dgfyAccount,
            addressId: '7',
            body: { is_default: true }
        });
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: {
                address: {
                    address_id: 7,
                    address_line: 'Iloilo Home',
                    is_default: true
                }
            },
            message: 'Default address updated successfully',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('registers the default-address route before the generic address patch route', () => {
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const routeSource = fs.readFileSync(path.join(__dirname, '../src/routes/dgfy.js'), 'utf8');
        const defaultAliasIndex = routeSource.indexOf("router.patch('/customer/addresses/:address_id/default'");
        const genericPatchIndex = routeSource.indexOf("router.patch('/customer/addresses/:address_id'");

        expect(defaultAliasIndex).toBeGreaterThan(-1);
        expect(genericPatchIndex).toBeGreaterThan(-1);
        expect(defaultAliasIndex).toBeLessThan(genericPatchIndex);
    });
});
