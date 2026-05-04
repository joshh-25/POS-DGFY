import {
    buildCreateServiceBookingUseCase,
    buildCreateServiceAssignmentUseCase,
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
        const useCase = buildListServiceCatalogUseCase({
            serviceRepository: {
                listServiceCatalog: jest.fn(async () => ([{
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
                }]))
            }
        });

        const result = await useCase({ query: { limit: 20 }, storefrontOnly: true });

        expect(result.success).toBe(true);
        expect(result.data.services[0].service_detail.intake_form_schema).toEqual({
            fields: [{ key: 'concern', label: 'Concern', required: true }]
        });
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
                customer_email: 'guest@example.com'
            },
            source: 'storefront'
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(result.error.message).toContain('blacked out');
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
                customer_email: 'guest@example.com'
            },
            source: 'storefront'
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CUSTOMER_ACCESS_MODE_BLOCKED');
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
