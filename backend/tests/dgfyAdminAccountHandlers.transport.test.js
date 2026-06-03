import { jest } from '@jest/globals';

const mockListAdminDgfyAccountsUseCase = jest.fn();
const mockGetAdminDgfyAccountUseCase = jest.fn();
const mockUpdateAdminDgfyAccountProfileUseCase = jest.fn();
const mockSuspendAdminDgfyAccountUseCase = jest.fn();
const mockReactivateAdminDgfyAccountUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/dgfy/index.js', () => ({
  listAdminDgfyAccountsUseCase: mockListAdminDgfyAccountsUseCase,
  getAdminDgfyAccountUseCase: mockGetAdminDgfyAccountUseCase,
  updateAdminDgfyAccountProfileUseCase: mockUpdateAdminDgfyAccountProfileUseCase,
  suspendAdminDgfyAccountUseCase: mockSuspendAdminDgfyAccountUseCase,
  reactivateAdminDgfyAccountUseCase: mockReactivateAdminDgfyAccountUseCase
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let listAdminDgfyAccounts;
let getAdminDgfyAccount;
let updateAdminDgfyAccountProfile;
let suspendAdminDgfyAccount;
let reactivateAdminDgfyAccount;

beforeAll(async () => {
  const mod = await import('../src/modules/dgfy/controllers/dgfyAdminAccountHandlers.js');
  listAdminDgfyAccounts = mod.listAdminDgfyAccounts;
  getAdminDgfyAccount = mod.getAdminDgfyAccount;
  updateAdminDgfyAccountProfile = mod.updateAdminDgfyAccountProfile;
  suspendAdminDgfyAccount = mod.suspendAdminDgfyAccount;
  reactivateAdminDgfyAccount = mod.reactivateAdminDgfyAccount;
});

const createRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('dgfyAdminAccountHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ skipped: true });
  });

  it('lists admin DGFY accounts with query filters', async () => {
    mockListAdminDgfyAccountsUseCase.mockResolvedValue({
      success: true,
      data: {
        payload: {
          success: true,
          data: { accounts: [], pagination: { page: 1, limit: 25, total: 0 }, summary: {} }
        }
      }
    });

    const req = { query: { status: 'active' }, admin: { username: 'platform' } };
    const res = createRes();

    await listAdminDgfyAccounts(req, res);

    expect(mockListAdminDgfyAccountsUseCase).toHaveBeenCalledWith({ query: { status: 'active' } });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'admin_dgfy_accounts_viewed',
      surface: 'admin_dgfy_accounts',
      action: 'list_dgfy_accounts'
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('loads one admin DGFY account by route param', async () => {
    mockGetAdminDgfyAccountUseCase.mockResolvedValue({
      success: true,
      data: { payload: { success: true, data: { account: { id: 'dgfy-1' }, audit_logs: [] } } }
    });
    const req = { params: { account_id: 'dgfy-1' }, admin: { username: 'platform' } };
    const res = createRes();

    await getAdminDgfyAccount(req, res);

    expect(mockGetAdminDgfyAccountUseCase).toHaveBeenCalledWith({ accountId: 'dgfy-1' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updates profile with actor and request metadata', async () => {
    mockUpdateAdminDgfyAccountProfileUseCase.mockResolvedValue({
      success: true,
      data: { payload: { success: true, data: { account: { id: 'dgfy-1' } } } }
    });
    const req = {
      params: { account_id: 'dgfy-1' },
      body: { first_name: 'Ada' },
      admin: { username: 'platform' },
      requestId: 'req-1',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
      get: jest.fn().mockReturnValue('jest')
    };
    const res = createRes();

    await updateAdminDgfyAccountProfile(req, res);

    expect(mockUpdateAdminDgfyAccountProfileUseCase).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'dgfy-1',
      body: { first_name: 'Ada' },
      actor: expect.objectContaining({ username: 'platform', is_platform_admin: true }),
      metadata: expect.objectContaining({ request_id: 'req-1', ip_address: '127.0.0.1', user_agent: 'jest' })
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns validation failure shape for suspend', async () => {
    mockSuspendAdminDgfyAccountUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        statusCode: 400,
        message: 'Reason is required and must be at least 3 characters.'
      }
    });
    const req = { params: { account_id: 'dgfy-1' }, body: {}, admin: { username: 'platform' }, headers: {} };
    const res = createRes();

    await suspendAdminDgfyAccount(req, res);

    expect(mockSuspendAdminDgfyAccountUseCase).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'dgfy-1'
    }));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Reason is required and must be at least 3 characters.'
    });
  });

  it('reactivates through the matching use case', async () => {
    mockReactivateAdminDgfyAccountUseCase.mockResolvedValue({
      success: true,
      data: { payload: { success: true, data: { account: { id: 'dgfy-1', is_active: true } } } }
    });
    const req = { params: { account_id: 'dgfy-1' }, body: { reason: 'Cleared' }, admin: { username: 'platform' }, headers: {} };
    const res = createRes();

    await reactivateAdminDgfyAccount(req, res);

    expect(mockReactivateAdminDgfyAccountUseCase).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'dgfy-1',
      body: { reason: 'Cleared' }
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
