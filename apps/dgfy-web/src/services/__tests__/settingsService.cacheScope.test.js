import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiGetMock = vi.fn();
let companyToken = 'tenant-a';

vi.mock('../api.js', () => ({
  default: {
    get: apiGetMock
  }
}));

vi.mock('../browserSession.js', () => ({
  getCompanyToken: () => companyToken
}));

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

const localStorageStore = {};
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key) => localStorageStore[key] ?? null,
    setItem: (key, value) => {
      localStorageStore[key] = String(value);
    },
    removeItem: (key) => {
      delete localStorageStore[key];
    },
    clear: () => {
      Object.keys(localStorageStore).forEach((key) => delete localStorageStore[key]);
    }
  },
  writable: true
});

describe('settingsService cache scoping', () => {
  beforeEach(() => {
    vi.resetModules();
    apiGetMock.mockReset();
    companyToken = 'tenant-a';
    localStorage.clear();
  });

  it('does not let a stale tenant settings response overwrite the active tenant cache', async () => {
    const tenantA = deferred();
    const tenantB = deferred();
    apiGetMock
      .mockReturnValueOnce(tenantA.promise)
      .mockReturnValueOnce(tenantB.promise);

    const { getAllSettings } = await import('../settingsService.js');

    const tenantARequest = getAllSettings();
    companyToken = 'tenant-b';
    const tenantBRequest = getAllSettings({ force: true });

    tenantB.resolve({
      data: {
        data: {
          ops_workflow_mode: { value: 'fnb' }
        }
      }
    });
    await expect(tenantBRequest).resolves.toMatchObject({
      ops_workflow_mode: { value: 'fnb' }
    });

    tenantA.resolve({
      data: {
        data: {
          ops_workflow_mode: { value: 'food_manufacturing' }
        }
      }
    });
    await expect(tenantARequest).resolves.toMatchObject({
      ops_workflow_mode: { value: 'food_manufacturing' }
    });

    const cachedTenantBSettings = await getAllSettings();

    expect(apiGetMock).toHaveBeenCalledTimes(2);
    expect(cachedTenantBSettings).toMatchObject({
      ops_workflow_mode: { value: 'fnb' }
    });
  });
});
