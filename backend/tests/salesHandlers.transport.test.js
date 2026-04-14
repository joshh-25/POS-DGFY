import { jest } from '@jest/globals';

const mockListSalesTransactionsUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/sales/index.js', () => ({
  listSalesTransactionsUseCase: mockListSalesTransactionsUseCase
}));

let listSalesTransactions;

beforeAll(async () => {
  const mod = await import('../src/modules/sales/controllers/salesHandlers.js');
  listSalesTransactions = mod.listSalesTransactions;
});

const createRes = () => {
  const res = {
    locals: {},
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn(),
    setHeader: jest.fn()
  };
  res.status.mockReturnValue(res);
  res.send.mockReturnValue(res);
  return res;
};

describe('salesHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 when user has no qualifying permission', async () => {
    const req = {
      user: { permissions: [], is_master_admin: false },
      query: {}
    };
    const res = createRes();
    const next = jest.fn();

    await listSalesTransactions(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Access denied: Insufficient permissions'
    }));
  });

  it('returns normalized success payload for authorized user', async () => {
    mockListSalesTransactionsUseCase.mockResolvedValue({
      success: true,
      data: {
        transactions: [{ source: 'POS', reference_no: 'INV-000001' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        summary: { gross_sales: 100, cogs: 55, gross_profit: 45 }
      }
    });

    const req = {
      user: { permissions: ['reports:view'], is_master_admin: false },
      query: { page: '1' }
    };
    const res = createRes();
    const next = jest.fn();

    await listSalesTransactions(req, res, next);

    expect(mockListSalesTransactionsUseCase).toHaveBeenCalledWith({
      query: { page: '1' },
      userPermissions: ['reports:view']
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        transactions: expect.any(Array),
        pagination: expect.any(Object),
        summary: expect.any(Object)
      }),
      timestamp: expect.any(String)
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts JSON-string permissions payload from user profile rows', async () => {
    mockListSalesTransactionsUseCase.mockResolvedValue({
      success: true,
      data: {
        transactions: [{ source: 'POS', reference_no: 'INV-000002' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        summary: { gross_sales: 150, cogs: 80, gross_profit: 70 }
      }
    });

    const req = {
      user: { permissions: '["reports:view","pos:view"]', is_master_admin: false },
      query: { page: '1' }
    };
    const res = createRes();
    const next = jest.fn();

    await listSalesTransactions(req, res, next);

    expect(mockListSalesTransactionsUseCase).toHaveBeenCalledWith({
      query: { page: '1' },
      userPermissions: ['reports:view', 'pos:view']
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('fails closed when permissions string is malformed JSON', async () => {
    const req = {
      user: { permissions: '[reports:view', is_master_admin: false },
      query: {}
    };
    const res = createRes();
    const next = jest.fn();

    await listSalesTransactions(req, res, next);

    expect(mockListSalesTransactionsUseCase).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: 'Access denied: Insufficient permissions'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('allows master admin even when permissions string is malformed JSON', async () => {
    mockListSalesTransactionsUseCase.mockResolvedValue({
      success: true,
      data: {
        transactions: [{ source: 'POS', reference_no: 'INV-000003' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        summary: { gross_sales: 90, cogs: 40, gross_profit: 50 }
      }
    });

    const req = {
      user: { permissions: '[broken', is_master_admin: true },
      query: { page: '1' }
    };
    const res = createRes();
    const next = jest.fn();

    await listSalesTransactions(req, res, next);

    expect(mockListSalesTransactionsUseCase).toHaveBeenCalledWith({
      query: { page: '1' },
      userPermissions: []
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('exports csv when export=csv is requested', async () => {
    mockListSalesTransactionsUseCase.mockResolvedValue({
      success: true,
      data: {
        transactions: [{ source: 'POS', reference_no: 'INV-000001', occurred_at: '2026-03-27T00:00:00.000Z' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        summary: { gross_sales: 100, cogs: 55, gross_profit: 45 }
      }
    });

    const req = {
      user: { permissions: ['reports:view'], is_master_admin: false },
      query: { export: 'csv' }
    };
    const res = createRes();
    const next = jest.fn();

    await listSalesTransactions(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards source_id handoff query to use-case for cross-page transaction context', async () => {
    mockListSalesTransactionsUseCase.mockResolvedValue({
      success: true,
      data: {
        transactions: [{ source: 'POS', source_id: 99, reference_no: 'INV-000099' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        summary: { gross_sales: 220, cogs: 120, gross_profit: 100 }
      }
    });

    const req = {
      user: { permissions: ['reports:view'], is_master_admin: false },
      query: { source: 'POS', source_id: '99' }
    };
    const res = createRes();
    const next = jest.fn();

    await listSalesTransactions(req, res, next);

    expect(mockListSalesTransactionsUseCase).toHaveBeenCalledWith({
      query: { source: 'POS', source_id: '99' },
      userPermissions: ['reports:view']
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });
});
