import {
    buildCreateServiceBookingUseCase,
    buildCreateServiceBookingBatchUseCase,
    buildCreateServiceBookingHoldUseCase,
    buildCreateServiceAssignmentUseCase,
    buildGetServiceAvailabilityUseCase,
    buildCreateServiceWaitlistEntryUseCase,
    buildGetServiceBookingByReferenceUseCase,
    buildListServiceCatalogUseCase,
    buildListServiceClientsUseCase,
    buildQueueDueServiceRemindersUseCase,
    buildSendDueServiceRemindersUseCase,
    buildServiceDashboardUseCase,
    buildUpdateServiceBookingStatusUseCase
} from '../src/modules/services/usecases/serviceUseCases.js';
import { jest } from '@jest/globals';

const transaction = () => ({
    finished: false,
    commit: jest.fn(async function commit() {
        this.finished = 'commit';
    }),
    rollback: jest.fn(async function rollback() {
        this.finished = 'rollback';
    })
});

const serviceItem = {
    item_id: 10,
    name: 'Consultation',
    default_sale_price: 750,
    vat_type: 'vatable',
    serviceDetail: {
        service_detail_id: 5,
        service_category: 'General',
        duration_minutes: 60,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        lead_time_minutes: 0,
        bookable: true,
        payment_policy: 'customer_choice'
    }
};

const nextDateForWeekday = (targetWeekday) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    const daysUntilTarget = (targetWeekday - date.getDay() + 7) % 7;
    date.setDate(date.getDate() + daysUntilTarget + 7);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
};

const registeredTransactionSettings = () => [
    { setting_key: 'customer_access_mode', setting_value: 'transaction' },
    {
        setting_key: 'tenant_onboarding_progress',
        setting_value: JSON.stringify({
            step_payloads: {
                business_classification: {
                    legitimacy: { registration_status: 'registered' }
                }
            }
        })
    }
];

const storefrontClosedMondaySettings = () => [
    ...registeredTransactionSettings(),
    {
        setting_key: 'storefront_hours',
        setting_value: JSON.stringify({
            mode: 'weekly',
            timezone: 'Asia/Manila',
            weekly: {
                sun: { enabled: false, open: '09:00', close: '18:00' },
                mon: { enabled: false, open: '09:00', close: '18:00' },
                tue: { enabled: true, open: '09:00', close: '18:00' },
                wed: { enabled: true, open: '09:00', close: '18:00' },
                thu: { enabled: true, open: '09:00', close: '18:00' },
                fri: { enabled: true, open: '09:00', close: '18:00' },
                sat: { enabled: true, open: '09:00', close: '18:00' }
            }
        })
    }
];

const storefrontSplitMondaySettings = () => [
    ...registeredTransactionSettings(),
    {
        setting_key: 'storefront_hours',
        setting_value: JSON.stringify({
            mode: 'weekly',
            timezone: 'Asia/Manila',
            weekly: {
                sun: { enabled: false, open: '09:00', close: '18:00' },
                mon: {
                    enabled: true,
                    open: '06:00',
                    close: '12:00',
                    intervals: [
                        { open: '06:00', close: '12:00' },
                        { open: '13:00', close: '20:00' }
                    ]
                },
                tue: { enabled: true, open: '09:00', close: '18:00' },
                wed: { enabled: true, open: '09:00', close: '18:00' },
                thu: { enabled: true, open: '09:00', close: '18:00' },
                fri: { enabled: true, open: '09:00', close: '18:00' },
                sat: { enabled: true, open: '09:00', close: '18:00' }
            }
        })
    }
];

describe('Services Mode use cases', () => {
    const originalCustomerAccessFlag = process.env.CUSTOMER_ACCESS_MODES_ENABLED;

    afterEach(() => {
        if (originalCustomerAccessFlag === undefined) {
            delete process.env.CUSTOMER_ACCESS_MODES_ENABLED;
        } else {
            process.env.CUSTOMER_ACCESS_MODES_ENABLED = originalCustomerAccessFlag;
        }
    });

    it('redacts customer contact data from public booking lookup', async () => {
        const useCase = buildGetServiceBookingByReferenceUseCase({
            serviceRepository: {
                getBookingByReference: jest.fn(async () => ({
                    booking_id: 1,
                    public_reference: 'SV-ABC123',
                    service_item_id: 10,
                    serviceItem: serviceItem,
                    customer_name: 'Private Customer',
                    customer_email: 'private@example.com',
                    customer_phone: '09999999999',
                    start_at: new Date('2026-06-01T09:00:00Z'),
                    end_at: new Date('2026-06-01T10:00:00Z'),
                    status: 'requested',
                    payment_timing: 'postpaid',
                    payment_status: 'unpaid',
                    intake_responses: '{"concern":"Synthetic QA"}'
                }))
            }
        });

        const result = await useCase({ publicReference: 'SV-ABC123' });

        expect(result.success).toBe(true);
        expect(result.data.booking.public_reference).toBe('SV-ABC123');
        expect(result.data.booking.customer_name).toBeUndefined();
        expect(result.data.booking.customer_email).toBeUndefined();
        expect(result.data.booking.customer_phone).toBeUndefined();
        expect(result.data.booking.total_amount).toBe(750);
        expect(result.data.booking.intake_responses).toEqual({ concern: 'Synthetic QA' });
    });

    it('never exposes the linked POS transaction on the public booking lookup (IDOR regression)', async () => {
        // Regression test: pos_transaction_id / pos_transaction (invoice_number, tracking_pin,
        // total_amount, ...) must stay internal-only. An unauthenticated caller who guesses or
        // replays a public_reference must not be able to read another transaction's details back.
        const useCase = buildGetServiceBookingByReferenceUseCase({
            serviceRepository: {
                getBookingByReference: jest.fn(async () => ({
                    booking_id: 1,
                    public_reference: 'SV-ABC123',
                    service_item_id: 10,
                    serviceItem: serviceItem,
                    customer_name: 'Private Customer',
                    customer_email: 'private@example.com',
                    customer_phone: '09999999999',
                    start_at: new Date('2026-06-01T09:00:00Z'),
                    end_at: new Date('2026-06-01T10:00:00Z'),
                    status: 'requested',
                    payment_timing: 'postpaid',
                    payment_status: 'unpaid',
                    pos_transaction_id: 4242,
                    posTransaction: {
                        pos_transaction_id: 4242,
                        invoice_number: 'INV-2026-004242',
                        tracking_pin: 'TRACK-SECRET',
                        payment_type: 'cash',
                        total_amount: 5000,
                        document_type: 'invoice',
                        document_context: {}
                    }
                }))
            }
        });

        const result = await useCase({ publicReference: 'SV-ABC123' });

        expect(result.success).toBe(true);
        expect(result.data.booking.pos_transaction_id).toBeUndefined();
        expect(result.data.booking.pos_transaction).toBeUndefined();
    });

    it('returns dashboard metrics with the same keys consumed by IMS', async () => {
        const useCase = buildServiceDashboardUseCase({
            serviceRepository: {
                countBookingsByStatus: jest.fn(async () => [{ status: 'no_show', count: 2 }]),
                getDashboardMetrics: jest.fn(async () => ({
                    future_bookings: 3,
                    today_bookings: 2,
                    checked_in_count: 1,
                    in_service_count: 1,
                    reminders_due: 2,
                    overdue_no_show_candidates: 1,
                    expected_revenue: 2250,
                    postpaid_aging_total: 750
                })),
                countWaitlistByStatus: jest.fn(async () => [{ status: 'waiting', count: 4 }])
            }
        });

        const result = await useCase();

        expect(result.success).toBe(true);
        expect(result.data.booking_counts.no_show).toBe(2);
        expect(result.data.booking_status_counts.no_show).toBe(2);
        expect(result.data.future_bookings).toBe(3);
        expect(result.data.today_bookings).toBe(2);
        expect(result.data.checked_in_count).toBe(1);
        expect(result.data.in_service_count).toBe(1);
        expect(result.data.reminders_due).toBe(2);
        expect(result.data.overdue_no_show_candidates).toBe(1);
        expect(result.data.waiting_waitlist_count).toBe(4);
        expect(result.data.expected_revenue).toBe(2250);
        expect(result.data.postpaid_aging_total).toBe(750);
    });

    it('normalizes service intake form schemas for storefront catalog consumers', async () => {
        const listServiceCatalog = jest.fn(async () => ([{
            ...serviceItem,
            sku_code: 'SVC-001',
            description: 'Consultation service',
            unit_of_measure: 'service',
            cost_per_unit: 250,
            status: 'active',
            serviceDetail: {
                ...serviceItem.serviceDetail,
                visible_in_storefront: true,
                visible_in_pos: true,
                intake_form_schema: JSON.stringify([
                    { key: 'concern', label: 'Concern', required: true }
                ])
            }
        }]));
        const useCase = buildListServiceCatalogUseCase({
            serviceRepository: {
                listServiceCatalog
            }
        });

        const result = await useCase({ query: { limit: 20, location_id: 3 }, storefrontOnly: true });

        expect(result.success).toBe(true);
        expect(listServiceCatalog).toHaveBeenCalledWith(expect.objectContaining({
            storefrontOnly: true,
            location_id: 3
        }));
        expect(result.data.services[0].service_detail.intake_form_schema).toEqual({
            fields: [{ key: 'concern', label: 'Concern', required: true }]
        });
    });

    it('returns not-found for public service availability when the service is disabled at the requested branch', async () => {
        const findServiceItemById = jest.fn(async () => null);
        const useCase = buildGetServiceAvailabilityUseCase({
            serviceRepository: {
                findServiceItemById
            }
        });

        const result = await useCase({
            query: {
                service_item_id: 10,
                date: nextDateForWeekday(1),
                location_id: 3
            },
            storefrontOnly: true
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
        expect(findServiceItemById).toHaveBeenCalledWith(10, { storefrontLocationId: 3 });
    });

    it('rejects invalid booking status jumps', async () => {
        const tx = transaction();
        const useCase = buildUpdateServiceBookingStatusUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getBookingById: jest.fn(async () => ({
                    booking_id: 1,
                    status: 'requested',
                    serviceItem
                })),
                updateBookingById: jest.fn()
            }
        });

        const result = await useCase({ bookingId: 1, payload: { status: 'completed' } });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(tx.rollback).toHaveBeenCalled();
    });

    it('blocks booking against a resource blackout date', async () => {
        const tx = transaction();
        const useCase = buildCreateServiceBookingUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getSettingsByKeys: jest.fn(async () => registeredTransactionSettings()),
                findServiceItemById: jest.fn(async () => serviceItem),
                findResourceById: jest.fn(async () => ({
                    resource_id: 7,
                    name: 'Room 1',
                    capacity: 1,
                    is_active: true,
                    blackout_dates: ['2026-06-01']
                })),
                listActiveAssignmentsForService: jest.fn(async () => []),
                findConflictingBookings: jest.fn(async () => []),
                findStoreCustomerByEmail: jest.fn(async () => null),
                isBookingReferenceTaken: jest.fn(async () => false),
                createBooking: jest.fn()
            }
        });

        const result = await useCase({
            payload: {
                service_item_id: 10,
                resource_id: 7,
                start_at: '2026-06-01T09:00:00Z',
                customer_name: 'Guest',
                customer_email: 'guest@example.com',
                idempotency_key: 'svc-blackout-1'
            },
            source: 'storefront'
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.message).toContain('blacked out');
        expect(tx.rollback).toHaveBeenCalled();
    });

    it('blocks storefront bookings when the service is disabled at the requested branch', async () => {
        const tx = transaction();
        const findServiceItemById = jest.fn(async () => null);
        const useCase = buildCreateServiceBookingUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getSettingsByKeys: jest.fn(async () => registeredTransactionSettings()),
                findServiceItemById
            }
        });

        const result = await useCase({
            payload: {
                service_item_id: 10,
                location_id: 3,
                start_at: `${nextDateForWeekday(2)}T09:00:00+08:00`,
                customer_name: 'Guest',
                customer_email: 'guest@example.com',
                idempotency_key: 'svc-branch-disabled-1'
            },
            source: 'storefront'
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
        expect(findServiceItemById).toHaveBeenCalledWith(10, expect.objectContaining({
            transaction: tx,
            lock: true,
            storefrontLocationId: 3
        }));
        expect(tx.rollback).toHaveBeenCalled();
    });

    it('fail-closes storefront service bookings outside transaction mode', async () => {
        process.env.CUSTOMER_ACCESS_MODES_ENABLED = 'true';
        const tx = transaction();
        const useCase = buildCreateServiceBookingUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getSettingsByKeys: jest.fn(async () => [
                    { setting_key: 'customer_access_mode', setting_value: 'catalog' },
                    {
                        setting_key: 'tenant_onboarding_progress',
                        setting_value: JSON.stringify({
                            step_payloads: {
                                business_classification: {
                                    legitimacy: { registration_status: 'registered' }
                                }
                            }
                        })
                    }
                ]),
                findServiceItemById: jest.fn()
            }
        });

        const result = await useCase({
            payload: {
                service_item_id: 10,
                start_at: '2026-06-01T09:00:00Z',
                customer_name: 'Guest',
                customer_email: 'guest@example.com',
                idempotency_key: 'svc-access-1'
            },
            source: 'storefront'
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CUSTOMER_ACCESS_MODE_BLOCKED');
        expect(tx.rollback).toHaveBeenCalled();
    });

    it('accepts service booking quantity when resource capacity allows', async () => {
        const tx = transaction();
        const createBooking = jest.fn(async (payload) => ({ booking_id: 11, ...payload }));
        const useCase = buildCreateServiceBookingUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getSettingsByKeys: jest.fn(async () => registeredTransactionSettings()),
                findServiceItemById: jest.fn(async () => serviceItem),
                findResourceById: jest.fn(async () => ({
                    resource_id: 7,
                    name: 'Room 1',
                    capacity: 3,
                    is_active: true,
                    weekly_availability: null,
                    blackout_dates: []
                })),
                listActiveAssignmentsForService: jest.fn(async () => []),
                findConflictingBookings: jest.fn(async () => [{
                    booking_id: 10,
                    resource_id: 7,
                    quantity: 1,
                    start_at: new Date('2026-06-01T09:00:00Z'),
                    end_at: new Date('2026-06-01T10:00:00Z'),
                    status: 'confirmed'
                }]),
                findStoreCustomerByEmail: jest.fn(async () => null),
                isBookingReferenceTaken: jest.fn(async () => false),
                createBooking,
                getBookingById: jest.fn(async (bookingId) => ({
                    booking_id: bookingId,
                    public_reference: 'SV-QTY123',
                    service_item_id: 10,
                    serviceItem,
                    resource_id: 7,
                    quantity: 2,
                    start_at: new Date('2026-06-01T09:00:00Z'),
                    end_at: new Date('2026-06-01T10:00:00Z'),
                    status: 'requested',
                    payment_timing: 'postpaid',
                    payment_status: 'unpaid'
                }))
            }
        });

        const result = await useCase({
            payload: {
                service_item_id: 10,
                resource_id: 7,
                quantity: 2,
                start_at: '2026-06-01T09:00:00Z',
                customer_name: 'Guest',
                customer_email: 'guest@example.com',
                idempotency_key: 'svc-capacity-ok-1'
            },
            source: 'storefront'
        });

        expect(result.success).toBe(true);
        expect(result.data.booking.quantity).toBe(2);
        expect(result.data.booking.total_amount).toBe(1500);
        expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({ quantity: 2 }), expect.any(Object));
        expect(tx.commit).toHaveBeenCalled();
    });

    it('marks guest service bookings with a new email as eligible for DGFY account signup', async () => {
        const tx = transaction();
        const createBooking = jest.fn(async (payload) => ({ booking_id: 13, ...payload }));
        const useCase = buildCreateServiceBookingUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getSettingsByKeys: jest.fn(async () => registeredTransactionSettings()),
                findServiceItemById: jest.fn(async () => serviceItem),
                findResourceById: jest.fn(async () => ({
                    resource_id: 7,
                    name: 'Room 1',
                    capacity: 1,
                    is_active: true,
                    weekly_availability: null,
                    blackout_dates: []
                })),
                listActiveAssignmentsForService: jest.fn(async () => []),
                findConflictingBookings: jest.fn(async () => []),
                findStoreCustomerByEmail: jest.fn(async () => null),
                isBookingReferenceTaken: jest.fn(async () => false),
                createBooking,
                getBookingById: jest.fn(async (bookingId) => ({
                    booking_id: bookingId,
                    public_reference: 'SV-GUEST1',
                    service_item_id: 10,
                    serviceItem,
                    resource_id: 7,
                    quantity: 1,
                    start_at: new Date('2026-06-01T09:00:00Z'),
                    end_at: new Date('2026-06-01T10:00:00Z'),
                    status: 'requested',
                    payment_timing: 'postpaid',
                    payment_status: 'unpaid'
                }))
            }
        });

        const result = await useCase({
            payload: {
                service_item_id: 10,
                resource_id: 7,
                start_at: '2026-06-01T09:00:00Z',
                customer_name: 'Ana Guest',
                customer_email: 'guest-service@example.test',
                idempotency_key: 'svc-guest-new-email'
            },
            source: 'storefront'
        });

        expect(result.success).toBe(true);
        expect(result.data.account_action).toEqual(expect.objectContaining({
            type: 'offer_signup',
            allow_image_download: true,
            show_signup: true,
            claim_token: expect.any(String)
        }));
        expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({
            store_customer_id: null,
            customer_email: 'guest-service@example.test',
            claim_token_hash: expect.any(String),
            claim_token_expires_at: expect.any(Date)
        }), expect.any(Object));
        expect(tx.commit).toHaveBeenCalled();
    });

    it('links authenticated service bookings to the DGFY customer account', async () => {
        const tx = transaction();
        const findStoreCustomerByEmail = jest.fn();
        const createBooking = jest.fn(async (payload) => ({ booking_id: 14, ...payload }));
        const useCase = buildCreateServiceBookingUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getSettingsByKeys: jest.fn(async () => registeredTransactionSettings()),
                findServiceItemById: jest.fn(async () => serviceItem),
                findResourceById: jest.fn(async () => ({
                    resource_id: 7,
                    name: 'Room 1',
                    capacity: 1,
                    is_active: true,
                    weekly_availability: null,
                    blackout_dates: []
                })),
                listActiveAssignmentsForService: jest.fn(async () => []),
                findConflictingBookings: jest.fn(async () => []),
                findStoreCustomerByEmail,
                isBookingReferenceTaken: jest.fn(async () => false),
                createBooking,
                getBookingById: jest.fn(async (bookingId) => ({
                    booking_id: bookingId,
                    public_reference: 'SV-AUTH1',
                    service_item_id: 10,
                    serviceItem,
                    resource_id: 7,
                    quantity: 1,
                    start_at: new Date('2026-06-01T11:00:00Z'),
                    end_at: new Date('2026-06-01T12:00:00Z'),
                    status: 'requested',
                    payment_timing: 'postpaid',
                    payment_status: 'unpaid'
                }))
            }
        });

        const result = await useCase({
            payload: {
                service_item_id: 10,
                resource_id: 7,
                start_at: '2026-06-01T11:00:00Z',
                customer_name: 'Ana Account',
                customer_email: 'account-service@example.test',
                idempotency_key: 'svc-auth-account'
            },
            source: 'storefront',
            storeCustomer: {
                customer_id: 42,
                name: 'Ana Account',
                email: 'account-service@example.test',
                phone: '09123456789'
            }
        });

        expect(result.success).toBe(true);
        expect(result.data.account_action).toEqual(expect.objectContaining({
            type: 'linked_authenticated',
            allow_image_download: true,
            show_signup: false,
            claim_token: null
        }));
        expect(findStoreCustomerByEmail).not.toHaveBeenCalled();
        expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({
            store_customer_id: 42,
            customer_email: 'account-service@example.test'
        }), expect.any(Object));
        expect(createBooking.mock.calls[0][0]).not.toHaveProperty('claim_token_hash');
        expect(createBooking.mock.calls[0][0]).not.toHaveProperty('claim_token_expires_at');
        expect(tx.commit).toHaveBeenCalled();
    });

    it('returns public service availability only when resource capacity can satisfy quantity', async () => {
        const monday = nextDateForWeekday(1);
        const useCase = buildGetServiceAvailabilityUseCase({
            serviceRepository: {
                findServiceItemById: jest.fn(async () => serviceItem),
                listActiveAssignmentsForService: jest.fn(async () => [{ item_id: 10, resource_id: 7, location_id: 1, is_active: true }]),
                findResourceById: jest.fn(async () => ({
                    resource_id: 7,
                    name: 'Room 1',
                    location_id: 1,
                    capacity: 3,
                    is_active: true,
                    weekly_availability: null,
                    blackout_dates: []
                })),
                findAvailabilityConflicts: jest.fn(async () => [{
                    booking_id: 44,
                    resource_id: 7,
                    quantity: 1,
                    start_at: new Date(`${monday}T09:00:00`),
                    end_at: new Date(`${monday}T10:00:00`),
                    status: 'confirmed'
                }])
            }
        });

        const result = await useCase({
            query: {
                service_item_id: 10,
                date: monday,
                location_id: 1,
                quantity: 2,
                slot_interval_minutes: 60
            },
            storefrontOnly: true
        });

        expect(result.success).toBe(true);
        expect(result.data.available).toBe(true);
        expect(result.data.slots.length).toBeGreaterThan(0);
        expect(result.data.slots[0]).toEqual(expect.objectContaining({
            resource_id: 7,
            capacity_anchor: 'resource',
            available_capacity: 2
        }));
        expect(result.data.diagnostics.conflict_query_strategy).toBe('window_prefetch');
        expect(result.data.diagnostics.max_candidate_capacity).toBe(3);
    });

    it('returns no public service availability when quantity exceeds location-only capacity', async () => {
        const monday = nextDateForWeekday(1);
        const useCase = buildGetServiceAvailabilityUseCase({
            serviceRepository: {
                findServiceItemById: jest.fn(async () => serviceItem),
                listActiveAssignmentsForService: jest.fn(async () => []),
                findConflictingBookings: jest.fn(async () => [])
            }
        });

        const result = await useCase({
            query: {
                service_item_id: 10,
                date: monday,
                location_id: 1,
                quantity: 2,
                slot_interval_minutes: 60
            },
            storefrontOnly: true
        });

        expect(result.success).toBe(true);
        expect(result.data.available).toBe(false);
        expect(result.data.unavailable_reason).toBe('requested_quantity_exceeds_capacity_anchor');
        expect(result.data.slots).toHaveLength(0);
        expect(result.data.capacity_contract.location_capacity).toBe(1);
        expect(result.data.diagnostics.guidance).toContain('Quantity above 1 requires');
    });

    it('builds public service availability from resource weekly windows, not only fallback hours', async () => {
        const monday = nextDateForWeekday(1);
        const useCase = buildGetServiceAvailabilityUseCase({
            serviceRepository: {
                findServiceItemById: jest.fn(async () => serviceItem),
                listActiveAssignmentsForService: jest.fn(async () => [{ item_id: 10, resource_id: 7, location_id: 1, is_active: true }]),
                findResourceById: jest.fn(async () => ({
                    resource_id: 7,
                    name: 'Evening Room',
                    location_id: 1,
                    capacity: 2,
                    is_active: true,
                    weekly_availability: { monday: [{ start: '18:00', end: '20:00' }] },
                    blackout_dates: []
                })),
                findConflictingBookings: jest.fn(async () => [])
            }
        });

        const result = await useCase({
            query: {
                service_item_id: 10,
                date: monday,
                location_id: 1,
                quantity: 1,
                slot_interval_minutes: 60
            },
            storefrontOnly: true
        });

        expect(result.success).toBe(true);
        expect(result.data.available).toBe(true);
        expect(new Date(result.data.slots[0].start_at).getHours()).toBe(18);
        expect(result.data.slots.every((slot) => new Date(slot.start_at).getHours() >= 18)).toBe(true);
    });

    it('returns availability diagnostics for fully booked generated slots', async () => {
        const monday = nextDateForWeekday(1);
        const useCase = buildGetServiceAvailabilityUseCase({
            serviceRepository: {
                findServiceItemById: jest.fn(async () => serviceItem),
                listActiveAssignmentsForService: jest.fn(async () => [{ item_id: 10, resource_id: 7, location_id: 1, is_active: true }]),
                findResourceById: jest.fn(async () => ({
                    resource_id: 7,
                    name: 'Room 1',
                    location_id: 1,
                    capacity: 1,
                    is_active: true,
                    weekly_availability: { monday: [{ start: '09:00', end: '11:00' }] },
                    blackout_dates: []
                })),
                findAvailabilityConflicts: jest.fn(async () => [{
                    booking_id: 44,
                    resource_id: 7,
                    quantity: 1,
                    start_at: new Date(`${monday}T09:00:00`),
                    end_at: new Date(`${monday}T11:00:00`),
                    status: 'confirmed'
                }])
            }
        });

        const result = await useCase({
            query: {
                service_item_id: 10,
                date: monday,
                location_id: 1,
                quantity: 1,
                slot_interval_minutes: 60
            },
            storefrontOnly: true
        });

        expect(result.success).toBe(true);
        expect(result.data.available).toBe(false);
        expect(result.data.unavailable_reason).toBe('overlapping_booking_capacity_full');
        expect(result.data.diagnostics.guidance).toContain('already booked');
        expect(result.data.diagnostics.conflict_query_strategy).toBe('window_prefetch');
    });

    it('creates a short-lived booking hold that consumes resource capacity', async () => {
        const tx = transaction();
        const createBookingHold = jest.fn(async (payload) => ({ hold_id: 1, ...payload }));
        const useCase = buildCreateServiceBookingHoldUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getSettingsByKeys: jest.fn(async () => registeredTransactionSettings()),
                findServiceItemById: jest.fn(async () => serviceItem),
                findResourceById: jest.fn(async () => ({
                    resource_id: 7,
                    name: 'Room 1',
                    location_id: 1,
                    capacity: 2,
                    is_active: true,
                    weekly_availability: null,
                    blackout_dates: []
                })),
                listActiveAssignmentsForService: jest.fn(async () => [{ item_id: 10, resource_id: 7, location_id: 1, is_active: true }]),
                findConflictingBookings: jest.fn(async () => []),
                findConflictingHolds: jest.fn(async () => []),
                findHoldsByIdempotencyKey: jest.fn(async () => []),
                createBookingHold
            }
        });

        const result = await useCase({
            payload: {
                service_item_id: 10,
                resource_id: 7,
                location_id: 1,
                quantity: 2,
                start_at: '2026-06-01T09:00:00',
                idempotency_key: 'svc-hold-create-1'
            },
            source: 'storefront'
        });

        expect(result.success).toBe(true);
        expect(result.data.hold.hold_token).toMatch(/^hold_/);
        expect(result.data.hold.quantity).toBe(2);
        expect(createBookingHold).toHaveBeenCalledWith(expect.objectContaining({
            service_item_id: 10,
            resource_id: 7,
            quantity: 2,
            status: 'active'
        }), expect.any(Object));
        expect(tx.commit).toHaveBeenCalled();
    });

    it('blocks storefront service booking holds outside configured business hours', async () => {
        const tx = transaction();
        const repository = {
            beginTransaction: jest.fn(async () => tx),
            getSettingsByKeys: jest.fn(async () => storefrontClosedMondaySettings()),
            findHoldsByIdempotencyKey: jest.fn(async () => []),
            findServiceItemById: jest.fn()
        };
        const useCase = buildCreateServiceBookingHoldUseCase({ serviceRepository: repository });

        const result = await useCase({
            payload: {
                service_item_id: 10,
                start_at: '2026-06-01T10:00:00+08:00',
                idempotency_key: 'svc-hold-hours-1'
            },
            source: 'storefront'
        });

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('OUTSIDE_STOREFRONT_BUSINESS_HOURS');
        expect(repository.findServiceItemById).not.toHaveBeenCalled();
        expect(tx.rollback).toHaveBeenCalled();
    });

    it('allows storefront service booking holds inside either split interval before service validation', async () => {
        const morningTx = transaction();
        const afternoonTx = transaction();
        const repository = {
            beginTransaction: jest.fn()
                .mockResolvedValueOnce(morningTx)
                .mockResolvedValueOnce(afternoonTx),
            getSettingsByKeys: jest.fn(async () => storefrontSplitMondaySettings()),
            findHoldsByIdempotencyKey: jest.fn(async () => []),
            findServiceItemById: jest.fn(async () => null)
        };
        const useCase = buildCreateServiceBookingHoldUseCase({ serviceRepository: repository });

        const morning = await useCase({
            payload: {
                service_item_id: 10,
                start_at: '2026-06-01T07:30:00+08:00',
                idempotency_key: 'svc-hold-hours-split-morning'
            },
            source: 'storefront'
        });
        const afternoon = await useCase({
            payload: {
                service_item_id: 10,
                start_at: '2026-06-01T13:30:00+08:00',
                idempotency_key: 'svc-hold-hours-split-afternoon'
            },
            source: 'storefront'
        });

        expect(morning.error?.details?.reason_code).not.toBe('OUTSIDE_STOREFRONT_BUSINESS_HOURS');
        expect(afternoon.error?.details?.reason_code).not.toBe('OUTSIDE_STOREFRONT_BUSINESS_HOURS');
        expect(repository.findServiceItemById).toHaveBeenCalledTimes(2);
    });

    it('blocks storefront service booking holds during the closed gap between split intervals', async () => {
        const tx = transaction();
        const repository = {
            beginTransaction: jest.fn(async () => tx),
            getSettingsByKeys: jest.fn(async () => storefrontSplitMondaySettings()),
            findHoldsByIdempotencyKey: jest.fn(async () => []),
            findServiceItemById: jest.fn()
        };
        const useCase = buildCreateServiceBookingHoldUseCase({ serviceRepository: repository });

        const result = await useCase({
            payload: {
                service_item_id: 10,
                start_at: '2026-06-01T12:30:00+08:00',
                idempotency_key: 'svc-hold-hours-split-gap'
            },
            source: 'storefront'
        });

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('OUTSIDE_STOREFRONT_BUSINESS_HOURS');
        expect(repository.findServiceItemById).not.toHaveBeenCalled();
        expect(tx.rollback).toHaveBeenCalled();
    });

    it('blocks storefront service bookings outside configured business hours before service lookup', async () => {
        const tx = transaction();
        const repository = {
            beginTransaction: jest.fn(async () => tx),
            getSettingsByKeys: jest.fn(async () => storefrontClosedMondaySettings()),
            findServiceItemById: jest.fn()
        };
        const useCase = buildCreateServiceBookingUseCase({ serviceRepository: repository });

        const result = await useCase({
            payload: {
                service_item_id: 10,
                start_at: '2026-06-01T10:00:00+08:00',
                customer_name: 'Guest',
                customer_email: 'guest@example.com',
                idempotency_key: 'svc-booking-hours-1'
            },
            source: 'storefront'
        });

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('OUTSIDE_STOREFRONT_BUSINESS_HOURS');
        expect(repository.findServiceItemById).not.toHaveBeenCalled();
        expect(tx.rollback).toHaveBeenCalled();
    });

    it('blocks storefront service booking batches when any draft is outside configured business hours', async () => {
        const tx = transaction();
        const repository = {
            beginTransaction: jest.fn(async () => tx),
            getSettingsByKeys: jest.fn(async () => storefrontClosedMondaySettings()),
            findServiceItemById: jest.fn()
        };
        const useCase = buildCreateServiceBookingBatchUseCase({ serviceRepository: repository });

        const result = await useCase({
            payload: {
                customer_name: 'Guest',
                customer_email: 'guest@example.com',
                idempotency_key: 'svc-batch-hours-1',
                bookings: [{
                    service_item_id: 10,
                    start_at: '2026-06-01T10:00:00+08:00'
                }]
            },
            source: 'storefront'
        });

        expect(result.success).toBe(false);
        expect(result.error.details.reason_code).toBe('OUTSIDE_STOREFRONT_BUSINESS_HOURS');
        expect(result.error.details.booking_index).toBeUndefined();
        expect(repository.findServiceItemById).not.toHaveBeenCalled();
        expect(tx.rollback).toHaveBeenCalled();
    });

    it('replaces a previous active hold without blocking itself on capacity-one resources', async () => {
        const tx = transaction();
        const createBookingHold = jest.fn(async (payload) => ({ hold_id: 9, ...payload }));
        const updateHoldById = jest.fn(async () => null);
        const findConflictingHolds = jest.fn(async ({ excludeHoldId }) => (
            excludeHoldId === 4 ? [] : [{
                hold_id: 4,
                resource_id: 7,
                quantity: 1,
                start_at: new Date('2026-06-01T09:00:00'),
                end_at: new Date('2026-06-01T10:00:00'),
                status: 'active'
            }]
        ));
        const useCase = buildCreateServiceBookingHoldUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getSettingsByKeys: jest.fn(async () => registeredTransactionSettings()),
                findServiceItemById: jest.fn(async () => serviceItem),
                findActiveHoldByToken: jest.fn(async () => ({
                    hold_id: 4,
                    hold_token: 'hold_existing',
                    service_item_id: 10,
                    resource_id: 7,
                    location_id: 1,
                    quantity: 1,
                    start_at: new Date('2026-06-01T09:00:00'),
                    end_at: new Date('2026-06-01T10:00:00'),
                    status: 'active',
                    source: 'storefront',
                    expires_at: new Date(Date.now() + 600000)
                })),
                findResourceById: jest.fn(async () => ({
                    resource_id: 7,
                    name: 'Room 1',
                    location_id: 1,
                    capacity: 1,
                    is_active: true,
                    weekly_availability: null,
                    blackout_dates: []
                })),
                listActiveAssignmentsForService: jest.fn(async () => [{ item_id: 10, resource_id: 7, location_id: 1, is_active: true }]),
                findConflictingBookings: jest.fn(async () => []),
                findConflictingHolds,
                findHoldsByIdempotencyKey: jest.fn(async () => []),
                createBookingHold,
                updateHoldById
            }
        });

        const result = await useCase({
            payload: {
                service_item_id: 10,
                resource_id: 7,
                location_id: 1,
                quantity: 1,
                start_at: '2026-06-01T09:00:00',
                replace_hold_token: 'hold_existing',
                idempotency_key: 'svc-hold-replace-1'
            },
            source: 'storefront'
        });

        expect(result.success).toBe(true);
        expect(findConflictingHolds).toHaveBeenCalledWith(expect.objectContaining({ excludeHoldId: 4 }), expect.any(Object));
        expect(updateHoldById).toHaveBeenCalledWith(4, { status: 'cancelled' }, expect.any(Object));
        expect(createBookingHold).toHaveBeenCalled();
        expect(tx.commit).toHaveBeenCalled();
    });

    it('consumes a matching active booking hold when creating the final booking', async () => {
        const tx = transaction();
        const updateHoldById = jest.fn(async () => null);
        const createBooking = jest.fn(async (payload) => ({ booking_id: 88, ...payload }));
        const useCase = buildCreateServiceBookingUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getSettingsByKeys: jest.fn(async () => registeredTransactionSettings()),
                findServiceItemById: jest.fn(async () => serviceItem),
                findActiveHoldByToken: jest.fn(async () => ({
                    hold_id: 5,
                    hold_token: 'hold_matching',
                    service_item_id: 10,
                    resource_id: 7,
                    location_id: 1,
                    quantity: 1,
                    start_at: new Date('2026-06-01T09:00:00'),
                    end_at: new Date('2026-06-01T10:00:00'),
                    status: 'active',
                    expires_at: new Date(Date.now() + 600000)
                })),
                findResourceById: jest.fn(async () => ({
                    resource_id: 7,
                    name: 'Room 1',
                    location_id: 1,
                    capacity: 1,
                    is_active: true,
                    weekly_availability: null,
                    blackout_dates: []
                })),
                listActiveAssignmentsForService: jest.fn(async () => [{ item_id: 10, resource_id: 7, location_id: 1, is_active: true }]),
                findConflictingBookings: jest.fn(async () => []),
                findConflictingHolds: jest.fn(async () => []),
                findStoreCustomerByEmail: jest.fn(async () => null),
                isBookingReferenceTaken: jest.fn(async () => false),
                createBooking,
                updateHoldById,
                getBookingById: jest.fn(async (bookingId) => ({
                    booking_id: bookingId,
                    public_reference: 'SV-HOLD1',
                    service_item_id: 10,
                    serviceItem,
                    resource_id: 7,
                    location_id: 1,
                    quantity: 1,
                    start_at: new Date('2026-06-01T09:00:00'),
                    end_at: new Date('2026-06-01T10:00:00'),
                    status: 'requested',
                    payment_timing: 'postpaid',
                    payment_status: 'unpaid'
                }))
            }
        });

        const result = await useCase({
            payload: {
                service_item_id: 10,
                resource_id: 7,
                location_id: 1,
                quantity: 1,
                start_at: '2026-06-01T09:00:00',
                customer_name: 'Guest',
                customer_email: 'guest@example.com',
                idempotency_key: 'svc-hold-consume-1',
                hold_token: 'hold_matching'
            },
            source: 'storefront'
        });

        expect(result.success).toBe(true);
        expect(updateHoldById).toHaveBeenCalledWith(5, { status: 'consumed' }, expect.any(Object));
        expect(createBooking).toHaveBeenCalled();
        expect(tx.commit).toHaveBeenCalled();
    });

    it('rejects storefront service booking when sale price is not positive', async () => {
        const tx = transaction();
        const createBooking = jest.fn();
        const useCase = buildCreateServiceBookingUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getSettingsByKeys: jest.fn(async () => registeredTransactionSettings()),
                findServiceItemById: jest.fn(async () => ({ ...serviceItem, default_sale_price: 0 })),
                listActiveAssignmentsForService: jest.fn(async () => []),
                findConflictingBookings: jest.fn(async () => []),
                createBooking,
                getBookingById: jest.fn()
            }
        });

        const result = await useCase({
            payload: {
                service_item_id: 10,
                quantity: 1,
                start_at: '2026-06-01T09:00:00Z',
                customer_name: 'Guest',
                customer_email: 'guest@example.com',
                idempotency_key: 'svc-price-block-1'
            },
            source: 'storefront'
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(result.error.message).toContain('positive sale price');
        expect(createBooking).not.toHaveBeenCalled();
        expect(tx.rollback).toHaveBeenCalled();
    });

    it('auto-selects an assigned resource for storefront quantity when capacity allows', async () => {
        const tx = transaction();
        const createBooking = jest.fn(async (payload) => ({ booking_id: 12, ...payload }));
        const useCase = buildCreateServiceBookingUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getSettingsByKeys: jest.fn(async () => registeredTransactionSettings()),
                findServiceItemById: jest.fn(async () => serviceItem),
                findResourceById: jest.fn(async () => ({
                    resource_id: 7,
                    name: 'Room 1',
                    location_id: 1,
                    capacity: 3,
                    is_active: true,
                    weekly_availability: null,
                    blackout_dates: []
                })),
                listActiveAssignmentsForService: jest.fn(async () => [{ item_id: 10, resource_id: 7, location_id: 1, is_active: true }]),
                findConflictingBookings: jest.fn(async () => []),
                findStoreCustomerByEmail: jest.fn(async () => null),
                isBookingReferenceTaken: jest.fn(async () => false),
                createBooking,
                getBookingById: jest.fn(async (id) => ({
                    booking_id: id,
                    public_reference: 'SV-AUTO1',
                    service_item_id: 10,
                    serviceItem,
                    resource_id: 7,
                    location_id: 1,
                    quantity: 2,
                    start_at: new Date('2026-06-01T09:00:00Z'),
                    end_at: new Date('2026-06-01T10:00:00Z'),
                    status: 'requested',
                    payment_timing: 'postpaid',
                    payment_status: 'unpaid'
                }))
            }
        });

        const result = await useCase({
            payload: {
                service_item_id: 10,
                quantity: 2,
                location_id: 1,
                start_at: '2026-06-01T09:00:00Z',
                customer_name: 'Guest',
                customer_email: 'guest@example.com',
                idempotency_key: 'svc-auto-capacity-1'
            },
            source: 'storefront'
        });

        expect(result.success).toBe(true);
        expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({ resource_id: 7, quantity: 2 }), expect.any(Object));
        expect(result.data.booking.resource_id).toBe(7);
        expect(tx.commit).toHaveBeenCalled();
    });

    it('rejects location-only service quantity without a capacity anchor', async () => {
        const tx = transaction();
        const createBooking = jest.fn();
        const useCase = buildCreateServiceBookingUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getSettingsByKeys: jest.fn(async () => registeredTransactionSettings()),
                findServiceItemById: jest.fn(async () => serviceItem),
                listActiveAssignmentsForService: jest.fn(async () => []),
                findConflictingBookings: jest.fn(async () => []),
                createBooking,
                getBookingById: jest.fn()
            }
        });

        const result = await useCase({
            payload: {
                service_item_id: 10,
                quantity: 2,
                location_id: 1,
                start_at: '2026-06-01T09:00:00Z',
                customer_name: 'Guest',
                customer_email: 'guest@example.com',
                idempotency_key: 'svc-location-only-1'
            },
            source: 'storefront'
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(createBooking).not.toHaveBeenCalled();
        expect(tx.rollback).toHaveBeenCalled();
    });

    it('rejects service booking quantity that exceeds overlapping resource capacity', async () => {
        const tx = transaction();
        const useCase = buildCreateServiceBookingUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getSettingsByKeys: jest.fn(async () => registeredTransactionSettings()),
                findServiceItemById: jest.fn(async () => serviceItem),
                findResourceById: jest.fn(async () => ({
                    resource_id: 7,
                    name: 'Room 1',
                    capacity: 2,
                    is_active: true,
                    weekly_availability: null,
                    blackout_dates: []
                })),
                listActiveAssignmentsForService: jest.fn(async () => []),
                findConflictingBookings: jest.fn(async () => [{
                    booking_id: 10,
                    resource_id: 7,
                    quantity: 1,
                    start_at: new Date('2026-06-01T09:00:00Z'),
                    end_at: new Date('2026-06-01T10:00:00Z'),
                    status: 'confirmed'
                }]),
                findStoreCustomerByEmail: jest.fn(async () => null),
                isBookingReferenceTaken: jest.fn(async () => false),
                createBooking: jest.fn()
            }
        });

        const result = await useCase({
            payload: {
                service_item_id: 10,
                resource_id: 7,
                quantity: 2,
                start_at: '2026-06-01T09:00:00Z',
                customer_name: 'Guest',
                customer_email: 'guest@example.com',
                idempotency_key: 'svc-capacity-block-1'
            },
            source: 'storefront'
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(tx.rollback).toHaveBeenCalled();
    });

    it('creates multiple service bookings in an all-or-nothing batch', async () => {
        const tx = transaction();
        let bookingId = 20;
        const createBooking = jest.fn(async (payload) => ({ booking_id: bookingId += 1, ...payload }));
        const useCase = buildCreateServiceBookingBatchUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getSettingsByKeys: jest.fn(async () => registeredTransactionSettings()),
                findServiceItemById: jest.fn(async () => serviceItem),
                findResourceById: jest.fn(async (resourceId) => ({
                    resource_id: resourceId,
                    name: `Room ${resourceId}`,
                    capacity: 4,
                    is_active: true,
                    weekly_availability: null,
                    blackout_dates: []
                })),
                listActiveAssignmentsForService: jest.fn(async () => []),
                findConflictingBookings: jest.fn(async () => []),
                findStoreCustomerByEmail: jest.fn(async () => null),
                isBookingReferenceTaken: jest.fn(async () => false),
                createBooking,
                getBookingById: jest.fn(async (id) => ({
                    booking_id: id,
                    public_reference: `SV-BATCH${id}`,
                    service_item_id: 10,
                    serviceItem,
                    resource_id: id === 21 ? 7 : 8,
                    quantity: id === 21 ? 2 : 1,
                    start_at: new Date(id === 21 ? '2026-06-01T09:00:00Z' : '2026-06-01T11:00:00Z'),
                    end_at: new Date(id === 21 ? '2026-06-01T10:00:00Z' : '2026-06-01T12:00:00Z'),
                    status: 'requested',
                    payment_timing: 'postpaid',
                    payment_status: 'unpaid'
                }))
            }
        });

        const result = await useCase({
            payload: {
                customer_name: 'Guest',
                customer_email: 'guest@example.com',
                idempotency_key: 'svc-batch-ok-1',
                bookings: [
                    { service_item_id: 10, resource_id: 7, quantity: 2, start_at: '2026-06-01T09:00:00Z' },
                    { service_item_id: 10, resource_id: 8, quantity: 1, start_at: '2026-06-01T11:00:00Z' }
                ]
            },
            source: 'storefront'
        });

        expect(result.success).toBe(true);
        expect(result.data.bookings).toHaveLength(2);
        expect(result.data.payments).toHaveLength(2);
        expect(result.data.payment.payments_count).toBe(2);
        expect(createBooking).toHaveBeenCalledTimes(2);
        expect(tx.commit).toHaveBeenCalled();
    });

    it('replays storefront service booking when idempotency key and request match', async () => {
        const bookingsByKey = new Map();
        let bookingId = 40;
        const beginTransaction = jest.fn(async () => transaction());
        const createBooking = jest.fn(async (payload) => {
            const row = { booking_id: bookingId += 1, public_reference: `SV-IDEM${bookingId}`, ...payload, serviceItem };
            const existing = bookingsByKey.get(payload.idempotency_key) || [];
            bookingsByKey.set(payload.idempotency_key, [...existing, row]);
            return row;
        });
        const getBookingById = jest.fn(async (id) => {
            const rows = [...bookingsByKey.values()].flat();
            return rows.find((row) => row.booking_id === id);
        });
        const useCase = buildCreateServiceBookingUseCase({
            serviceRepository: {
                beginTransaction,
                getSettingsByKeys: jest.fn(async () => registeredTransactionSettings()),
                findServiceItemById: jest.fn(async () => serviceItem),
                listActiveAssignmentsForService: jest.fn(async () => []),
                findConflictingBookings: jest.fn(async () => []),
                findBookingsByIdempotencyKey: jest.fn(async (key) => bookingsByKey.get(key) || []),
                findStoreCustomerByEmail: jest.fn(async () => null),
                isBookingReferenceTaken: jest.fn(async () => false),
                createBooking,
                getBookingById
            }
        });
        const request = {
            payload: {
                service_item_id: 10,
                quantity: 1,
                start_at: '2026-06-01T09:00:00Z',
                customer_name: 'Guest',
                customer_email: 'guest@example.com',
                idempotency_key: 'svc-idempotent-1'
            },
            source: 'storefront'
        };

        const first = await useCase(request);
        const replay = await useCase(request);

        expect(first.success).toBe(true);
        expect(replay.success).toBe(true);
        expect(replay.data.idempotency.idempotent_replay).toBe(true);
        expect(createBooking).toHaveBeenCalledTimes(1);
        expect(replay.data.booking.public_reference).toBe(first.data.booking.public_reference);
    });

    it('rolls back a service booking batch when one draft fails', async () => {
        const tx = transaction();
        const createBooking = jest.fn(async (payload) => ({ booking_id: 31, ...payload }));
        const useCase = buildCreateServiceBookingBatchUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                getSettingsByKeys: jest.fn(async () => registeredTransactionSettings()),
                findServiceItemById: jest.fn(async () => serviceItem),
                findResourceById: jest.fn(async () => ({
                    resource_id: 7,
                    name: 'Room 1',
                    capacity: 2,
                    is_active: true,
                    weekly_availability: null,
                    blackout_dates: []
                })),
                listActiveAssignmentsForService: jest.fn(async () => []),
                findConflictingBookings: jest.fn(async () => []),
                findStoreCustomerByEmail: jest.fn(async () => null),
                isBookingReferenceTaken: jest.fn(async () => false),
                createBooking,
                getBookingById: jest.fn(async (id) => ({
                    booking_id: id,
                    public_reference: `SV-BATCH${id}`,
                    service_item_id: 10,
                    serviceItem,
                    resource_id: 7,
                    quantity: 2,
                    start_at: new Date('2026-06-01T09:00:00Z'),
                    end_at: new Date('2026-06-01T10:00:00Z'),
                    status: 'requested',
                    payment_timing: 'postpaid',
                    payment_status: 'unpaid'
                }))
            }
        });

        const result = await useCase({
            payload: {
                customer_name: 'Guest',
                customer_email: 'guest@example.com',
                idempotency_key: 'svc-batch-rollback-1',
                bookings: [
                    { service_item_id: 10, resource_id: 7, quantity: 2, start_at: '2026-06-01T09:00:00Z' },
                    { service_item_id: 10, resource_id: 7, quantity: 1, start_at: '2026-06-01T09:30:00Z' }
                ]
            },
            source: 'storefront'
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.details.booking_index).toBe(1);
        expect(createBooking).toHaveBeenCalledTimes(1);
        expect(tx.rollback).toHaveBeenCalled();
    });


    it('creates service assignments only when a service and target exist', async () => {
        const tx = transaction();
        const useCase = buildCreateServiceAssignmentUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                findServiceItemById: jest.fn(async () => serviceItem),
                findResourceById: jest.fn(async () => ({ resource_id: 7, is_active: true })),
                createAssignment: jest.fn(async () => ({ assignment_id: 3, item_id: 10, resource_id: 7, is_active: true })),
                listAssignments: jest.fn(async () => [{ assignment_id: 3, item_id: 10, resource_id: 7, is_active: true }])
            }
        });

        const result = await useCase({ payload: { item_id: 10, resource_id: 7 } });

        expect(result.success).toBe(true);
        expect(result.data.assignment.assignment_id).toBe(3);
        expect(tx.commit).toHaveBeenCalled();
    });

    it('creates service waitlist entries with service-backed validation', async () => {
        const tx = transaction();
        const useCase = buildCreateServiceWaitlistEntryUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                findServiceItemById: jest.fn(async () => serviceItem),
                createWaitlistEntry: jest.fn(async () => ({
                    waitlist_entry_id: 9,
                    service_item_id: 10,
                    customer_name: 'Waiting Client',
                    customer_email: 'waiting@example.com',
                    status: 'waiting'
                }))
            }
        });

        const result = await useCase({
            payload: {
                service_item_id: 10,
                customer_name: 'Waiting Client',
                customer_email: 'waiting@example.com'
            }
        });

        expect(result.success).toBe(true);
        expect(result.data.waitlist_entry.status).toBe('waiting');
        expect(tx.commit).toHaveBeenCalled();
    });

    it('summarizes clients with retention and no-show signals', async () => {
        const useCase = buildListServiceClientsUseCase({
            serviceRepository: {
                listClientHistory: jest.fn(async () => ([
                    {
                        booking_id: 1,
                        customer_name: 'Repeat Client',
                        customer_email: 'repeat@example.com',
                        status: 'completed',
                        start_at: '2026-06-03T09:00:00Z',
                        serviceItem: { name: 'Consultation', default_sale_price: 500 }
                    },
                    {
                        booking_id: 2,
                        customer_name: 'Repeat Client',
                        customer_email: 'repeat@example.com',
                        status: 'no_show',
                        start_at: '2026-06-01T09:00:00Z',
                        serviceItem: { name: 'Consultation', default_sale_price: 500 }
                    }
                ]))
            }
        });

        const result = await useCase({ query: { limit: 20 } });

        expect(result.success).toBe(true);
        expect(result.data.clients[0].booking_count).toBe(2);
        expect(result.data.clients[0].repeat_client).toBe(true);
        expect(result.data.clients[0].no_show_rate).toBe(0.5);
    });

    it('queues due email reminders without duplicating existing reminders', async () => {
        const tx = transaction();
        const useCase = buildQueueDueServiceRemindersUseCase({
            serviceRepository: {
                beginTransaction: jest.fn(async () => tx),
                listReminderCandidateBookings: jest.fn(async () => ([
                    {
                        booking_id: 15,
                        public_reference: 'SV-DUE',
                        customer_name: 'Due Client',
                        customer_email: 'due@example.com',
                        start_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                        end_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
                        serviceItem: { name: 'Consultation' },
                        payment_status: 'unpaid',
                        payment_timing: 'postpaid'
                    }
                ])),
                findReminderByBookingChannelType: jest.fn(async () => null),
                createReminder: jest.fn(async (payload) => ({ reminder_id: 3, ...payload }))
            }
        });

        const result = await useCase({ payload: { lookahead_hours: 24 } });

        expect(result.success).toBe(true);
        expect(result.data.queued_count).toBe(1);
        expect(result.data.reminders[0].recipient).toBe('due@example.com');
        expect(tx.commit).toHaveBeenCalled();
    });

    it('sends due service reminders through configured email service', async () => {
        const updateReminderById = jest.fn(async (reminderId, payload) => ({ reminder_id: reminderId, ...payload }));
        const useCase = buildSendDueServiceRemindersUseCase({
            serviceRepository: {
                listReminderOutbox: jest.fn(async () => ([
                    {
                        reminder_id: 7,
                        booking_id: 15,
                        channel: 'email',
                        reminder_type: 'appointment_reminder',
                        recipient: 'due@example.com',
                        scheduled_for: new Date(Date.now() - 60 * 1000).toISOString(),
                        status: 'pending',
                        payload: {
                            customer_name: 'Due Client',
                            service_name: 'Consultation',
                            public_reference: 'SV-DUE',
                            start_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
                        }
                    }
                ])),
                updateReminderById
            },
            emailService: {
                isEmailConfigured: jest.fn(() => true),
                sendEmail: jest.fn(async () => ({ messageId: 'smtp-123' }))
            }
        });

        const result = await useCase({ query: { limit: 20 } });

        expect(result.success).toBe(true);
        expect(result.data.sent_count).toBe(1);
        expect(updateReminderById).toHaveBeenCalledWith(7, expect.objectContaining({
            status: 'sent',
            provider_message_id: 'smtp-123'
        }));
    });
});
