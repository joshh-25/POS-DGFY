import { jest } from '@jest/globals';

const mockRegisterStoreCustomerUseCase = jest.fn();
const mockListStoreCatalogUseCase = jest.fn();
const mockResolveStoreQrUseCase = jest.fn();
const mockListStoreLocationsUseCase = jest.fn();
const mockLoginStoreCustomerUseCase = jest.fn();
const mockGetStoreCustomerMeUseCase = jest.fn();
const mockListStoreCustomerAddressesUseCase = jest.fn();
const mockCreateStoreCustomerAddressUseCase = jest.fn();
const mockUpdateStoreCustomerAddressUseCase = jest.fn();
const mockSetDefaultStoreCustomerAddressUseCase = jest.fn();
const mockDeleteStoreCustomerAddressUseCase = jest.fn();
const mockStoreCartQuoteUseCase = jest.fn();
const mockRequestStoreGuestCheckoutOtpUseCase = jest.fn();
const mockVerifyStoreGuestCheckoutOtpUseCase = jest.fn();
const mockStoreCheckoutPaymentSessionUseCase = jest.fn();
const mockGetStoreCheckoutPaymentSessionUseCase = jest.fn();
const mockStoreCheckoutUseCase = jest.fn();
const mockTrackStoreOrderUseCase = jest.fn();
const mockClaimStoreOrderUseCase = jest.fn();
const mockCancelStoreOrderUseCase = jest.fn();
const mockListStoreCustomerOrdersUseCase = jest.fn();
const mockGetStorefrontFollowStatusUseCase = jest.fn();
const mockFollowStorefrontUseCase = jest.fn();
const mockUnfollowStorefrontUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/store/index.js', () => ({
    listStoreCatalogUseCase: mockListStoreCatalogUseCase,
    resolveStoreQrUseCase: mockResolveStoreQrUseCase,
    listStoreLocationsUseCase: mockListStoreLocationsUseCase,
    registerStoreCustomerUseCase: mockRegisterStoreCustomerUseCase,
    loginStoreCustomerUseCase: mockLoginStoreCustomerUseCase,
    getStoreCustomerMeUseCase: mockGetStoreCustomerMeUseCase,
    listStoreCustomerAddressesUseCase: mockListStoreCustomerAddressesUseCase,
    createStoreCustomerAddressUseCase: mockCreateStoreCustomerAddressUseCase,
    updateStoreCustomerAddressUseCase: mockUpdateStoreCustomerAddressUseCase,
    setDefaultStoreCustomerAddressUseCase: mockSetDefaultStoreCustomerAddressUseCase,
    deleteStoreCustomerAddressUseCase: mockDeleteStoreCustomerAddressUseCase,
    storeCartQuoteUseCase: mockStoreCartQuoteUseCase,
    requestStoreGuestCheckoutOtpUseCase: mockRequestStoreGuestCheckoutOtpUseCase,
    verifyStoreGuestCheckoutOtpUseCase: mockVerifyStoreGuestCheckoutOtpUseCase,
    storeCheckoutPaymentSessionUseCase: mockStoreCheckoutPaymentSessionUseCase,
    getStoreCheckoutPaymentSessionUseCase: mockGetStoreCheckoutPaymentSessionUseCase,
    storeCheckoutUseCase: mockStoreCheckoutUseCase,
    trackStoreOrderUseCase: mockTrackStoreOrderUseCase,
    claimStoreOrderUseCase: mockClaimStoreOrderUseCase,
    cancelStoreOrderUseCase: mockCancelStoreOrderUseCase,
    listStoreCustomerOrdersUseCase: mockListStoreCustomerOrdersUseCase,
    getStorefrontFollowStatusUseCase: mockGetStorefrontFollowStatusUseCase,
    followStorefrontUseCase: mockFollowStorefrontUseCase,
    unfollowStorefrontUseCase: mockUnfollowStorefrontUseCase
}));

let registerStoreCustomer;
let listStoreCatalog;
let listStoreLocations;
let trackOrder;
let createCheckoutPaymentSession;

beforeAll(async () => {
    const mod = await import('../src/modules/store/controllers/storeHandlers.js');
    registerStoreCustomer = mod.registerStoreCustomer;
    listStoreCatalog = mod.listStoreCatalog;
    listStoreLocations = mod.listStoreLocations;
    trackOrder = mod.trackOrder;
    createCheckoutPaymentSession = mod.createCheckoutPaymentSession;
});

const createRes = () => {
    const res = {
        locals: {},
        status: jest.fn(),
        json: jest.fn()
    };
    res.status.mockReturnValue(res);
    return res;
};

describe('storeHandlers transport contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('registerStoreCustomer returns stable success payload', async () => {
        mockRegisterStoreCustomerUseCase.mockResolvedValue({
            success: true,
            data: {
                customer: { customer_id: 11, email: 'buyer@example.com' },
                token: 'store.jwt.token'
            }
        });

        const req = {
            tenant: { id: 23 },
            validatedData: {
                name: 'Buyer',
                email: 'buyer@example.com',
                password: 'password123'
            },
            requestId: 'req-store-register'
        };
        const res = createRes();
        const next = jest.fn();

        await registerStoreCustomer(req, res, next);

        expect(mockRegisterStoreCustomerUseCase).toHaveBeenCalledWith({
            tenantId: 23,
            payload: req.validatedData
        });
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: {
                customer: { customer_id: 11, email: 'buyer@example.com' },
                token: 'store.jwt.token'
            },
            message: 'Store customer registered successfully',
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('derives the payment return URL from trusted custom-domain context', async () => {
        mockStoreCheckoutPaymentSessionUseCase.mockResolvedValue({ success: true, data: { payment_session: { session_id: 'pay-1' } } });
        const req = {
            headers: { 'x-store-slug': 'grand-matador' },
            body: { idempotency_key: 'checkout-123' },
            storefrontDomainContext: { domain: { hostname: 'grandmatador.com' } }
        };
        const res = createRes();
        await createCheckoutPaymentSession(req, res, jest.fn());
        expect(mockStoreCheckoutPaymentSessionUseCase).toHaveBeenCalledWith(expect.objectContaining({
            trustedReturnUrl: 'https://grandmatador.com/order'
        }));
        expect(res.status).toHaveBeenCalledWith(201);
    });

    it('listStoreLocations returns stable success payload', async () => {
        mockListStoreLocationsUseCase.mockResolvedValue({
            success: true,
            data: {
                primary_location_id: 2,
                locations: [{ location_id: 2, name: 'Main', is_primary_storefront: true }]
            }
        });

        const req = { requestId: 'req-store-locations' };
        const res = createRes();
        const next = jest.fn();

        await listStoreLocations(req, res, next);

        expect(mockListStoreLocationsUseCase).toHaveBeenCalledWith();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: {
                primary_location_id: 2,
                locations: [{ location_id: 2, name: 'Main', is_primary_storefront: true }]
            },
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('listStoreCatalog preserves availability-only payload contract', async () => {
        mockListStoreCatalogUseCase.mockResolvedValue({
            success: true,
            data: {
                items: [{
                    item_id: 2,
                    name: 'Demo Item',
                    is_available: true,
                    availability_status: 'in_stock'
                }],
                pagination: { limit: 60, count: 1 }
            }
        });

        const req = { requestId: 'req-store-catalog', query: {} };
        const res = createRes();
        const next = jest.fn();

        await listStoreCatalog(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: {
                items: [{
                    item_id: 2,
                    name: 'Demo Item',
                    is_available: true,
                    availability_status: 'in_stock'
                }],
                pagination: { limit: 60, count: 1 }
            },
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('trackOrder keeps 200 success contract for valid tracking pin', async () => {
        mockTrackStoreOrderUseCase.mockResolvedValue({
            success: true,
            data: {
                tracking_pin: 'SK-A1B2',
                status: 'rejected',
                message: 'This order was not accepted by the store.'
            }
        });

        const req = {
            params: { tracking_pin: 'SK-A1B2' },
            validatedParams: { tracking_pin: 'SK-A1B2' },
            requestId: 'req-store-track'
        };
        const res = createRes();
        const next = jest.fn();

        await trackOrder(req, res, next);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: {
                tracking_pin: 'SK-A1B2',
                status: 'rejected',
                message: 'This order was not accepted by the store.'
            },
            timestamp: expect.any(String)
        });
        expect(next).not.toHaveBeenCalled();
    });
});
