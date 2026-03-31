import { jest } from '@jest/globals';
import {
    buildListStoreCatalogUseCase,
    buildListStoreLocationsUseCase,
    buildRegisterStoreCustomerUseCase,
    buildLoginStoreCustomerUseCase,
    buildStoreCartQuoteUseCase,
    buildTrackStoreOrderUseCase,
    buildCancelStoreOrderUseCase
} from '../src/modules/store/usecases/storeUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import { generateStoreCancelProof } from '../src/modules/store/utils/storeJwtToken.js';

describe('store use-cases application result contract', () => {
    it('listStoreCatalog returns out-of-stock rows when repository marks item as visible', async () => {
        const useCase = buildListStoreCatalogUseCase({
            storeRepository: {
                listStoreCatalog: jest.fn().mockResolvedValue([
                    {
                        item_id: 501,
                        name: 'Calamansi Zero Stock',
                        current_stock: 0,
                        default_sale_price: 10
                    }
                ])
            }
        });

        const result = await useCase({ query: { search: 'calamansi', limit: 20 } });

        expect(result.success).toBe(true);
        expect(result.data.items).toEqual([
            expect.objectContaining({
                item_id: 501,
                current_stock: 0
            })
        ]);
        expect(result.data.pagination).toEqual({
            limit: 20,
            count: 1
        });
    });

    it('listStoreLocations returns active locations with primary pointer', async () => {
        const useCase = buildListStoreLocationsUseCase({
            storeRepository: {
                listActiveLocations: jest.fn().mockResolvedValue([
                    {
                        location_id: 2,
                        name: 'Main',
                        address_line: 'Address',
                        latitude: 10.7,
                        longitude: 122.5,
                        delivery_radius_km: 5,
                        is_open: true,
                        is_active: true,
                        is_primary_storefront: true,
                        current_wait_time_minutes: 15,
                        supports_delivery: true,
                        supports_pickup: true,
                        supports_dine_in: true
                    }
                ])
            }
        });

        const result = await useCase();

        expect(result.success).toBe(true);
        expect(result.data.primary_location_id).toBe(2);
        expect(result.data.locations).toHaveLength(1);
        expect(result.data.locations[0]).toEqual(expect.objectContaining({
            location_id: 2,
            is_primary_storefront: true
        }));
    });

    it('registerStoreCustomer validates payload shape', async () => {
        const useCase = buildRegisterStoreCustomerUseCase({
            storeRepository: {
                findCustomerByEmail: jest.fn(),
                createCustomer: jest.fn()
            }
        });

        const result = await useCase({ tenantId: 1, payload: null });
        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.statusCode).toBe(400);
    });

    it('registerStoreCustomer returns token and customer profile', async () => {
        const storeRepository = {
            findCustomerByEmail: jest.fn().mockResolvedValue(null),
            createCustomer: jest.fn().mockResolvedValue({
                customer_id: 7,
                email: 'demo@example.com',
                name: 'Demo Buyer',
                phone: '09123456789',
                is_active: true,
                last_login: null
            })
        };
        const useCase = buildRegisterStoreCustomerUseCase({ storeRepository });

        const result = await useCase({
            tenantId: 12,
            payload: {
                name: 'Demo Buyer',
                email: 'demo@example.com',
                phone: '09123456789',
                password: 'password123'
            }
        });

        expect(result.success).toBe(true);
        expect(result.data.customer).toEqual(expect.objectContaining({
            customer_id: 7,
            email: 'demo@example.com'
        }));
        expect(typeof result.data.token).toBe('string');
    });

    it('loginStoreCustomer fails on invalid password', async () => {
        const useCase = buildLoginStoreCustomerUseCase({
            storeRepository: {
                findCustomerByEmail: jest.fn().mockResolvedValue({
                    customer_id: 8,
                    email: 'demo@example.com',
                    password_hash: '$2a$10$7QJ4JqvV2fLhA9ANV4zhceDqcz4/X8r54tL8Pg0g4VCwq2fuh9xkq', // "password123"
                    name: 'Demo Buyer',
                    phone: null,
                    is_active: true
                }),
                updateCustomerById: jest.fn()
            }
        });

        const result = await useCase({
            tenantId: 12,
            payload: {
                email: 'demo@example.com',
                password: 'wrong-password'
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
        expect(result.error.statusCode).toBe(401);
    });

    it('storeCartQuote validates required lines', async () => {
        const useCase = buildStoreCartQuoteUseCase({
            storeRepository: {
                findSellableItemsByIds: jest.fn(),
                findLocationById: jest.fn(),
                getSettingsByKeys: jest.fn()
            }
        });

        const result = await useCase({
            payload: {
                order_method: 'delivery',
                payment_type: 'cash',
                customer_name: 'Buyer',
                customer_phone: '0912',
                lines: []
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    });

    it('storeCartQuote blocks checkout when storefront is closed by POS open status', async () => {
        const useCase = buildStoreCartQuoteUseCase({
            storeRepository: {
                findSellableItemsByIds: jest.fn().mockResolvedValue([
                    {
                        item_id: 1,
                        name: 'Sample Item',
                        current_stock: 10,
                        default_sale_price: 100,
                        cost_per_unit: 60,
                        unit_of_measure: 'pc',
                        vat_type: 'vatable'
                    }
                ]),
                findLocationById: jest.fn().mockResolvedValue({
                    location_id: 3,
                    name: 'Main',
                    address_line: 'Test',
                    latitude: 14.5,
                    longitude: 121.0,
                    delivery_radius_km: 5,
                    is_open: true,
                    is_active: true,
                    supports_delivery: true,
                    supports_pickup: true,
                    supports_dine_in: true,
                    allow_out_of_stock_sales: false,
                    current_wait_time_minutes: 15
                }),
                getSettingsByKeys: jest.fn().mockResolvedValue([
                    { setting_key: 'store_delivery_fee', setting_value: '20' },
                    { setting_key: 'pos_open_status', setting_value: 'false' },
                    { setting_key: 'pos_wait_time_minutes', setting_value: '25' }
                ])
            }
        });

        const result = await useCase({
            payload: {
                location_id: 3,
                order_method: 'delivery',
                payment_type: 'cash',
                customer_name: 'Buyer',
                customer_phone: '0917',
                delivery_address: 'Address',
                lines: [{ item_id: 1, quantity: 1 }]
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
    });

    it('storeCartQuote blocks unsupported location order method capabilities', async () => {
        const useCase = buildStoreCartQuoteUseCase({
            storeRepository: {
                findSellableItemsByIds: jest.fn().mockResolvedValue([
                    {
                        item_id: 1,
                        name: 'Sample Item',
                        current_stock: 10,
                        default_sale_price: 100,
                        cost_per_unit: 60,
                        unit_of_measure: 'pc',
                        vat_type: 'vatable'
                    }
                ]),
                findLocationById: jest.fn().mockResolvedValue({
                    location_id: 4,
                    name: 'Pickup Only',
                    address_line: 'Test',
                    latitude: 14.5,
                    longitude: 121.0,
                    delivery_radius_km: 5,
                    is_open: true,
                    is_active: true,
                    supports_delivery: false,
                    supports_pickup: true,
                    supports_dine_in: false,
                    allow_out_of_stock_sales: false,
                    current_wait_time_minutes: 10
                }),
                getSettingsByKeys: jest.fn().mockResolvedValue([
                    { setting_key: 'store_delivery_fee', setting_value: '20' },
                    { setting_key: 'pos_open_status', setting_value: 'true' }
                ])
            }
        });

        const result = await useCase({
            payload: {
                location_id: 4,
                order_method: 'delivery',
                payment_type: 'cash',
                customer_name: 'Buyer',
                customer_phone: '0917',
                delivery_address: 'Address',
                lines: [{ item_id: 1, quantity: 1 }]
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.CONFLICT);
    });

    it('storeCartQuote returns structured stock violation details on over-stock request', async () => {
        const useCase = buildStoreCartQuoteUseCase({
            storeRepository: {
                findSellableItemsByIds: jest.fn().mockResolvedValue([
                    {
                        item_id: 9,
                        name: 'Calamansi Puree',
                        current_stock: 2,
                        default_sale_price: 40,
                        cost_per_unit: 20,
                        unit_of_measure: 'g',
                        vat_type: 'vatable'
                    }
                ]),
                findLocationById: jest.fn().mockResolvedValue({
                    location_id: 2,
                    name: 'Main',
                    address_line: 'Address',
                    latitude: 10.7,
                    longitude: 122.5,
                    delivery_radius_km: 5,
                    is_open: true,
                    is_active: true,
                    supports_delivery: true,
                    supports_pickup: true,
                    supports_dine_in: true,
                    allow_out_of_stock_sales: false,
                    current_wait_time_minutes: 15
                }),
                getSettingsByKeys: jest.fn().mockResolvedValue([
                    { setting_key: 'store_delivery_fee', setting_value: '20' },
                    { setting_key: 'pos_open_status', setting_value: 'true' }
                ])
            }
        });

        const result = await useCase({
            payload: {
                location_id: 2,
                order_method: 'delivery',
                payment_type: 'cash',
                customer_name: 'Buyer',
                customer_phone: '0917',
                delivery_address: 'Address',
                lines: [{ item_id: 9, quantity: 5 }]
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
        expect(result.error.details?.stock_violation).toEqual(expect.objectContaining({
            item_id: 9,
            item_name: 'Calamansi Puree',
            available_stock: 2,
            requested_qty: 5,
            unit_of_measure: 'g'
        }));
        expect(Array.isArray(result.error.details?.stock_violations)).toBe(true);
        expect(result.error.details?.stock_violations).toHaveLength(1);
    });

    it('trackStoreOrder returns tracking payload for valid pin', async () => {
        const tenantId = '11111111-1111-4111-8111-111111111111';
        const useCase = buildTrackStoreOrderUseCase({
            storeRepository: {
                getOrderByTrackingPin: jest.fn().mockResolvedValue({
                    pos_transaction_id: 90,
                    tracking_pin: 'SK-A1B2',
                    order_source: 'online_store',
                    order_method: 'delivery',
                    payment_type: 'cash',
                    fulfillment_status: 'placed',
                    subtotal_amount: 100,
                    delivery_fee: 20,
                    total_amount: 120,
                    customer_phone: '09170000000',
                    customer_email: 'buyer@example.com',
                    delivery_address: '123 Test Street',
                    lines: []
                })
            }
        });

        const result = await useCase({ trackingPin: 'SK-A1B2', tenantId });
        expect(result.success).toBe(true);
        expect(result.data.status).toBe('placed');
        expect(result.data.order.tracking_pin).toBe('SK-A1B2');
        expect(result.data.order.customer_phone).toBeUndefined();
        expect(result.data.order.customer_email).toBeUndefined();
        expect(result.data.order.delivery_address).toBeUndefined();
    });

    it('cancelStoreOrder rejects guest cancellation without cancel proof', async () => {
        const transaction = {
            finished: false,
            commit: jest.fn(async () => { transaction.finished = true; }),
            rollback: jest.fn(async () => { transaction.finished = true; })
        };

        const useCase = buildCancelStoreOrderUseCase({
            storeRepository: {
                beginTransaction: jest.fn().mockResolvedValue(transaction),
                getOrderByTrackingPin: jest.fn().mockResolvedValue({
                    pos_transaction_id: 91,
                    tracking_pin: 'SK-A1B2',
                    fulfillment_status: 'placed',
                    store_customer_id: null
                }),
                updateOrderByTrackingPin: jest.fn()
            }
        });

        const result = await useCase({
            trackingPin: 'SK-A1B2',
            tenantId: '11111111-1111-4111-8111-111111111111',
            payload: {}
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
        expect(result.error.statusCode).toBe(401);
    });

    it('cancelStoreOrder accepts guest cancellation with valid cancel proof', async () => {
        const transaction = {
            finished: false,
            commit: jest.fn(async () => { transaction.finished = true; }),
            rollback: jest.fn(async () => { transaction.finished = true; })
        };
        const tenantId = '11111111-1111-4111-8111-111111111111';
        const existing = {
            pos_transaction_id: 91,
            tracking_pin: 'SK-A1B2',
            fulfillment_status: 'placed',
            store_customer_id: null,
            lines: []
        };
        const updated = {
            ...existing,
            fulfillment_status: 'cancelled'
        };

        const getOrderByTrackingPin = jest
            .fn()
            .mockResolvedValueOnce(existing)
            .mockResolvedValueOnce(updated);

        const useCase = buildCancelStoreOrderUseCase({
            storeRepository: {
                beginTransaction: jest.fn().mockResolvedValue(transaction),
                getOrderByTrackingPin,
                updateOrderByTrackingPin: jest.fn().mockResolvedValue(updated)
            }
        });

        const cancelProof = generateStoreCancelProof({
            trackingPin: existing.tracking_pin,
            tenantId,
            orderId: existing.pos_transaction_id
        });

        const result = await useCase({
            trackingPin: 'SK-A1B2',
            tenantId,
            payload: {
                cancel_proof: cancelProof
            }
        });

        expect(result.success).toBe(true);
        expect(result.data.status).toBe('cancelled');
    });

    it('cancelStoreOrder rejects authenticated user if order belongs to a different store customer', async () => {
        const transaction = {
            finished: false,
            commit: jest.fn(async () => { transaction.finished = true; }),
            rollback: jest.fn(async () => { transaction.finished = true; })
        };

        const useCase = buildCancelStoreOrderUseCase({
            storeRepository: {
                beginTransaction: jest.fn().mockResolvedValue(transaction),
                getOrderByTrackingPin: jest.fn().mockResolvedValue({
                    pos_transaction_id: 101,
                    tracking_pin: 'SK-A1B2',
                    fulfillment_status: 'placed',
                    store_customer_id: 77
                }),
                updateOrderByTrackingPin: jest.fn()
            }
        });

        const result = await useCase({
            trackingPin: 'SK-A1B2',
            tenantId: '11111111-1111-4111-8111-111111111111',
            storeCustomer: { customer_id: 55 }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.AUTHORIZATION_FAILED);
        expect(result.error.statusCode).toBe(403);
    });
});
