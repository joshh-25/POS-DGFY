import { buildListAuditLogsUseCase } from '../src/modules/audit/usecases/listAuditLogsUseCase.js';
import { describe, expect, jest, test } from '@jest/globals';

describe('tenant audit use case', () => {
    test('returns paginated audit data from the repository', async () => {
        const repository = {
            list: jest.fn().mockResolvedValue({
                logs: [{ log_id: 7, event_type: 'shift_opened' }],
                pagination: { page: 1, limit: 25, total: 1, total_pages: 1 }
            })
        };
        const useCase = buildListAuditLogsUseCase({ auditRepository: repository });

        const result = await useCase({ query: { page: 1, event_type: 'shift_opened' } });

        expect(result.success).toBe(true);
        expect(repository.list).toHaveBeenCalledWith({ page: 1, event_type: 'shift_opened' });
        expect(result.data.logs[0].event_type).toBe('shift_opened');
    });

    test('returns an application failure when the audit repository is unavailable', async () => {
        const useCase = buildListAuditLogsUseCase({
            auditRepository: { list: jest.fn().mockRejectedValue(new Error('AuditLog model is unavailable')) }
        });

        const result = await useCase({ query: {} });

        expect(result.success).toBe(false);
        expect(result.error.message).toBe('AuditLog model is unavailable');
    });
});
