import { jest } from '@jest/globals';

const mockVerifyEmailOtp = jest.fn();
const mockVerifyToken = jest.fn();
const mockIsTokenBlacklisted = jest.fn();
const mockGetCookie = jest.fn();
const mockAddEmailTenantMapping = jest.fn();
const mockBuildLegacyDgfyLinkStatus = jest.fn();
const mockRepository = {
  transaction: jest.fn(),
  findById: jest.fn(),
  upsertAcceptedLegacyMembership: jest.fn(),
  createBusinessAuditLogStrict: jest.fn(),
  createBusinessAuditLog: jest.fn()
};

jest.unstable_mockModule('../src/services/emailOtpService.js', () => ({
  EMAIL_OTP_PURPOSES: {
    DGFY_LEGACY_LINK: 'dgfy_legacy_link'
  },
  requestEmailOtp: jest.fn(),
  verifyEmailOtp: mockVerifyEmailOtp
}));

jest.unstable_mockModule('../src/services/authService.js', () => ({
  verifyToken: mockVerifyToken,
  isTokenBlacklisted: mockIsTokenBlacklisted
}));

jest.unstable_mockModule('../src/utils/browserSessionCookies.js', () => ({
  SESSION_COOKIE_NAMES: { dgfy: 'sku_dgfy_session' },
  getCookie: mockGetCookie
}));

jest.unstable_mockModule('../src/services/landlordService.js', () => ({
  addEmailTenantMapping: mockAddEmailTenantMapping
}));

jest.unstable_mockModule('../src/services/dgfyLegacyAccessPolicy.js', () => ({
  buildLegacyDgfyLinkStatus: mockBuildLegacyDgfyLinkStatus
}));

jest.unstable_mockModule('../src/modules/dgfy/index.js', () => ({
  dgfyAccountRepository: mockRepository
}));

let completeLegacyLink;

beforeAll(async () => {
  ({ completeLegacyLink } = await import('../src/services/dgfyLegacyLinkService.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyEmailOtp.mockResolvedValue({ verified: true });
  mockVerifyToken.mockReturnValue({ token_scope: 'dgfy', dgfy_account_id: 'dgfy-1' });
  mockIsTokenBlacklisted.mockResolvedValue(false);
  mockGetCookie.mockReturnValue('dgfy-cookie-token');
  mockRepository.findById.mockResolvedValue({
    id: 'dgfy-1',
    email: 'legacy@example.test',
    is_active: true,
    deleted_at: null
  });
  mockRepository.transaction.mockImplementation(async (callback) => callback('tx-landlord'));
  mockRepository.upsertAcceptedLegacyMembership.mockResolvedValue({
    id: 101,
    source: 'founder'
  });
  mockRepository.createBusinessAuditLogStrict.mockResolvedValue({});
  mockRepository.createBusinessAuditLog.mockResolvedValue({});
  mockAddEmailTenantMapping.mockResolvedValue({ created: true });
  mockBuildLegacyDgfyLinkStatus.mockResolvedValue({
    dgfy_link_status: 'linked',
    can_legacy_login: false
  });
});

const buildReq = () => ({
  tenant: {
    id: 'tenant-1',
    owner_dgfy_account_id: null,
    update: jest.fn().mockResolvedValue(null)
  },
  user: {
    user_id: 9,
    email: 'legacy@example.test',
    role: 'admin',
    is_master_admin: true
  }
});

describe('dgfyLegacyLinkService', () => {
  it('links a legacy tenant user through one landlord transaction with strict audit', async () => {
    const req = buildReq();

    const result = await completeLegacyLink({
      req,
      body: { email_otp_code: '123456' },
      metadata: { request_id: 'req-legacy-link' }
    });

    expect(mockVerifyEmailOtp).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'dgfy_legacy_link',
      email: 'legacy@example.test',
      code: '123456',
      tenantId: 'tenant-1'
    }));
    expect(mockRepository.transaction).toHaveBeenCalled();
    expect(mockRepository.upsertAcceptedLegacyMembership).toHaveBeenCalledWith(expect.objectContaining({
      dgfyAccountId: 'dgfy-1',
      tenantId: 'tenant-1',
      tenantUserId: 9,
      source: 'founder'
    }), { transaction: 'tx-landlord' });
    expect(req.tenant.update).toHaveBeenCalledWith({ owner_dgfy_account_id: 'dgfy-1' }, { transaction: 'tx-landlord' });
    expect(mockAddEmailTenantMapping).toHaveBeenCalledWith('legacy@example.test', 'tenant-1', { transaction: 'tx-landlord' });
    expect(mockRepository.createBusinessAuditLogStrict).toHaveBeenCalledWith(expect.objectContaining({
      action: 'legacy_link_completed',
      result: 'success',
      request_id: 'req-legacy-link'
    }), { transaction: 'tx-landlord' });
    expect(result).toEqual(expect.objectContaining({
      membership_id: 101,
      tenant_id: 'tenant-1',
      dgfy_account_id: 'dgfy-1',
      dgfy_link_status: 'linked'
    }));
  });

  it('audits legacy link failure when a transactional landlord write fails', async () => {
    const req = buildReq();
    mockAddEmailTenantMapping.mockRejectedValue(new Error('mapping write failed'));

    await expect(completeLegacyLink({
      req,
      body: { email_otp_code: '123456' },
      metadata: { request_id: 'req-legacy-link-fail' }
    })).rejects.toThrow('mapping write failed');

    expect(mockRepository.createBusinessAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'legacy_link_failed',
      result: 'failure',
      reason: 'mapping write failed',
      request_id: 'req-legacy-link-fail'
    }));
  });
});
