import { jest } from '@jest/globals';
import {
    buildListStoreCatalogUseCase,
    buildListStoreLocationsUseCase,
    buildRegisterStoreCustomerUseCase,
    buildLoginStoreCustomerUseCase,
    buildStoreCartQuoteUseCase,
    buildTrackStoreOrderUseCase,
    buildCancelStoreOrderUseCase,
    buildGetStorefrontFollowStatusUseCase,
    buildFollowStorefrontUseCase,
    buildUnfollowStorefrontUseCase
} from '../src/modules/store/usecases/storeUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';
import { generateStoreCancelProof } from '../src/modules/store/utils/storeJwtToken.js';

describe('store use-cases application result contract', () => {
    const originalCustomerAccessFlag = process.env.CUSTOMER_ACCESS_MODES_ENABLED;

    afterEach(() => {
        if (originalCustomerAccessFlag === undefined) {
            delete process.env.CUSTOMER_ACCESS_MODES_ENABLED;
        } else {
            process.env.CUSTOMER_ACCESS_MODES_ENABLED = originalCustomerAccessFlag;
        }
    });

    it('listStoreCatalog returns availability-only fields without exposing current_stock', async () => {
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
                is_available: false,
                availability_status: 'out_of_stock'
            })
        ]);
        expect(result.data.items[0]).not.toHaveProperty('current_stock');
        expect(result.data.items[0]).not.toHaveProperty('cost_per_unit');
        expect(result.data.pagination).toEqual({
            limit: 20,
            count: 1
        });
    });

    it('listStoreCatalog derives is_available from availability_status when needed', async () => {
        const useCase = buildListStoreCatalogUseCase({
            storeRepository: {
                listStoreCatalog: jest.fn().mockResolvedValue([
                    {
                        item_id: 502,
                        name: 'Calamansi In Stock',
                        availability_status: 'in_stock',
                        default_sale_price: 25
                    }
                ])
            }
        });

        const result = await useCase({ query: { limit: 10 } });

        expect(result.success).toBe(true);
        expect(result.data.items[0]).toEqual(expect.objectContaining({
            item_id: 502,
            is_available: true,
            availability_status: 'in_stock'
        }));
        expect(result.data.items[0]).not.toHaveProperty('current_stock');
        expect(result.data.items[0]).not.toHaveProperty('cost_per_unit');
    });

    it('listStoreCatalog suppresses rows for ghost mode when enforcement is enabled', async () => {
        process.env.CUSTOMER_ACCESS_MODES_ENABLED = 'true';
        const storeRepository = {
            getSettingsByKeys: jest.fn().mockResolvedValue([
                { setting_key: 'customer_access_mode', setting_value: 'ghost' },
                { setting_key: 'inventory_display_mode', setting_value: 'availability' }
            ]),
            listStoreCatalog: jest.fn().mockResolvedValue([
                {
                    item_id: 503,
                    name: 'Hidden Item',
                    current_stock: 10,
                    default_sale_price: 25
                }
            ])
        };
        const useCase = buildListStoreCatalogUseCase({ storeRepository });

        const result = await useCase({ query: { limit: 10 } });

        expect(result.success).toBe(true);
        expect(result.data.items).toEqual([]);
        expect(result.data.access_policy.effective_customer_access_mode).toBe('ghost');
        expect(storeRepository.listStoreCatalog).not.toHaveBeenCalled();
    });

    it('storeCartQuote fail-closes for non-transaction effective modes', async () => {
        process.env.CUSTOMER_ACCESS_MODES_ENABLED = 'true';
        const useCase = buildStoreCartQuoteUseCase({
            storeRepository: {
                findSellableItemsByIds: jest.fn(),
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
                    allow_out_of_stock_sales: false
                }),
                getSettingsByKeys: jest.fn().mockResolvedValue([
                    { setting_key: 'customer_access_mode', setting_value: 'inquiry' },
                    {
                        setting_key: 'tenant_onboarding_progress',
                        setting_value: JSON.stringify({
                            step_payloads: {
                                business_classification: {
                                    legitimacy: { registration_status: 'registered' }
                                }
                            }
                        })
                    },
                    { setting_key: 'store_delivery_fee', setting_value: '0' },
                    { setting_key: 'pos_open_status', setting_value: 'true' }
                ])
            }
        });

        const result = await useCase({
            payload: {
                location_id: 3,
                order_method: 'pickup',
                payment_type: 'cash',
                customer_name: 'Buyer',
                customer_phone: '0917',
                lines: [{ item_id: 1, quantity: 1 }]
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.CUSTOMER_ACCESS_MODE_BLOCKED);
        expect(result.error.statusCode).toBe(403);
        expect(result.error.details).toEqual(expect.objectContaining({
            requested_action: 'quote_checkout',
            effective_mode: 'inquiry'
        }));
    });

    it('listStoreCatalog adds inventory_display labels without exposing stock', async () => {
        const useCase = buildListStoreCatalogUseCase({
            storeRepository: {
                getSettingsByKeys: jest.fn().mockResolvedValue([
                    { setting_key: 'inventory_display_mode', setting_value: 'low_stock' },
                    { setting_key: 'inventory_low_stock_display_threshold', setting_value: '5' }
                ]),
                listStoreCatalog: jest.fn().mockResolvedValue([
                    {
                        item_id: 504,
                        name: 'Low Stock Item',
                        current_stock: 3,
                        default_sale_price: 25,
                        availability_status: 'in_stock'
                    }
                ])
            }
        });

        const result = await useCase({ query: { limit: 10 } });

        expect(result.success).toBe(true);
        expect(result.data.items[0].inventory_display).toEqual({
            mode: 'low_stock',
            label: 'Only 3 left',
            display_quantity: 3
        });
        expect(result.data.items[0]).not.toHaveProperty('current_stock');
    });

    it('listStoreCatalog returns explicit location-invalid code when location_id is invalid', async () => {
        const useCase = buildListStoreCatalogUseCase({
            storeRepository: {
                listStoreCatalog: jest.fn()
            }
        });

        const result = await useCase({ query: { location_id: 'abc' } });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.STORE_CATALOG_LOCATION_INVALID);
        expect(result.error.statusCode).toBe(422);
    });

    it('listStoreCatalog returns explicit runtime code for unexpected repository failures', async () => {
        const useCase = buildListStoreCatalogUseCase({
            storeRepository: {
                listStoreCatalog: jest.fn().mockRejectedValue(new Error('db blew up'))
            }
        });

        const result = await useCase({ query: { limit: 10 } });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.STORE_CATALOG_RUNTIME_ERROR);
        expect(result.error.statusCode).toBe(500);
        expect(result.error.details).toEqual(expect.objectContaining({
            catalog_error_type: 'runtime_failure'
        }));
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

    it('storeCartQuote returns DGFY fee fields and total math for normal subtotal', async () => {
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
                    { setting_key: 'pos_open_status', setting_value: 'true' },
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

        expect(result.success).toBe(true);
        expect(Number(result.data.subtotal_amount)).toBeCloseTo(100, 4);
        expect(Number(result.data.service_fee_amount)).toBeCloseTo(1, 4);
        expect(result.data.service_fee_label).toBe('DGFY convenience fee');
        expect(Number(result.data.delivery_fee)).toBeCloseTo(20, 4);
        expect(Number(result.data.total_amount)).toBeCloseTo(121, 4);
    });

    it('storeCartQuote keeps deterministic DGFY fee label even when subtotal is zero', async () => {
        const useCase = buildStoreCartQuoteUseCase({
            storeRepository: {
                findSellableItemsByIds: jest.fn().mockResolvedValue([
                    {
                        item_id: 1,
                        name: 'Free Sample',
                        current_stock: 10,
                        default_sale_price: 0,
                        cost_per_unit: 0,
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
                    { setting_key: 'store_delivery_fee', setting_value: '0' },
                    { setting_key: 'pos_open_status', setting_value: 'true' }
                ])
            }
        });

        const result = await useCase({
            payload: {
                location_id: 3,
                order_method: 'pickup',
                payment_type: 'cash',
                customer_name: 'Buyer',
                customer_phone: '0917',
                lines: [{ item_id: 1, quantity: 1 }]
            }
        });

        expect(result.success).toBe(true);
        expect(Number(result.data.subtotal_amount)).toBeCloseTo(0, 4);
        expect(Number(result.data.service_fee_amount)).toBeCloseTo(0, 4);
        expect(result.data.service_fee_label).toBe('DGFY convenience fee');
        expect(Number(result.data.total_amount)).toBeCloseTo(0, 4);
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

    it('storefront follow returns 404 when storefront slug does not belong to tenant', async () => {
        const useCase = buildFollowStorefrontUseCase({
            storeRepository: {
                getSettingsByKeys: jest.fn().mockResolvedValue({
                    store_tenant_slug: { value: 'alpha-store' }
                }),
                upsertStorefrontFollow: jest.fn(),
                countStorefrontFollowsBySlug: jest.fn().mockResolvedValue(0)
            }
        });

        const result = await useCase({
            tenantId: '11111111-1111-4111-8111-111111111111',
            payload: {
                storefront_slug: 'beta-store',
                visitor_id: 'guestvisitorid-1234567890'
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe(DomainErrorCode.RESOURCE_NOT_FOUND);
        expect(result.error.statusCode).toBe(404);
    });

    it('storefront follow supports authenticated customer identity without visitor_id', async () => {
        const upsertStorefrontFollow = jest.fn().mockResolvedValue({ storefront_follow_id: 1 });
        const countStorefrontFollowsBySlug = jest.fn().mockResolvedValue(11);
        const useCase = buildFollowStorefrontUseCase({
            storeRepository: {
                getSettingsByKeys: jest.fn().mockResolvedValue({
                    store_tenant_slug: { value: 'alpha-store' }
                }),
                upsertStorefrontFollow,
                countStorefrontFollowsBySlug
            }
        });

        const result = await useCase({
            tenantId: '11111111-1111-4111-8111-111111111111',
            payload: { storefront_slug: 'alpha-store' },
            storeCustomer: { customer_id: 55 }
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            storefront_slug: 'alpha-store',
            is_following: true,
            followers_count: 11
        }));
        expect(upsertStorefrontFollow).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: expect.any(String),
            storefrontSlug: 'alpha-store',
            identityType: 'customer',
            visitorFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
        }));
    });

    it('storefront follow guest path requires visitor_id and can query status', async () => {
        const findStorefrontFollow = jest.fn().mockResolvedValue({ storefront_follow_id: 9 });
        const useCase = buildGetStorefrontFollowStatusUseCase({
            storeRepository: {
                getSettingsByKeys: jest.fn().mockResolvedValue({
                    store_tenant_slug: { value: 'alpha-store' }
                }),
                findStorefrontFollow,
                countStorefrontFollowsBySlug: jest.fn().mockResolvedValue(7)
            }
        });

        const result = await useCase({
            tenantId: '11111111-1111-4111-8111-111111111111',
            payload: {
                storefront_slug: 'alpha-store',
                visitor_id: 'guestvisitorid-1234567890'
            }
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            storefront_slug: 'alpha-store',
            is_following: true,
            followers_count: 7
        }));
        expect(findStorefrontFollow).toHaveBeenCalledWith(expect.objectContaining({
            identityType: 'guest',
            visitorFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/)
        }));
    });

    it('storefront unfollow is idempotent and returns deterministic state', async () => {
        const useCase = buildUnfollowStorefrontUseCase({
            storeRepository: {
                getSettingsByKeys: jest.fn().mockResolvedValue({
                    store_tenant_slug: { value: 'alpha-store' }
                }),
                deleteStorefrontFollow: jest.fn().mockResolvedValue(0),
                countStorefrontFollowsBySlug: jest.fn().mockResolvedValue(3)
            }
        });

        const result = await useCase({
            tenantId: '11111111-1111-4111-8111-111111111111',
            payload: {
                storefront_slug: 'alpha-store',
                visitor_id: 'guestvisitorid-1234567890'
            }
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(expect.objectContaining({
            storefront_slug: 'alpha-store',
            is_following: false,
            followers_count: 3
        }));
    });
});
