import { jest } from '@jest/globals';
import { recordDgfyOrderActivity } from '../src/modules/dgfy/utils/customerActivityRecorder.js';
import { dgfyCustomerRepository } from '../src/modules/dgfy/repositories/dgfyCustomerRepository.js';

describe('customerActivityRecorder', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('does not auto-link guest orders to a DGFY account by email match alone', async () => {
        const upsertActivity = jest.spyOn(dgfyCustomerRepository, 'upsertActivity').mockResolvedValue({
            activity_id: 1,
            dgfy_account_id: null,
            status: 'placed',
            total_amount: 150
        });
        jest.spyOn(dgfyCustomerRepository, 'findTenantById').mockResolvedValue({
            id: 'tenant-1',
            company_token: 'space-bar',
            name: 'Space Bar'
        });
        const findByEmailSpy = jest.spyOn(dgfyCustomerRepository, 'findDgfyAccountByEmail');

        await recordDgfyOrderActivity({
            tenantId: 'tenant-1',
            order: {
                tracking_pin: 'SK-NEW001',
                customer_email: 'kitcole314@gmail.com',
                total_amount: 150,
                fulfillment_status: 'placed'
            },
            storeCustomer: {
                customer_id: 99,
                email: 'kitcole314@gmail.com'
            }
        });

        expect(findByEmailSpy).not.toHaveBeenCalled();
        expect(upsertActivity).toHaveBeenCalledWith(expect.objectContaining({
            dgfy_account_id: null,
            customer_email: 'kitcole314@gmail.com',
            store_customer_id: 99,
            reference: 'SK-NEW001'
        }));
    });

    it('creates an account-owned status notification when an account order status changes', async () => {
        jest.spyOn(dgfyCustomerRepository, 'findTenantById').mockResolvedValue({
            id: 'tenant-1',
            company_token: 'space-bar',
            name: 'Space Bar'
        });
        jest.spyOn(dgfyCustomerRepository, 'upsertActivity').mockResolvedValue({
            activity_id: 42,
            dgfy_account_id: '0b98265e-550a-42b2-b6ce-111111111111',
            tenant_id: 'tenant-1',
            reference: 'SK-NEW002',
            status: 'out_for_delivery',
            total_amount: 275,
            _status_changed: true
        });
        const notificationSpy = jest.spyOn(dgfyCustomerRepository, 'createNotificationIfMissing').mockResolvedValue({
            created: true,
            notification: {
                notification_id: 7,
                reference: 'SK-NEW002',
                status: 'out_for_delivery'
            }
        });

        await recordDgfyOrderActivity({
            tenantId: 'tenant-1',
            order: {
                tracking_pin: 'SK-NEW002',
                customer_email: 'kate@example.com',
                total_amount: 275,
                fulfillment_status: 'out_for_delivery'
            },
            storeCustomer: {
                customer_id: 100,
                dgfy_account_id: '0b98265e-550a-42b2-b6ce-111111111111',
                email: 'kate@example.com'
            }
        });

        expect(notificationSpy).toHaveBeenCalledWith(expect.objectContaining({
            dgfy_account_id: '0b98265e-550a-42b2-b6ce-111111111111',
            reference: 'SK-NEW002',
            status: 'out_for_delivery',
            type: 'order_status'
        }));
    });

    it('does not create account notifications for guest orders', async () => {
        jest.spyOn(dgfyCustomerRepository, 'findTenantById').mockResolvedValue({
            id: 'tenant-1',
            company_token: 'space-bar',
            name: 'Space Bar'
        });
        jest.spyOn(dgfyCustomerRepository, 'upsertActivity').mockResolvedValue({
            activity_id: 43,
            dgfy_account_id: null,
            reference: 'SK-NEW003',
            status: 'confirmed',
            _status_changed: true
        });
        const notificationSpy = jest.spyOn(dgfyCustomerRepository, 'createNotificationIfMissing').mockResolvedValue(null);

        await recordDgfyOrderActivity({
            tenantId: 'tenant-1',
            order: {
                tracking_pin: 'SK-NEW003',
                customer_email: 'guest@example.com',
                fulfillment_status: 'confirmed'
            },
            storeCustomer: {
                customer_id: 101,
                email: 'guest@example.com'
            }
        });

        expect(notificationSpy).not.toHaveBeenCalled();
    });
});
