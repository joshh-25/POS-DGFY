/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolvePosHardwareDriver = vi.hoisted(() => vi.fn());
const refreshPosHardwareDriver = vi.hoisted(() => vi.fn());

vi.mock('../posHardwareRegistry.js', () => ({
    resolvePosHardwareDriver,
    refreshPosHardwareDriver
}));

import { usePosHardware } from '../usePosHardware.js';

describe('usePosHardware authentication boundary', () => {
    beforeEach(() => {
        resolvePosHardwareDriver.mockReset();
        refreshPosHardwareDriver.mockReset();
        resolvePosHardwareDriver.mockResolvedValue({ id: 'none' });
        refreshPosHardwareDriver.mockResolvedValue({ id: 'none' });
    });

    it('does not probe the protected device-status endpoint before authentication', async () => {
        const { result } = renderHook(() => usePosHardware({ enabled: false }));

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(resolvePosHardwareDriver).not.toHaveBeenCalled();
        expect(refreshPosHardwareDriver).not.toHaveBeenCalled();
    });

    it('starts hardware detection when authentication becomes available', async () => {
        const { result, rerender } = renderHook(
            ({ enabled }) => usePosHardware({ enabled }),
            { initialProps: { enabled: false } }
        );

        await waitFor(() => expect(result.current.loading).toBe(false));
        rerender({ enabled: true });

        await waitFor(() => expect(resolvePosHardwareDriver).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(result.current.driver?.id).toBe('none'));
    });

    it('does not refresh hardware while authentication is disabled', async () => {
        const { result } = renderHook(() => usePosHardware({ enabled: false }));

        await waitFor(() => expect(result.current.loading).toBe(false));
        await act(async () => {
            await result.current.refresh();
        });

        expect(refreshPosHardwareDriver).not.toHaveBeenCalled();
    });
});
