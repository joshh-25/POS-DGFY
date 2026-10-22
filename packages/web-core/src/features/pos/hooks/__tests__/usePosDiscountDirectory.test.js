/** @vitest-environment jsdom */

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { beforeEach, vi } from 'vitest';
import {
    fetchPosDiscountApprovers,
    fetchPosDiscountEmployees,
    fetchPosDiscountRules
} from '../../services/posService.js';
import { posToast } from '@/src/utils/iminRuntimeFeedback.js';
import { getPosDiscountDirectoryErrorMessage } from '../usePosDiscountDirectory.js';
import { usePosDiscountDirectory } from '../usePosDiscountDirectory.js';

vi.mock('../../services/posService.js', () => ({
    fetchPosDiscountApprovers: vi.fn(),
    fetchPosDiscountEmployees: vi.fn(),
    fetchPosDiscountRules: vi.fn()
}));

vi.mock('@/src/utils/iminRuntimeFeedback.js', () => ({
    posToast: {
        error: vi.fn()
    }
}));

beforeEach(() => {
    vi.clearAllMocks();
    fetchPosDiscountApprovers.mockResolvedValue([]);
    fetchPosDiscountEmployees.mockResolvedValue([]);
    fetchPosDiscountRules.mockResolvedValue([]);
});

describe('getPosDiscountDirectoryErrorMessage', () => {
    it('explains when POS transaction access is missing', () => {
        expect(getPosDiscountDirectoryErrorMessage({
            response: {
                status: 403,
                data: {
                    error_code: 'PERMISSION_DENIED',
                    required: 'pos:transact'
                }
            }
        })).toBe('Discounts unavailable. Your account does not have POS transaction access. Ask an administrator to enable Sell in Manage Permissions, then sign in again.');
    });

    it('supports the nested permission field returned by the API', () => {
        expect(getPosDiscountDirectoryErrorMessage({
            response: {
                status: 403,
                data: {
                    errors: { required_permission: 'pos:transact' }
                }
            }
        })).toContain('enable Sell in Manage Permissions');
    });

    it('explains expired sessions separately', () => {
        expect(getPosDiscountDirectoryErrorMessage({ response: { status: 401 } }))
            .toBe('Your POS session expired. Sign in again to load discounts.');
    });

    it('keeps a retry-oriented fallback for other failures', () => {
        expect(getPosDiscountDirectoryErrorMessage({ response: { status: 500 } }))
            .toBe('Unable to load the POS discount directory. Check your connection and try again.');
    });

    it('shows the permission guidance when the directory request is denied', async () => {
        fetchPosDiscountApprovers.mockRejectedValue({
            response: {
                status: 403,
                data: { required: 'pos:transact' }
            }
        });

        renderHook(() => usePosDiscountDirectory({ autoLoad: true }));

        await waitFor(() => expect(posToast.error).toHaveBeenCalledWith(
            'Discounts unavailable. Your account does not have POS transaction access. Ask an administrator to enable Sell in Manage Permissions, then sign in again.'
        ));
    });
});
