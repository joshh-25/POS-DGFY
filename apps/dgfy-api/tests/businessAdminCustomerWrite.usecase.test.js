import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { buildCreateBusinessAdminCustomerUseCase } from '../src/modules/businessAdmin/usecases/businessAdminCustomerWriteUseCase.js';

const repository = {
    findCustomerByEmail: jest.fn(),
    createCustomer: jest.fn()
};

const createCustomer = buildCreateBusinessAdminCustomerUseCase({
    businessAdminCustomerRepository: repository
});

const adminUser = { role: 'admin', user_id: 1 };

beforeEach(() => {
    repository.findCustomerByEmail.mockReset();
    repository.createCustomer.mockReset();
});

describe('Business Admin customer creation', () => {
    it('creates a normalized canonical profile without exposing a password', async () => {
        repository.findCustomerByEmail.mockResolvedValue(null);
        repository.createCustomer.mockResolvedValue({
            customer_id: 12,
            name: 'Maria Customer',
            email: 'maria@example.test',
            phone: '09170000000',
            is_active: true,
            created_at: '2026-09-22T08:00:00.000Z',
            password_hash: 'PENDING_INVITATION'
        });

        const result = await createCustomer({
            user: adminUser,
            body: {
                name: ' Maria Customer ',
                email: 'MARIA@EXAMPLE.TEST ',
                phone: '09170000000',
                address_line: '12 Main Street, Iloilo City'
            }
        });

        expect(repository.findCustomerByEmail).toHaveBeenCalledWith('maria@example.test');
        expect(repository.createCustomer).toHaveBeenCalledWith({
            name: 'Maria Customer',
            email: 'maria@example.test',
            phone: '09170000000',
            addressLine: '12 Main Street, Iloilo City'
        });
        expect(result).toEqual({
            success: true,
            data: {
                customer: expect.objectContaining({
                    customer_id: 12,
                    name: 'Maria Customer',
                    email: 'maria@example.test',
                    account_status: 'invite_required'
                }),
                message: expect.stringContaining('password has not been issued')
            }
        });
        expect(result.data.customer.password_hash).toBeUndefined();
    });

    it('rejects malformed customer input before touching the repository', async () => {
        const result = await createCustomer({
            user: adminUser,
            body: { name: 'No email' }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(repository.findCustomerByEmail).not.toHaveBeenCalled();
        expect(repository.createCustomer).not.toHaveBeenCalled();
    });

    it('returns a conflict when the email already belongs to a customer', async () => {
        repository.findCustomerByEmail.mockResolvedValue({ customer_id: 99 });

        const result = await createCustomer({
            user: adminUser,
            body: { name: 'Existing Customer', email: 'existing@example.test' }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('CONFLICT');
        expect(repository.createCustomer).not.toHaveBeenCalled();
    });

    it('rejects an overlong address before touching the repository', async () => {
        const result = await createCustomer({
            user: adminUser,
            body: { name: 'Long Address', email: 'long@example.test', address_line: 'A'.repeat(4001) }
        });

        expect(result.success).toBe(false);
        expect(result.error.code).toBe('VALIDATION_FAILED');
        expect(repository.findCustomerByEmail).not.toHaveBeenCalled();
        expect(repository.createCustomer).not.toHaveBeenCalled();
    });
});
