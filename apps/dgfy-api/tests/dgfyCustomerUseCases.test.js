import { jest } from '@jest/globals';
import {
    buildDgfyHistoricalBackfillUseCase,
    buildGetDgfyCustomerDashboardUseCase,
    buildListDgfyCustomerActivitiesUseCase,
    buildListDgfyCustomerNotificationsUseCase,
    buildManageDgfyCustomerAddressesUseCases,
    buildMarkAllDgfyCustomerNotificationsReadUseCase,
    buildMarkDgfyCustomerNotificationReadUseCase,
    buildListPublicDgfyCustomerReviewsUseCase,
    buildModerateDgfyCustomerReviewUseCase,
    buildRequestDgfyTrackingRecoveryUseCase,
    buildSubmitDgfyCustomerReviewUseCase,
    buildSubmitDgfyGuestReviewInviteUseCase,
    buildTrackDgfyCustomerReferenceUseCase,
    buildValidateDgfyReviewInviteUseCase,
    buildVerifyDgfyTrackingRecoveryUseCase
} from '../src/modules/dgfy/usecases/dgfyCustomerUseCases.js';
import { buildPhoneLookupVariants } from '../src/modules/dgfy/repositories/dgfyCustomerRepository.js';

const account = {
    id: 'dgfy-account-1',
    first_name: 'Ada',
    last_name: 'Lovelace',
    username: 'Ada',
    email: 'ada@example.com',
    phone: '+639123456789',
    email_verified_at: new Date()
};

describe('dgfyCustomerUseCases', () => {
    it('loads dashboard data with explicit deferred phone verification marker', async () => {
        const repository = {
            listActiveTenants: jest.fn(),
            listActivitiesForAccount: jest.fn().mockResolvedValue({
                rows: [
                    { activity_id: 1, activity_type: 'order', reference: 'SK-ABC123', status: 'placed', dgfy_account_id: account.id, occurred_at: new Date() },
                    { activity_id: 2, activity_type: 'service_booking', reference: 'SV-001', status: 'pending', occurred_at: new Date() },
                    { activity_id: 3, activity_type: 'fnb_order', reference: 'FNB-123', status: 'paid', occurred_at: new Date() }
                ]
            }),
            listAddresses: jest.fn().mockResolvedValue([{ address_id: 1, label: 'Home', address_line: 'Iloilo' }]),
            listLoyalty: jest.fn().mockResolvedValue({ balance: 5, transactions: [] })
        };
        const activitySynchronizer = jest.fn().mockImplementation(({ activities }) => Promise.resolve(activities.map((entry) => (
            entry.reference === 'SK-ABC123'
                ? { ...entry, status: 'confirmed' }
                : entry
        ))));
        const useCase = buildGetDgfyCustomerDashboardUseCase({
            repository,
            activitySynchronizer
        });

        const result = await useCase({ account });

        expect(result.success).toBe(true);
        expect(activitySynchronizer).toHaveBeenCalledWith({
            account: expect.objectContaining({ id: account.id }),
            activities: expect.arrayContaining([expect.objectContaining({ reference: 'SK-ABC123' })])
        });
        expect(result.data.account.phone_verification_deferred).toBe(true);
        expect(result.data.orders).toHaveLength(2);
        expect(result.data.orders.find((entry) => entry.reference === 'SK-ABC123').status).toBe('confirmed');
        expect(result.data.bookings).toHaveLength(1);
        expect(result.data.orders.map((entry) => entry.type)).toEqual(expect.arrayContaining(['order', 'fnb_order']));
        expect(result.data.addresses[0].label).toBe('Home');
        expect(result.data.loyalty.balance).toBe(5);
        expect(repository.listActiveTenants).not.toHaveBeenCalled();
    });

    it('tracks references only inside the authenticated DGFY account', async () => {
        const findActivityForAccount = jest.fn().mockResolvedValue({
            activity_id: 1,
            activity_type: 'order',
            reference: 'SK-ABC123',
            status: 'placed',
            dgfy_account_id: account.id
        });
        const activitySynchronizer = jest.fn().mockImplementation(({ activity }) => Promise.resolve({
            ...activity,
            status: 'preparing'
        }));
        const useCase = buildTrackDgfyCustomerReferenceUseCase({
            repository: { findActivityForAccount },
            activitySynchronizer
        });

        const result = await useCase({ account, body: { reference: 'sk-abc123' } });

        expect(result.success).toBe(true);
        expect(findActivityForAccount).toHaveBeenCalledWith({
            dgfyAccountId: account.id,
            reference: 'SK-ABC123'
        });
        expect(activitySynchronizer).toHaveBeenCalledWith({
            account,
            activity: expect.objectContaining({ reference: 'SK-ABC123' })
        });
        expect(result.data.activity.reference).toBe('SK-ABC123');
        expect(result.data.activity.status).toBe('preparing');
    });

    it('creates coordinate-backed saved addresses for delivery pins', async () => {
        const repository = {
            createAddress: jest.fn().mockImplementation((accountId, payload) => Promise.resolve({
                address_id: 10,
                dgfy_account_id: accountId,
                ...payload
            }))
        };
        const useCases = buildManageDgfyCustomerAddressesUseCases({ repository });

        const result = await useCases.create({
            account,
            body: {
                label: 'Home',
                address_line: '123 Test Street',
                latitude: '10.7202',
                longitude: '122.5621',
                is_default: true
            }
        });

        expect(result.success).toBe(true);
        expect(repository.createAddress).toHaveBeenCalledWith(account.id, expect.objectContaining({
            label: 'Home',
            address_line: '123 Test Street',
            latitude: 10.7202,
            longitude: 122.5621,
            is_default: true
        }));
    });

    it('rejects invalid saved address coordinates', async () => {
        const repository = {
            createAddress: jest.fn()
        };
        const useCases = buildManageDgfyCustomerAddressesUseCases({ repository });

        const result = await useCases.create({
            account,
            body: {
                label: 'Bad pin',
                address_line: 'Somewhere',
                latitude: 91,
                longitude: 122
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(repository.createAddress).not.toHaveBeenCalled();
    });

    it('rejects saved address coordinate half-pairs', async () => {
        const repository = {
            createAddress: jest.fn()
        };
        const useCases = buildManageDgfyCustomerAddressesUseCases({ repository });

        const result = await useCases.create({
            account,
            body: {
                label: 'Partial pin',
                address_line: 'Somewhere',
                latitude: 10.72
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(repository.createAddress).not.toHaveBeenCalled();
    });

    it('updates a saved address with validated coordinate pairs', async () => {
        const repository = {
            getAddress: jest.fn().mockResolvedValue({
                address_id: 10,
                dgfy_account_id: account.id,
                address_line: 'Old address',
                latitude: null,
                longitude: null
            }),
            updateAddress: jest.fn().mockImplementation((accountId, addressId, payload) => Promise.resolve({
                address_id: Number(addressId),
                dgfy_account_id: accountId,
                ...payload
            }))
        };
        const useCases = buildManageDgfyCustomerAddressesUseCases({ repository });

        const result = await useCases.update({
            account,
            addressId: 10,
            body: {
                address_line: 'Updated address',
                latitude: '10.7001',
                longitude: '122.5602'
            }
        });

        expect(result.success).toBe(true);
        expect(repository.getAddress).toHaveBeenCalledWith(account.id, 10);
        expect(repository.updateAddress).toHaveBeenCalledWith(account.id, 10, expect.objectContaining({
            address_line: 'Updated address',
            latitude: 10.7001,
            longitude: 122.5602
        }));
    });

    it('clears saved address coordinates as a pair while preserving text address fallback', async () => {
        const repository = {
            getAddress: jest.fn().mockResolvedValue({
                address_id: 10,
                dgfy_account_id: account.id,
                address_line: 'Text address',
                latitude: 10.7,
                longitude: 122.56
            }),
            updateAddress: jest.fn().mockImplementation((accountId, addressId, payload) => Promise.resolve({
                address_id: Number(addressId),
                dgfy_account_id: accountId,
                address_line: 'Text address',
                ...payload
            }))
        };
        const useCases = buildManageDgfyCustomerAddressesUseCases({ repository });

        const result = await useCases.update({
            account,
            addressId: 10,
            body: {
                latitude: null,
                longitude: null
            }
        });

        expect(result.success).toBe(true);
        expect(repository.updateAddress).toHaveBeenCalledWith(account.id, 10, expect.objectContaining({
            latitude: null,
            longitude: null
        }));
    });

    it('rejects one-coordinate saved address updates against existing text-only records', async () => {
        const repository = {
            getAddress: jest.fn().mockResolvedValue({
                address_id: 10,
                dgfy_account_id: account.id,
                address_line: 'Text address',
                latitude: null,
                longitude: null
            }),
            updateAddress: jest.fn()
        };
        const useCases = buildManageDgfyCustomerAddressesUseCases({ repository });

        const result = await useCases.update({
            account,
            addressId: 10,
            body: {
                latitude: 10.7
            }
        });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(repository.getAddress).toHaveBeenCalledWith(account.id, 10);
        expect(repository.updateAddress).not.toHaveBeenCalled();
    });

    it('requires an account-linked purchased item before accepting a review', async () => {
        const repository = {
            listActivitiesForAccount: jest.fn().mockResolvedValue({
                rows: [{
                    activity_id: 10,
                    tenant_id: 'tenant-1',
                    status: 'completed',
                    payment_status: 'paid',
                    display_snapshot: {
                        lines: [{ item_id: 5, name: 'Product' }]
                    }
                }]
            }),
            findReviewByAccountActivityItem: jest.fn().mockResolvedValue(null),
            createReview: jest.fn().mockImplementation((payload) => Promise.resolve({ review_id: 1, ...payload }))
        };
        const useCase = buildSubmitDgfyCustomerReviewUseCase({ repository });

        const result = await useCase({ account, body: { activity_id: 10, item_id: 5, rating: 5, comment: 'Great' } });

        expect(result.success).toBe(true);
        expect(repository.createReview).toHaveBeenCalledWith(expect.objectContaining({
            dgfy_account_id: account.id,
            item_id: 5,
            rating: 5,
            status: 'pending'
        }));
    });

    it('rejects reviews for items not present in account activity', async () => {
        const useCase = buildSubmitDgfyCustomerReviewUseCase({
            repository: {
                listActivitiesForAccount: jest.fn().mockResolvedValue({
                    rows: [{ activity_id: 10, status: 'completed', payment_status: 'paid', display_snapshot: { lines: [{ item_id: 5 }] } }]
                })
            }
        });

        const result = await useCase({ account, body: { activity_id: 10, item_id: 9, rating: 5 } });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
    });

    it('lists unified activities with filter and pagination arguments', async () => {
        const repository = {
            listActivitiesForAccount: jest.fn().mockResolvedValue({
                rows: [{
                    activity_id: 30,
                    activity_type: 'fnb_order',
                    reference: 'FNB-30',
                    tenant_id: 'tenant-1',
                    store_name: 'Cafe',
                    status: 'paid',
                    payment_status: 'paid',
                    display_snapshot: { check_id: 30, lines: [{ item_id: 88, name: 'Pasta' }] }
                }],
                pagination: { page: 2, limit: 5, total: 6, totalPages: 2 }
            })
        };
        const activitySynchronizer = jest.fn().mockImplementation(({ activities }) => Promise.resolve(activities.map((entry) => ({
            ...entry,
            status: entry.status === 'paid' ? 'completed' : entry.status
        }))));
        const useCase = buildListDgfyCustomerActivitiesUseCase({ repository, activitySynchronizer });

        const result = await useCase({
            account,
            query: { type: 'fnb_order', tenant_id: 'tenant-1', status: 'paid', payment_status: 'paid', date_from: '2026-05-01', date_to: '2026-05-28', page: 2, limit: 5 }
        });

        expect(result.success).toBe(true);
        expect(activitySynchronizer).toHaveBeenCalledWith({
            account: expect.objectContaining({ id: account.id }),
            activities: expect.arrayContaining([expect.objectContaining({ reference: 'FNB-30' })])
        });
        expect(repository.listActivitiesForAccount).toHaveBeenCalledWith(account.id, expect.objectContaining({
            type: 'fnb_order',
            tenantId: 'tenant-1',
            status: 'paid',
            paymentStatus: 'paid',
            dateFrom: '2026-05-01',
            dateTo: '2026-05-28',
            page: 2,
            limit: 5
        }));
        expect(result.data.activities[0]).toEqual(expect.objectContaining({
            type: 'fnb_order',
            status: 'completed',
            type_label: 'F&B order',
            allowed_actions: expect.objectContaining({ review: true }),
            review_targets: expect.arrayContaining([expect.objectContaining({ target_type: 'fnb_item', target_id: 88 })])
        }));
    });

    it('lists account-scoped notifications with unread filtering', async () => {
        const repository = {
            listNotificationsForAccount: jest.fn().mockResolvedValue({
                rows: [{
                    notification_id: 12,
                    type: 'order_status',
                    title: 'Order confirmed',
                    body: 'The store confirmed your order.',
                    status: 'confirmed',
                    reference: 'SK-ABC123',
                    tenant_id: 'tenant-1',
                    activity_id: 1,
                    read_at: null,
                    created_at: new Date('2026-06-19T01:00:00Z')
                }],
                unread_count: 1
            })
        };
        const useCase = buildListDgfyCustomerNotificationsUseCase({ repository });

        const result = await useCase({
            account,
            query: { unread_only: 'true', limit: '25' }
        });

        expect(result.success).toBe(true);
        expect(repository.listNotificationsForAccount).toHaveBeenCalledWith(account.id, {
            limit: '25',
            unreadOnly: true
        });
        expect(result.data.unread_count).toBe(1);
        expect(result.data.notifications[0]).toEqual(expect.objectContaining({
            notification_id: 12,
            type: 'order_status',
            reference: 'SK-ABC123',
            status: 'confirmed'
        }));
    });

    it('marks one account notification as read and rejects missing notifications', async () => {
        const repository = {
            markNotificationRead: jest.fn()
                .mockResolvedValueOnce({
                    notification_id: 12,
                    type: 'order_status',
                    title: 'Order confirmed',
                    reference: 'SK-ABC123',
                    read_at: new Date('2026-06-19T02:00:00Z')
                })
                .mockResolvedValueOnce(null)
        };
        const useCase = buildMarkDgfyCustomerNotificationReadUseCase({ repository });

        const success = await useCase({ account, notificationId: 12 });
        const failure = await useCase({ account, notificationId: 99 });

        expect(success.success).toBe(true);
        expect(success.data.notification.notification_id).toBe(12);
        expect(repository.markNotificationRead).toHaveBeenCalledWith({
            dgfyAccountId: account.id,
            notificationId: 12
        });
        expect(failure.success).toBe(false);
        expect(failure.error.statusCode).toBe(404);
    });

    it('marks all account notifications as read', async () => {
        const repository = {
            markAllNotificationsRead: jest.fn().mockResolvedValue({ read_at: '2026-06-19T02:00:00.000Z' })
        };
        const useCase = buildMarkAllDgfyCustomerNotificationsReadUseCase({ repository });

        const result = await useCase({ account });

        expect(result.success).toBe(true);
        expect(repository.markAllNotificationsRead).toHaveBeenCalledWith(account.id);
        expect(result.data.read_at).toBe('2026-06-19T02:00:00.000Z');
    });

    it('accepts typed service reviews from paid account booking activity', async () => {
        const repository = {
            listActivitiesForAccount: jest.fn().mockResolvedValue({
                rows: [{
                    activity_id: 77,
                    activity_type: 'service_booking',
                    tenant_id: 'tenant-1',
                    status: 'completed',
                    payment_status: 'paid',
                    display_snapshot: { booking_id: 77, service_item_id: 44, service_name: 'Consultation' }
                }]
            }),
            findReviewByAccountActivityTarget: jest.fn().mockResolvedValue(null),
            createReview: jest.fn().mockImplementation((payload) => Promise.resolve({ review_id: 9, ...payload }))
        };
        const useCase = buildSubmitDgfyCustomerReviewUseCase({ repository });

        const result = await useCase({ account, body: { activity_id: 77, target_type: 'service', target_id: 44, rating: 5, comment: 'Helpful' } });

        expect(result.success).toBe(true);
        expect(repository.createReview).toHaveBeenCalledWith(expect.objectContaining({
            item_id: null,
            target_type: 'service',
            target_id: 44,
            status: 'pending'
        }));
    });

    it('rejects reviews until the account activity is paid or completed', async () => {
        const useCase = buildSubmitDgfyCustomerReviewUseCase({
            repository: {
                listActivitiesForAccount: jest.fn().mockResolvedValue({
                    rows: [{ activity_id: 10, status: 'placed', payment_status: 'pending', display_snapshot: { lines: [{ item_id: 5 }] } }]
                })
            }
        });

        const result = await useCase({ account, body: { activity_id: 10, item_id: 5, rating: 5 } });

        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(403);
        expect(result.error.message).toBe('Review requires a completed or paid purchase.');
    });

    it('returns only approved reviews for public display', async () => {
        const useCase = buildListPublicDgfyCustomerReviewsUseCase({
            repository: {
                listPublicReviews: jest.fn().mockResolvedValue({
                    rows: [{ review_id: 1, status: 'approved', rating: 5 }],
                    summary: { average_rating: 5, total_count: 1, verified_count: 1, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 } }
                })
            }
        });

        const result = await useCase({ query: { tenant_id: 'tenant-1', item_id: 5 } });

        expect(result.success).toBe(true);
        expect(result.data.reviews).toHaveLength(1);
        expect(result.data.summary.total_count).toBe(1);
        expect(result.data.summary.verified_count).toBe(1);
        expect(result.data.summary.distribution[5]).toBe(1);
    });

    it('validates an active guest review invite token for a fulfilled menu item', async () => {
        const useCase = buildValidateDgfyReviewInviteUseCase({
            repository: {
                findReviewInviteByTokenHash: jest.fn().mockResolvedValue({
                    invite_id: 8,
                    tenant_id: 'tenant-1',
                    tracking_pin: 'SK-ABCD12',
                    target_type: 'fnb_item',
                    target_id: 44,
                    item_name: 'Adobo Platter',
                    delivery_channel: 'tracking',
                    status: 'issued',
                    expires_at: new Date(Date.now() + 60_000).toISOString(),
                    activity_id: 90
                }),
                markReviewInviteOpened: jest.fn().mockResolvedValue({})
            }
        });

        const result = await useCase({ token: 'public-review-token' });

        expect(result.success).toBe(true);
        expect(result.data.invite).toEqual(expect.objectContaining({
            tracking_pin: 'SK-ABCD12',
            target_type: 'fnb_item',
            target_id: 44,
            item_name: 'Adobo Platter'
        }));
    });

    it('submits a fulfilled guest review invite once and marks it as pending moderation', async () => {
        const repository = {
            findReviewInviteByTokenHash: jest.fn().mockResolvedValue({
                invite_id: 5,
                tenant_id: 'tenant-1',
                activity_id: 61,
                target_type: 'fnb_item',
                target_id: 14,
                delivery_channel: 'tracking',
                status: 'opened',
                expires_at: new Date(Date.now() + 60_000).toISOString()
            }),
            findReviewByTrackingActivityTarget: jest.fn().mockResolvedValue(null),
            createReview: jest.fn().mockImplementation((payload) => Promise.resolve({ review_id: 77, ...payload })),
            markReviewInviteSubmitted: jest.fn().mockResolvedValue({ invite_id: 5, status: 'submitted', submitted_review_id: 77 })
        };
        const useCase = buildSubmitDgfyGuestReviewInviteUseCase({ repository });

        const result = await useCase({
            token: 'invite-token',
            body: {
                name: 'Ada Lovelace',
                anonymous: false,
                rating: 5,
                comment: 'The serving was generous and the flavor was balanced.'
            }
        });

        expect(result.success).toBe(true);
        expect(repository.createReview).toHaveBeenCalledWith(expect.objectContaining({
            dgfy_account_id: null,
            activity_id: 61,
            tenant_id: 'tenant-1',
            target_type: 'fnb_item',
            target_id: 14,
            reviewer_name: 'Ada Lovelace',
            reviewer_initials: 'AL',
            verified_purchase: true,
            status: 'pending'
        }));
        expect(repository.markReviewInviteSubmitted).toHaveBeenCalledWith({ inviteId: 5, reviewId: 77 });
    });

    it('allows admins to approve or reject pending reviews', async () => {
        const repository = {
            moderateReview: jest.fn().mockResolvedValue({ review_id: 1, status: 'approved', reviewed_by_admin_id: 7 })
        };
        const useCase = buildModerateDgfyCustomerReviewUseCase({ repository });

        const result = await useCase({ admin: { id: 7 }, reviewId: 1, body: { status: 'approved', review_note: 'OK' } });

        expect(result.success).toBe(true);
        expect(repository.moderateReview).toHaveBeenCalledWith(expect.objectContaining({
            reviewId: 1,
            status: 'approved',
            reviewedByAdminId: 7,
            note: 'OK'
        }));
    });

    it('runs full historical activity backfill without tenant-count or order-count truncation when requested', async () => {
        const repository = {
            createBackfillRun: jest.fn().mockResolvedValue({ run_id: 'run-1' }),
            updateBackfillRun: jest.fn().mockImplementation((runId, payload) => Promise.resolve({ run_id: runId, ...payload })),
            listDgfyAccountsForBackfill: jest.fn()
                .mockResolvedValueOnce([{ id: account.id, email: account.email, phone: account.phone }])
                .mockResolvedValueOnce([]),
            listTenantsForBackfill: jest.fn()
                .mockResolvedValueOnce([{ id: 'tenant-1', name: 'Tenant One' }, { id: 'tenant-2', name: 'Tenant Two' }])
                .mockResolvedValueOnce([])
        };
        const tenantOrderReader = jest.fn()
            .mockResolvedValueOnce([
                { tracking_pin: 'SK-AAAA', customer_email: account.email, fulfillment_status: 'completed', total_amount: 250, lines: [{ item_id: 5, quantity: 1, sale_price: 250 }], storeCustomer: { dgfy_account_id: account.id } }
            ])
            .mockResolvedValueOnce([
                { tracking_pin: 'SK-BBBB', customer_phone: '09123456789', fulfillment_status: 'placed', total_amount: 100, lines: [{ item_id: 9, quantity: 1, sale_price: 100 }], storeCustomer: { dgfy_account_id: account.id } }
            ]);
        const activityRecorder = jest.fn().mockImplementation(({ tenantId, order }) => Promise.resolve({
            activity_id: tenantId === 'tenant-1' ? 1 : 2,
            dgfy_account_id: account.id,
            status: order.fulfillment_status
        }));
        const useCase = buildDgfyHistoricalBackfillUseCase({ repository, tenantOrderReader, activityRecorder });

        const result = await useCase({ options: { dryRun: false, tenantPageSize: 2, transactionLimitPerTenant: null } });

        expect(result.success).toBe(true);
        expect(result.data.summary.tenant_count).toBe(2);
        expect(result.data.summary.transaction_count).toBe(2);
        expect(result.data.summary.activity_upsert_count).toBe(2);
        expect(activityRecorder).toHaveBeenCalledTimes(2);
        expect(repository.updateBackfillRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ status: 'completed' }));
    });

    it('backfills service, hospitality, and F&B activity alongside POS orders', async () => {
        const repository = {
            createBackfillRun: jest.fn().mockResolvedValue({ run_id: 'run-1' }),
            updateBackfillRun: jest.fn().mockImplementation((runId, payload) => Promise.resolve({ run_id: runId, ...payload })),
            listDgfyAccountsForBackfill: jest.fn()
                .mockResolvedValueOnce([{ id: account.id, email: account.email, phone: account.phone }])
                .mockResolvedValueOnce([]),
            listTenantsForBackfill: jest.fn()
                .mockResolvedValueOnce([{ id: 'tenant-1', name: 'Tenant One', company_token: 'tenant-one' }])
                .mockResolvedValueOnce([]),
            upsertActivity: jest.fn().mockImplementation((payload) => Promise.resolve({ activity_id: payload.activity_type === 'service_booking' ? 2 : 3, ...payload }))
        };
        const tenantActivityReader = jest.fn().mockResolvedValue({
            orders: [
                { tracking_pin: 'SK-AAAA', customer_email: account.email, fulfillment_status: 'completed', total_amount: 250, storeCustomer: { dgfy_account_id: account.id } }
            ],
            serviceBookings: [
                { booking_id: 7, public_reference: 'SV-A1B2C3D4', customer_email: account.email, status: 'confirmed', payment_status: 'unpaid', start_at: new Date('2026-06-01T01:00:00Z'), storeCustomer: { dgfy_account_id: account.id } }
            ],
            hospitalityReservations: [
                { reservation_id: 9, public_reference: 'HSP-A1B2C3D4E5', customer_phone: '09123456789', status: 'confirmed', payment_status: 'deposit_paid', check_in_date: '2026-06-10', check_out_date: '2026-06-12', storeCustomer: { dgfy_account_id: account.id } }
            ],
            fnbOrders: [
                { check_id: 11, status: 'paid', posTransaction: { tracking_pin: 'FNB-A1B2C3', customer_email: account.email, payment_status: 'paid', total_amount: 399, storeCustomer: { dgfy_account_id: account.id } }, lines: [{ item_id: 15, quantity: 1, item: { name: 'Brunch Set' } }] }
            ]
        });
        const activityRecorder = jest.fn().mockResolvedValue({ activity_id: 1, dgfy_account_id: account.id, status: 'completed' });
        const useCase = buildDgfyHistoricalBackfillUseCase({
            repository,
            tenantActivityReader,
            activityRecorder
        });

        const result = await useCase({
            options: {
                dryRun: false,
                tenantPageSize: 1,
                transactionLimitPerTenant: null,
                requiredActivityTypes: 'order,service_booking,hospitality_booking,fnb_order'
            }
        });

        expect(result.success).toBe(true);
        expect(result.data.summary.order_count).toBe(1);
        expect(result.data.summary.service_booking_count).toBe(1);
        expect(result.data.summary.hospitality_booking_count).toBe(1);
        expect(result.data.summary.fnb_order_count).toBe(1);
        expect(result.data.summary.matched_account_count).toBe(4);
        expect(activityRecorder).toHaveBeenCalledTimes(1);
        expect(repository.upsertActivity).toHaveBeenCalledWith(expect.objectContaining({
            activity_type: 'service_booking',
            reference: 'SV-A1B2C3D4',
            dgfy_account_id: account.id
        }));
        expect(repository.upsertActivity).toHaveBeenCalledWith(expect.objectContaining({
            activity_type: 'hospitality_booking',
            reference: 'HSP-A1B2C3D4E5',
            dgfy_account_id: account.id
        }));
        expect(repository.upsertActivity).toHaveBeenCalledWith(expect.objectContaining({
            activity_type: 'fnb_order',
            reference: 'FNB-A1B2C3',
            dgfy_account_id: account.id
        }));
    });

    it('fails a gated historical backfill when required hospitality activity is absent', async () => {
        const repository = {
            createBackfillRun: jest.fn().mockResolvedValue({ run_id: 'run-1' }),
            updateBackfillRun: jest.fn().mockImplementation((runId, payload) => Promise.resolve({ run_id: runId, ...payload })),
            listDgfyAccountsForBackfill: jest.fn()
                .mockResolvedValueOnce([{ id: account.id, email: account.email, phone: account.phone }])
                .mockResolvedValueOnce([]),
            listTenantsForBackfill: jest.fn()
                .mockResolvedValueOnce([{ id: 'tenant-1', name: 'Tenant One', company_token: 'tenant-one' }])
                .mockResolvedValueOnce([])
        };
        const tenantActivityReader = jest.fn().mockResolvedValue({
            orders: [
                { tracking_pin: 'SK-AAAA', customer_email: account.email, fulfillment_status: 'completed', total_amount: 250, storeCustomer: { dgfy_account_id: account.id } }
            ],
            serviceBookings: [],
            hospitalityReservations: []
        });
        const activityRecorder = jest.fn().mockResolvedValue({ activity_id: 1, dgfy_account_id: account.id, status: 'completed' });
        const useCase = buildDgfyHistoricalBackfillUseCase({
            repository,
            tenantActivityReader,
            activityRecorder
        });

        const result = await useCase({ options: { dryRun: true, tenantPageSize: 1, requiredActivityTypes: 'hospitality_booking' } });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(result.error.message).toMatch(/required activity types/);
        expect(result.error.details.missing_activity_types).toEqual(['hospitality_booking']);
        expect(result.error.details.summary.hospitality_booking_count).toBe(0);
        expect(result.error.details.summary.order_count).toBe(1);
        expect(repository.updateBackfillRun).toHaveBeenCalledWith('run-1', expect.objectContaining({
            status: 'failed',
            failure_count: expect.any(Number)
        }));
    });

    it('sends generic tracking recovery responses and returns dev code only outside production on send failure', async () => {
        const originalNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'test';
        const useCase = buildRequestDgfyTrackingRecoveryUseCase({
            repository: {
                listActivitiesByLookup: jest.fn().mockResolvedValue([{ customer_email: 'ada@example.com' }]),
                createRecoveryCode: jest.fn().mockResolvedValue({})
            },
            sender: {
                sendEmail: jest.fn().mockRejectedValue(new Error('SMTP unavailable'))
            }
        });

        const result = await useCase({ body: { email: 'ada@example.com' } });

        process.env.NODE_ENV = originalNodeEnv;
        expect(result.success).toBe(true);
        expect(result.data.message).toMatch(/If matching orders exist/);
        expect(result.data.delivery_status).toBe('failed');
        expect(result.data.dev_recovery_code).toMatch(/^\d{6}$/);
    });

    it('does not expose tracking recovery match or delivery status in production responses', async () => {
        const originalNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        const useCase = buildRequestDgfyTrackingRecoveryUseCase({
            repository: {
                listActivitiesByLookup: jest.fn().mockResolvedValue([{ customer_email: 'ada@example.com' }]),
                createRecoveryCode: jest.fn().mockResolvedValue({}),
                findRecentRecoveryCode: jest.fn().mockResolvedValue(null)
            },
            sender: {
                sendEmail: jest.fn().mockResolvedValue({})
            }
        });

        const result = await useCase({ body: { email: 'ada@example.com' } });

        process.env.NODE_ENV = originalNodeEnv;
        expect(result.success).toBe(true);
        expect(result.data.message).toMatch(/If matching orders exist/);
        expect(result.data.delivery_status).toBeUndefined();
        expect(result.data.dev_recovery_code).toBeUndefined();
    });

    it('normalizes common Philippine phone lookup variants for recovery', () => {
        expect(buildPhoneLookupVariants('0915 026 3407')).toEqual(expect.arrayContaining([
            '09150263407',
            '639150263407',
            '+639150263407'
        ]));
        expect(buildPhoneLookupVariants('+63 915 026 3407')).toEqual(expect.arrayContaining([
            '+639150263407',
            '09150263407'
        ]));
    });

    it('consumes tracking recovery codes once and rejects replay', async () => {
        const repository = {
            consumePendingRecoveryCode: jest.fn()
                .mockResolvedValueOnce({ status: 'verified' })
                .mockResolvedValueOnce({ status: 'missing' }),
            listActivitiesByLookup: jest.fn().mockResolvedValue([{ activity_id: 1, reference: 'SK-ABC123' }])
        };
        const useCase = buildVerifyDgfyTrackingRecoveryUseCase({ repository });

        const first = await useCase({ body: { email: 'ada@example.com', code: '123456' } });
        const replay = await useCase({ body: { email: 'ada@example.com', code: '123456' } });

        expect(first.success).toBe(true);
        expect(first.data.activities[0].reference).toBe('SK-ABC123');
        expect(replay.success).toBe(false);
        expect(replay.error.statusCode).toBe(422);
    });
});
