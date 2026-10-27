import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
    patch: vi.fn()
}));

vi.mock('@/services/api', () => ({ default: apiMock }));

import { updateESalesReportStatus } from '../posService.js';

describe('eSales status service contract', () => {
    beforeEach(() => apiMock.patch.mockReset());

    it('uses the registered status endpoint and encodes the report id', async () => {
        apiMock.patch.mockResolvedValue({ data: { data: { status: 'submitted' } } });

        await expect(updateESalesReportStatus('report/42', { status: 'submitted' }))
            .resolves.toEqual({ status: 'submitted' });

        expect(apiMock.patch).toHaveBeenCalledWith(
            '/pos/esales-reports/report%2F42/status',
            { status: 'submitted' }
        );
    });

    it('rejects a missing report id before making a request', async () => {
        await expect(updateESalesReportStatus('   ')).rejects.toMatchObject({
            code: 'POS_FISCAL_REPORT_ID_REQUIRED'
        });
        expect(apiMock.patch).not.toHaveBeenCalled();
    });

});
