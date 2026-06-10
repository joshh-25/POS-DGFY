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
});
