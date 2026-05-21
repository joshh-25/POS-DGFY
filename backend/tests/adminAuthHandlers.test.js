import { jest } from '@jest/globals';

const mockAdminLoginUseCase = jest.fn();
const mockAdminLogoutUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/adminAuth/index.js', () => ({
  adminLoginUseCase: mockAdminLoginUseCase,
  adminLogoutUseCase: mockAdminLogoutUseCase
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

let adminLogin;
let adminLogout;

beforeAll(async () => {
  const mod = await import('../src/modules/adminAuth/controllers/adminAuthHandlers.js');
  adminLogin = mod.adminLogin;
  adminLogout = mod.adminLogout;
});

const createRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('adminAuthHandlers.adminLogin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns stable success payload for valid credentials', async () => {
    mockAdminLoginUseCase.mockResolvedValue({
      success: true,
      data: {
        token: 'jwt-token',
        admin: { username: 'skupervisor' }
      }
    });

    const req = { body: { username: 'skupervisor', password: '252378' } };
    const res = createRes();

    await adminLogin(req, res);

    expect(mockAdminLoginUseCase).toHaveBeenCalledWith({
      username: 'skupervisor',
      password: '252378',
      sourceIp: 'unknown-ip'
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Admin login successful',
      token: 'jwt-token',
      admin: { username: 'skupervisor' }
    });
  });

  it('returns mapped 401 payload for invalid credentials', async () => {
    mockAdminLoginUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'AUTHENTICATION_FAILED',
        message: 'Invalid credentials',
        statusCode: 401
      }
    });

    const req = { body: { username: 'bad', password: 'bad' } };
    const res = createRes();

    await adminLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid credentials'
    });
  });
});

describe('adminAuthHandlers.adminLogout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns stable success payload when token is revoked', async () => {
    mockAdminLogoutUseCase.mockResolvedValue({
      success: true,
      data: { blacklisted: true }
    });

    const req = { headers: { authorization: 'Bearer jwt-token' } };
    const res = createRes();

    await adminLogout(req, res);

    expect(mockAdminLogoutUseCase).toHaveBeenCalledWith({ token: 'jwt-token' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Admin logout successful',
      data: { blacklisted: true }
    });
  });

  it('returns mapped validation payload when token is missing', async () => {
    mockAdminLogoutUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Token is required',
        statusCode: 422
      }
    });

    const req = { headers: {} };
    const res = createRes();

    await adminLogout(req, res);

    expect(mockAdminLogoutUseCase).toHaveBeenCalledWith({ token: '' });
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Token is required'
    });
  });
});
