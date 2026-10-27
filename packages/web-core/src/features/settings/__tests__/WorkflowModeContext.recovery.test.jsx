// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowModeProvider, useWorkflowMode } from '../WorkflowModeContext.jsx';
import { WORKFLOW_MODE_CHANGED_EVENT } from '../workflowMode.js';
import { PosCheckoutDetailsSlot } from '../../pos/components/PosCheckoutDetailsSlot.jsx';
import { usePosFnbCheckoutState } from '../../pos/hooks/usePosFnbCheckoutState.js';
import { resolvePosPresentationBundle } from '../../pos/utils/posPresentationBundle.js';
import { resolvePosWorkflow } from '../../pos/utils/posWorkflowResolver.js';

// Issue #2824: a failed GET /settings must not silently drop an F&B terminal to the Counter
// workflow, and the provider must recover without an app restart.

const browserSessionMock = vi.hoisted(() => ({
  getAccessToken: vi.fn(() => 'token'),
  getCompanyToken: vi.fn(() => 'company-token-A'),
  refreshBrowserSession: vi.fn()
}));

const settingsServiceMock = vi.hoisted(() => ({
  getAllSettings: vi.fn()
}));

vi.mock('@/services/browserSession.js', () => browserSessionMock);
vi.mock('@/services/settingsService.js', () => settingsServiceMock);

const FNB_SETTINGS = Object.freeze({ ops_workflow_mode: { value: 'fnb' } });
const RETAIL_SETTINGS = Object.freeze({ ops_workflow_mode: { value: 'retail' } });
const CACHE_KEY_PREFIX = 'dgfy.workflow-mode.last-known-good.v1';

const Probe = () => {
  const { workflowMode, workflowSource, resolved, loading, error, hasCapability } = useWorkflowMode();
  return (
    <div>
      <span data-testid="mode">{workflowMode}</span>
      <span data-testid="workflow-source">{workflowSource}</span>
      <span data-testid="resolved">{String(resolved)}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="error">{error ? String(error.message) : 'none'}</span>
      <span data-testid="table-service">{String(hasCapability('tableService'))}</span>
    </div>
  );
};

const CheckoutRecoveryProbe = () => {
  const { workflowMode, workflowSource, loading, profile, refreshWorkflowMode } = useWorkflowMode();
  const posWorkflow = resolvePosWorkflow(workflowMode, profile?.modules);
  const [orderMethod, setOrderMethod] = React.useState(posWorkflow.allowedMethods[0] || 'walk_in');
  const [tableNumber, setTableNumber] = React.useState('');
  const [kitchenNotes, setKitchenNotes] = React.useState('');

  usePosFnbCheckoutState({
    normalizedFnbContext: null,
    hasFnbCheckoutContext: false,
    checkoutUsesFnbContract: workflowMode === 'fnb',
    workflowMode,
    allowedMethods: posWorkflow.allowedMethods,
    orderMethod,
    setOrderMethod,
    catalogLoading: false,
    safeCart: [],
    safeCatalog: [],
    setCart: () => {},
    setTableNumber,
    setKitchenNotes
  });

  return (
    <>
      <span data-testid="workflow-source">{workflowSource}</span>
      <PosCheckoutDetailsSlot
        presentationBundle={resolvePosPresentationBundle(posWorkflow)}
        posWorkflow={posWorkflow}
        orderMethod={orderMethod}
        setOrderMethod={setOrderMethod}
        tableNumber={tableNumber}
        setTableNumber={setTableNumber}
        kitchenNotes={kitchenNotes}
        setKitchenNotes={setKitchenNotes}
        buttonLayout
        workflowUnresolved={workflowSource === 'unresolved'}
        workflowLoading={loading}
        onRetryWorkflow={() => refreshWorkflowMode({ force: true })}
      />
    </>
  );
};

const renderProvider = () => render(
  <WorkflowModeProvider>
    <Probe />
  </WorkflowModeProvider>
);

const renderCheckoutRecoveryProbe = () => render(
  <WorkflowModeProvider>
    <CheckoutRecoveryProbe />
  </WorkflowModeProvider>
);

const text = (testId) => screen.getByTestId(testId).textContent;
const cacheKeys = () => Object.keys(window.localStorage).filter((key) => key.startsWith(CACHE_KEY_PREFIX));
const flush = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('WorkflowModeProvider last-known-good fallback and recovery (issue #2824)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks keeps queued `...Once` implementations; reset so one failure cannot cascade.
    settingsServiceMock.getAllSettings.mockReset();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/dashboard');
    browserSessionMock.getAccessToken.mockReturnValue('token');
    browserSessionMock.getCompanyToken.mockReturnValue('company-token-A');
    browserSessionMock.refreshBrowserSession.mockResolvedValue('token');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  describe('POS checkout recovery path', () => {
    it('replaces the unresolved notice with the recovered F&B Dine In checkout', async () => {
      settingsServiceMock.getAllSettings
        .mockRejectedValueOnce(new Error('settings unavailable'))
        .mockResolvedValueOnce(FNB_SETTINGS);
      renderCheckoutRecoveryProbe();

      const unresolvedNotice = await screen.findByTestId('pos-workflow-unresolved-notice');
      expect(unresolvedNotice.textContent).toContain('Reconnect to load store settings');
      expect(screen.queryByRole('button', { name: 'Dine In' })).toBeNull();

      act(() => {
        window.dispatchEvent(new Event('online'));
      });

      expect(await screen.findByTestId('fnb-workflow-panel')).toBeDefined();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Dine In' }).getAttribute('aria-pressed')).toBe('true'));
      expect(screen.queryByTestId('pos-workflow-unresolved-notice')).toBeNull();
      expect(screen.getByLabelText('Table # (Optional)')).toBeDefined();
      expect(screen.getByLabelText('Order Notes (Global)')).toBeDefined();
    });

    it('starts directly in cached F&B checkout when a last-known-good bundle exists', async () => {
      settingsServiceMock.getAllSettings.mockResolvedValueOnce(FNB_SETTINGS);
      renderCheckoutRecoveryProbe();
      await waitFor(() => expect(screen.getByTestId('workflow-source').textContent).toBe('server'));
      cleanup();

      settingsServiceMock.getAllSettings.mockRejectedValueOnce(new Error('settings unavailable'));
      renderCheckoutRecoveryProbe();

      await waitFor(() => expect(screen.getByTestId('workflow-source').textContent).toBe('cache'));
      expect(await screen.findByTestId('fnb-workflow-panel')).toBeDefined();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Dine In' }).getAttribute('aria-pressed')).toBe('true'));
      expect(screen.queryByTestId('pos-workflow-unresolved-notice')).toBeNull();
      expect(screen.getByLabelText('Table # (Optional)')).toBeDefined();
      expect(screen.getByLabelText('Order Notes (Global)')).toBeDefined();
    });
  });

  describe('cache', () => {
    it('starts unresolved while the settings request is pending', () => {
      settingsServiceMock.getAllSettings.mockReturnValue(new Promise(() => {}));
      renderProvider();

      expect(text('workflow-source')).toBe('unresolved');
      expect(text('loading')).toBe('true');
    });

    it('keeps the F&B workflow when a later load fails for the same tenant', async () => {
      settingsServiceMock.getAllSettings.mockResolvedValueOnce(FNB_SETTINGS);
      renderProvider();
      await waitFor(() => expect(text('mode')).toBe('fnb'));
      expect(text('workflow-source')).toBe('server');
      expect(cacheKeys()).toHaveLength(1);
      cleanup();

      settingsServiceMock.getAllSettings.mockRejectedValue(new Error('settings unavailable'));
      renderProvider();

      await waitFor(() => expect(text('error')).toBe('settings unavailable'));
      expect(text('mode')).toBe('fnb');
      expect(text('workflow-source')).toBe('cache');
      expect(text('resolved')).toBe('true');
      expect(text('table-service')).toBe('true');
    });

    it('keeps today\'s Counter fallback when there is no cached bundle', async () => {
      settingsServiceMock.getAllSettings.mockRejectedValue(new Error('settings unavailable'));
      renderProvider();

      await waitFor(() => expect(text('error')).toBe('settings unavailable'));
      expect(text('mode')).toBe('food_manufacturing');
      expect(text('workflow-source')).toBe('unresolved');
      expect(text('resolved')).toBe('false');
      expect(text('table-service')).toBe('false');
    });

    it('never applies another tenant\'s cached bundle', async () => {
      settingsServiceMock.getAllSettings.mockResolvedValueOnce(FNB_SETTINGS);
      renderProvider();
      await waitFor(() => expect(text('mode')).toBe('fnb'));
      cleanup();

      browserSessionMock.getCompanyToken.mockReturnValue('company-token-B');
      settingsServiceMock.getAllSettings.mockRejectedValue(new Error('settings unavailable'));
      renderProvider();

      await waitFor(() => expect(text('error')).toBe('settings unavailable'));
      expect(text('mode')).toBe('food_manufacturing');
      expect(text('workflow-source')).toBe('unresolved');
      expect(text('resolved')).toBe('false');
    });

    it('neither reads nor writes the cache without a tenant identity', async () => {
      browserSessionMock.getCompanyToken.mockReturnValue('');
      settingsServiceMock.getAllSettings.mockResolvedValueOnce(FNB_SETTINGS);
      renderProvider();
      await waitFor(() => expect(text('mode')).toBe('fnb'));
      expect(cacheKeys()).toHaveLength(0);
      cleanup();

      settingsServiceMock.getAllSettings.mockRejectedValue(new Error('settings unavailable'));
      renderProvider();
      await waitFor(() => expect(text('error')).toBe('settings unavailable'));
      expect(text('mode')).toBe('food_manufacturing');
    });

    it('keeps the raw company token out of storage keys and values', async () => {
      settingsServiceMock.getAllSettings.mockResolvedValueOnce(FNB_SETTINGS);
      renderProvider();
      await waitFor(() => expect(text('mode')).toBe('fnb'));

      const [key] = cacheKeys();
      expect(key).not.toContain('company-token-A');
      expect(window.localStorage.getItem(key)).not.toContain('company-token-A');
    });

    it('never persists a fallback or default result', async () => {
      settingsServiceMock.getAllSettings.mockRejectedValue(new Error('settings unavailable'));
      renderProvider();
      await waitFor(() => expect(text('error')).toBe('settings unavailable'));
      expect(cacheKeys()).toHaveLength(0);
      cleanup();

      browserSessionMock.getAccessToken.mockReturnValue('');
      browserSessionMock.refreshBrowserSession.mockRejectedValue(new Error('offline'));
      renderProvider();
      await waitFor(() => expect(text('resolved')).toBe('true'));
      expect(text('mode')).toBe('food_manufacturing');
      expect(cacheKeys()).toHaveLength(0);
    });

    it('still resolves from a successful load when storage writes throw', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      settingsServiceMock.getAllSettings.mockResolvedValueOnce(FNB_SETTINGS);
      renderProvider();

      await waitFor(() => expect(text('mode')).toBe('fnb'));
      expect(text('resolved')).toBe('true');
      expect(text('error')).toBe('none');
    });

    it('falls back to the default when the cached record is corrupt', async () => {
      settingsServiceMock.getAllSettings.mockResolvedValueOnce(FNB_SETTINGS);
      renderProvider();
      await waitFor(() => expect(text('mode')).toBe('fnb'));
      const [key] = cacheKeys();
      cleanup();
      window.localStorage.setItem(key, '{not json');

      settingsServiceMock.getAllSettings.mockRejectedValue(new Error('settings unavailable'));
      renderProvider();

      await waitFor(() => expect(text('error')).toBe('settings unavailable'));
      expect(text('mode')).toBe('food_manufacturing');
      expect(text('resolved')).toBe('false');
    });
  });

  describe('online recovery', () => {
    it('re-fetches once on the online event and restores the F&B workflow', async () => {
      settingsServiceMock.getAllSettings
        .mockRejectedValueOnce(new Error('settings unavailable'))
        .mockResolvedValueOnce(FNB_SETTINGS);
      renderProvider();
      await waitFor(() => expect(text('error')).toBe('settings unavailable'));
      expect(text('mode')).toBe('food_manufacturing');

      act(() => {
        window.dispatchEvent(new Event('online'));
      });

      await waitFor(() => expect(text('mode')).toBe('fnb'));
      expect(text('workflow-source')).toBe('server');
      expect(text('resolved')).toBe('true');
      expect(text('error')).toBe('none');
      expect(settingsServiceMock.getAllSettings).toHaveBeenCalledTimes(2);
      expect(settingsServiceMock.getAllSettings).toHaveBeenLastCalledWith({ force: true });
    });

    it('does not start a second refresh while one is already in flight', async () => {
      let resolveRecovery;
      settingsServiceMock.getAllSettings
        .mockRejectedValueOnce(new Error('settings unavailable'))
        .mockImplementationOnce(() => new Promise((resolve) => { resolveRecovery = resolve; }));
      renderProvider();
      await waitFor(() => expect(text('error')).toBe('settings unavailable'));

      act(() => {
        window.dispatchEvent(new Event('online'));
        window.dispatchEvent(new Event('online'));
      });
      expect(settingsServiceMock.getAllSettings).toHaveBeenCalledTimes(2);

      await act(async () => {
        resolveRecovery(FNB_SETTINGS);
      });
      await waitFor(() => expect(text('mode')).toBe('fnb'));
      expect(settingsServiceMock.getAllSettings).toHaveBeenCalledTimes(2);
    });

    it('does not flip loading or resolved while a background recovery is in flight', async () => {
      settingsServiceMock.getAllSettings.mockResolvedValueOnce(FNB_SETTINGS);
      renderProvider();
      await waitFor(() => expect(text('mode')).toBe('fnb'));
      cleanup();

      let resolveRecovery;
      settingsServiceMock.getAllSettings
        .mockRejectedValueOnce(new Error('settings unavailable'))
        .mockImplementationOnce(() => new Promise((resolve) => { resolveRecovery = resolve; }));
      renderProvider();
      await waitFor(() => expect(text('error')).toBe('settings unavailable'));
      expect(text('resolved')).toBe('true');

      act(() => {
        window.dispatchEvent(new Event('online'));
      });

      expect(text('loading')).toBe('false');
      expect(text('resolved')).toBe('true');
      expect(text('mode')).toBe('fnb');

      await act(async () => {
        resolveRecovery(RETAIL_SETTINGS);
      });
      await waitFor(() => expect(text('mode')).toBe('retail'));
      expect(text('error')).toBe('none');
      expect(text('workflow-source')).toBe('server');
    });

    it('ignores the online event when the last refresh succeeded', async () => {
      settingsServiceMock.getAllSettings.mockResolvedValue(FNB_SETTINGS);
      renderProvider();
      await waitFor(() => expect(text('mode')).toBe('fnb'));

      act(() => {
        window.dispatchEvent(new Event('online'));
      });

      expect(settingsServiceMock.getAllSettings).toHaveBeenCalledTimes(1);
    });

    it('marks a workflow mode change event as server-sourced', async () => {
      settingsServiceMock.getAllSettings.mockResolvedValue(FNB_SETTINGS);
      renderProvider();
      await waitFor(() => expect(text('workflow-source')).toBe('server'));

      act(() => {
        window.dispatchEvent(new CustomEvent(WORKFLOW_MODE_CHANGED_EVENT, { detail: { mode: 'retail' } }));
      });

      expect(text('mode')).toBe('retail');
      expect(text('workflow-source')).toBe('server');
    });

    it('marks the provider unresolved after logout', async () => {
      settingsServiceMock.getAllSettings.mockResolvedValue(FNB_SETTINGS);
      renderProvider();
      await waitFor(() => expect(text('workflow-source')).toBe('server'));

      act(() => {
        window.dispatchEvent(new Event('auth:logout'));
      });

      expect(text('workflow-source')).toBe('unresolved');
      expect(text('resolved')).toBe('false');
    });

    it('recovers on online after the no-token path, which leaves error null', async () => {
      browserSessionMock.getAccessToken.mockReturnValue('');
      browserSessionMock.refreshBrowserSession.mockRejectedValue(new Error('offline'));
      settingsServiceMock.getAllSettings.mockResolvedValue(FNB_SETTINGS);
      renderProvider();

      await waitFor(() => expect(text('resolved')).toBe('true'));
      expect(text('mode')).toBe('food_manufacturing');
      expect(text('workflow-source')).toBe('unresolved');
      expect(text('error')).toBe('none');
      expect(settingsServiceMock.getAllSettings).not.toHaveBeenCalled();

      browserSessionMock.getAccessToken.mockReturnValue('token');
      act(() => {
        window.dispatchEvent(new Event('online'));
      });

      await waitFor(() => expect(text('mode')).toBe('fnb'));
      expect(text('workflow-source')).toBe('server');
      expect(settingsServiceMock.getAllSettings).toHaveBeenCalledTimes(1);
    });

    it('stops listening after unmount', async () => {
      settingsServiceMock.getAllSettings.mockRejectedValue(new Error('settings unavailable'));
      renderProvider();
      await waitFor(() => expect(text('error')).toBe('settings unavailable'));
      cleanup();
      settingsServiceMock.getAllSettings.mockClear();

      window.dispatchEvent(new Event('online'));

      expect(settingsServiceMock.getAllSettings).not.toHaveBeenCalled();
    });
  });

  describe('bounded backoff', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('retries at 5s, 10s, 20s, 40s, then holds at the 60s cap', async () => {
      settingsServiceMock.getAllSettings.mockRejectedValue(new Error('settings unavailable'));
      renderProvider();
      await flush();
      const calls = () => settingsServiceMock.getAllSettings.mock.calls.length;
      expect(calls()).toBe(1);

      const delays = [5000, 10000, 20000, 40000, 60000, 60000];
      let expected = 1;
      for (const delay of delays) {
        await flush(delay - 1);
        expect(calls()).toBe(expected);
        await flush(1);
        expected += 1;
        expect(calls()).toBe(expected);
      }
    });

    it('stops retrying once a load succeeds', async () => {
      settingsServiceMock.getAllSettings
        .mockRejectedValueOnce(new Error('settings unavailable'))
        .mockResolvedValue(FNB_SETTINGS);
      renderProvider();
      await flush();
      await flush(5000);

      expect(text('mode')).toBe('fnb');
      expect(text('error')).toBe('none');
      await flush(300000);
      expect(settingsServiceMock.getAllSettings).toHaveBeenCalledTimes(2);
    });

    it('stops retrying on unmount', async () => {
      settingsServiceMock.getAllSettings.mockRejectedValue(new Error('settings unavailable'));
      renderProvider();
      await flush();
      cleanup();

      await flush(300000);
      expect(settingsServiceMock.getAllSettings).toHaveBeenCalledTimes(1);
    });

    it('does not schedule retries while the browser reports offline', async () => {
      Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
      settingsServiceMock.getAllSettings.mockRejectedValue(new Error('settings unavailable'));
      renderProvider();
      await flush();

      await flush(300000);
      expect(settingsServiceMock.getAllSettings).toHaveBeenCalledTimes(1);
    });

    it('does not poll after the no-token path', async () => {
      browserSessionMock.getAccessToken.mockReturnValue('');
      browserSessionMock.refreshBrowserSession.mockRejectedValue(new Error('offline'));
      renderProvider();
      await flush();

      await flush(300000);
      expect(settingsServiceMock.getAllSettings).not.toHaveBeenCalled();
    });
  });
});
