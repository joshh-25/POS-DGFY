import { jest } from '@jest/globals';

const mockVerifyToken = jest.fn();
const mockIsTokenBlacklisted = jest.fn();
const mockVerifyStoreToken = jest.fn();
const mockFindDgfyAccountById = jest.fn();
const mockDbGet = jest.fn();
const mockLoggerWarn = jest.fn();

jest.unstable_mockModule('../src/services/authService.js', () => ({
  verifyToken: mockVerifyToken,
  isTokenBlacklisted: mockIsTokenBlacklisted
}));

jest.unstable_mockModule('../src/modules/store/utils/storeJwtToken.js', () => ({
  normalizeTenantIdentifier: (value) => String(value || '').trim(),
  verifyStoreToken: mockVerifyStoreToken
}));

jest.unstable_mockModule('../src/modules/dgfy/index.js', () => ({
  dgfyAccountRepository: {
    findById: mockFindDgfyAccountById
  }
}));

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
  default: {
    get: mockDbGet
  }
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
  default: {
    warn: mockLoggerWarn
  }
}));

let authenticateStoreCustomer;

beforeAll(async () => {
  ({ authenticateStoreCustomer } = await import('../src/middleware/storeAuth.js'));
});

const dgfyAccount = {
  id: 'dgfy-1',
  email: 'ada@example.test',
  first_name: 'Ada',
  middle_name: 'Byron',
  last_name: 'Lovelace',
  phone: '+639123456789',
  username: 'ada'
};

const createRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

const createReq = () => ({
  headers: {
    cookie: 'sku_dgfy_session=dgfy-token'
  },
  tenant: {
    id: 'tenant-1'
  }
});

const makeCustomer = (overrides = {}) => {
  const customer = {
    customer_id: 42,
    dgfy_account_id: 'dgfy-1',
    email: 'ada@example.test',
    name: 'Ada Lovelace',
    phone: '+639123456789',
    is_active: true,
    update: jest.fn(),
    reload: jest.fn(),
    ...overrides
  };
  customer.update.mockResolvedValue(customer);
  customer.reload.mockResolvedValue(customer);
  return customer;
};

const prepareDgfyCookieFallback = ({ StoreCustomer }) => {
  mockVerifyStoreToken.mockImplementation(() => {
    throw new Error('invalid store token');
  });
  mockVerifyToken.mockReturnValue({
    token_scope: 'dgfy',
    dgfy_account_id: 'dgfy-1'
  });
  mockIsTokenBlacklisted.mockResolvedValue(false);
  mockFindDgfyAccountById.mockResolvedValue(dgfyAccount);
  mockDbGet.mockImplementation((modelName) => {
    if (modelName === 'StoreCustomer') return StoreCustomer;
    throw new Error(`Unexpected model ${modelName}`);
  });
};

describe('authenticateStoreCustomer DGFY cookie fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('authenticates a customer that is explicitly linked to the DGFY account', async () => {
    const linkedCustomer = makeCustomer();
    const StoreCustomer = {
      findOne: jest.fn().mockResolvedValueOnce(linkedCustomer),
      create: jest.fn()
    };
    prepareDgfyCookieFallback({ StoreCustomer });

    const req = createReq();
    const res = createRes();
    const next = jest.fn();

    await authenticateStoreCustomer(req, res, next);

    expect(StoreCustomer.findOne).toHaveBeenCalledWith({ where: { dgfy_account_id: 'dgfy-1' } });
    expect(StoreCustomer.create).not.toHaveBeenCalled();
    expect(linkedCustomer.update).toHaveBeenCalledWith(expect.objectContaining({
      dgfy_account_id: 'dgfy-1',
      name: 'Ada Byron Lovelace',
      phone: '+639123456789'
    }));
    expect(req.storeCustomer).toEqual(expect.objectContaining({
      customer_id: 42,
      dgfy_account_id: 'dgfy-1',
      email: 'ada@example.test',
      auth_source: 'dgfy'
    }));
    expect(next).toHaveBeenCalledWith();
  });

  it('does not silently claim an unlinked same-email store customer', async () => {
    const sameEmailCustomer = makeCustomer({ dgfy_account_id: null });
    const StoreCustomer = {
      findOne: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sameEmailCustomer),
      create: jest.fn()
    };
    prepareDgfyCookieFallback({ StoreCustomer });

    const req = createReq();
    const res = createRes();
    const next = jest.fn();

    await authenticateStoreCustomer(req, res, next);

    expect(StoreCustomer.findOne).toHaveBeenNthCalledWith(1, { where: { dgfy_account_id: 'dgfy-1' } });
    expect(StoreCustomer.findOne).toHaveBeenNthCalledWith(2, { where: { email: 'ada@example.test' } });
    expect(sameEmailCustomer.update).not.toHaveBeenCalled();
    expect(StoreCustomer.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error_code: 'STORE_CUSTOMER_LINK_REQUIRED'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('creates a tenant-local compatibility customer when no explicit link or same-email customer exists', async () => {
    const createdCustomer = makeCustomer({ customer_id: 77 });
    const StoreCustomer = {
      findOne: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null),
      create: jest.fn().mockResolvedValue(createdCustomer)
    };
    prepareDgfyCookieFallback({ StoreCustomer });

    const req = createReq();
    const res = createRes();
    const next = jest.fn();

    await authenticateStoreCustomer(req, res, next);

    expect(StoreCustomer.create).toHaveBeenCalledWith(expect.objectContaining({
      dgfy_account_id: 'dgfy-1',
      email: 'ada@example.test',
      name: 'Ada Byron Lovelace',
      is_active: true
    }));
    expect(req.storeCustomer).toEqual(expect.objectContaining({
      customer_id: 77,
      dgfy_account_id: 'dgfy-1',
      auth_source: 'dgfy'
    }));
    expect(next).toHaveBeenCalledWith();
  });

  it('fails closed when the explicitly linked store customer is inactive', async () => {
    const inactiveCustomer = makeCustomer({ is_active: false });
    const StoreCustomer = {
      findOne: jest.fn().mockResolvedValueOnce(inactiveCustomer),
      create: jest.fn()
    };
    prepareDgfyCookieFallback({ StoreCustomer });

    const req = createReq();
    const res = createRes();
    const next = jest.fn();

    await authenticateStoreCustomer(req, res, next);

    expect(inactiveCustomer.update).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Store customer account is inactive'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('fails closed when tenant schema cannot prove explicit DGFY linkage', async () => {
    const missingColumnError = new Error("Unknown column 'dgfy_account_id'");
    missingColumnError.original = {
      code: 'ER_BAD_FIELD_ERROR',
      sqlMessage: "Unknown column 'dgfy_account_id'"
    };
    const StoreCustomer = {
      findOne: jest.fn().mockRejectedValueOnce(missingColumnError),
      create: jest.fn()
    };
    prepareDgfyCookieFallback({ StoreCustomer });

    const req = createReq();
    const res = createRes();
    const next = jest.fn();

    await authenticateStoreCustomer(req, res, next);

    expect(StoreCustomer.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error_code: 'STORE_CUSTOMER_LINK_REQUIRED',
      message: 'DGFY storefront customer linking is not available for this tenant schema.'
    }));
    expect(next).not.toHaveBeenCalled();
  });
});
