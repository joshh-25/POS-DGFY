import { jest } from '@jest/globals';

const mockAdminLoginUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/adminAuth/index.js', () => ({
  adminLoginUseCase: mockAdminLoginUseCase
}));

let adminLogin;

beforeAll(async () => {
  const mod = await import('../src/modules/adminAuth/controllers/adminAuthHandlers.js');
  adminLogin = mod.adminLogin;
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
      password: '252378'
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
