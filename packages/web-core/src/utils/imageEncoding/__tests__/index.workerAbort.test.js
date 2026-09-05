/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installMockCanvas } from './canvasTestUtils.js';
import { resetCapabilitiesCacheForTests } from '../capabilities.js';

// Force the "on" branch (Phase 296's own rolloutFlag.js stub always returns 'off' -- this
// mock is what proves the worker-orchestration plumbing actually works once Phase 298 flips
// the real flag, per the plan's own note on posCatalogService.js's minimal diff).
vi.mock('../rolloutFlag.js', () => ({ getImageClientConversionFlag: () => 'on' }));

class MockWorker {
  constructor(url) {
    this.url = url;
    this.postMessage = vi.fn();
    this.terminate = vi.fn();
    this.onmessage = null;
    this.onerror = null;
    MockWorker.instances.push(this);
  }
}
MockWorker.instances = [];

describe('worker orchestration: abort/cancellation', () => {
  beforeEach(() => {
    MockWorker.instances = [];
    resetCapabilitiesCacheForTests();
    installMockCanvas();
    vi.stubGlobal('Worker', MockWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unused in this suite')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('rejects immediately for an already-aborted signal, without constructing a Worker', async () => {
    const { prepareImageVariants } = await import('../index.js');
    const controller = new AbortController();
    controller.abort();

    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });

    await expect(prepareImageVariants(file, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(MockWorker.instances).toHaveLength(0);
  });

  it('terminates the worker and rejects on a mid-flight abort, ignoring any late message', async () => {
    const { prepareImageVariants } = await import('../index.js');
    const controller = new AbortController();
    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' });

    const resultPromise = prepareImageVariants(file, { signal: controller.signal });

    await vi.waitFor(() => expect(MockWorker.instances).toHaveLength(1));
    const worker = MockWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.terminate).not.toHaveBeenCalled();

    controller.abort();

    await expect(resultPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    // A message arriving after termination must not be processed -- the promise is already
    // settled, and no second resolve/reject (which vitest would flag) may fire.
    expect(() =>
      worker.onmessage?.({
        data: { type: 'success', result: { variants: {}, variantMeta: {}, degraded: [] } },
      })
    ).not.toThrow();
  });
});
