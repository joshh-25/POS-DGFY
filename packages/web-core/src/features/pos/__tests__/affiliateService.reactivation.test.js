import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
    post: vi.fn(),
    patch: vi.fn()
}));

vi.mock('@/services/api', () => ({ default: apiMock }));

import { reactivateAffiliateEnrollment } from '../services/affiliateService.js';

describe('reactivateAffiliateEnrollment', () => {
    beforeEach(() => {
        apiMock.post.mockReset();
        apiMock.patch.mockReset();
    });

    it('uses the dedicated endpoint when the current backend exposes it', async () => {
        apiMock.post.mockResolvedValue({ data: { data: { enrollment: { enrollment_id: 12, status: 'active' } } } });

        await expect(reactivateAffiliateEnrollment(12)).resolves.toEqual({ enrollment_id: 12, status: 'active' });
        expect(apiMock.post).toHaveBeenCalledWith('/affiliates/affiliates/12/reactivate');
        expect(apiMock.patch).not.toHaveBeenCalled();
    });

    it('propagates server failures without attempting a different status transition', async () => {
        const error = { response: { status: 500 } };
        apiMock.post.mockRejectedValue(error);

        await expect(reactivateAffiliateEnrollment(12)).rejects.toBe(error);
        expect(apiMock.patch).not.toHaveBeenCalled();
    });

    it('does not convert a missing dedicated route into a generic enrollment PATCH', async () => {
        const error = { response: { status: 404 } };
        apiMock.post.mockRejectedValue(error);

        await expect(reactivateAffiliateEnrollment(12)).rejects.toBe(error);
        expect(apiMock.patch).not.toHaveBeenCalled();
    });
});
