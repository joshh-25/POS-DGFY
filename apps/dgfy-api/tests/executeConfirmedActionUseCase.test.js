import { jest } from '@jest/globals';
import { buildExecuteConfirmedActionUseCase } from '../src/modules/ai/usecases/executeConfirmedActionUseCase.js';

describe('executeConfirmedActionUseCase', () => {
  const baseLogger = {
    error: jest.fn(),
    warn: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks execution when role permission is missing', async () => {
    const executeTool = jest.fn();

    const useCase = buildExecuteConfirmedActionUseCase({
      getToolByName: jest.fn().mockReturnValue({
        requiredRole: 'admin'
      }),
      hasPermission: jest.fn().mockReturnValue(false),
      getPermissionError: (action, role) => `Permission denied: ${action} requires ${role}`,
      hasGranularPermission: jest.fn().mockReturnValue(true),
      getGranularPermissionError: (action, perm) => `Permission denied: ${action} requires ${perm}`,
      executeTool,
      logger: baseLogger
    });

    const user = { user_id: 100, role: 'staff' };
    const pendingAction = {
      user_id: 100,
      toolName: 'delete_item',
      args: { item_id: 55 },
      expires_at: new Date(Date.now() + 60_000).toISOString()
    };

    const result = await useCase('act-1', pendingAction, user);

    expect(result.type).toBe('error');
    expect(result.message).toContain('Permission denied');
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('executes tool and returns structured success payload', async () => {
    const executeTool = jest.fn().mockResolvedValue({
      message: 'created',
      item: {
        name: 'Sugar',
        fifo_enabled: true,
        unit_of_measure: 'kg',
        sku_code: 'SUG-001',
        category: 'raw_material'
      }
    });

    const useCase = buildExecuteConfirmedActionUseCase({
      getToolByName: jest.fn().mockReturnValue({}),
      hasPermission: jest.fn().mockReturnValue(true),
      getPermissionError: (action, role) => `Permission denied: ${action} requires ${role}`,
      hasGranularPermission: jest.fn().mockReturnValue(true),
      getGranularPermissionError: (action, perm) => `Permission denied: ${action} requires ${perm}`,
      executeTool,
      logger: baseLogger
    });

    const user = { user_id: 200, role: 'admin' };
    const pendingAction = {
      user_id: 200,
      toolName: 'create_item',
      args: { max_capacity: 120 },
      expires_at: new Date(Date.now() + 60_000).toISOString()
    };

    const result = await useCase('act-2', pendingAction, user);

    expect(result.type).toBe('success');
    expect(result.result.summary).toBe('Item "Sugar" created');
    expect(result.message).toContain('Action completed successfully');
    expect(result.result.impact['Max Capacity']).toBe('120 kg');
    expect(executeTool).toHaveBeenCalledWith('create_item', pendingAction.args, user);
  });

  it('supports custom formatter and custom message builders', async () => {
    const executeTool = jest.fn().mockResolvedValue({ raw: true });
    const customFormatter = jest.fn().mockReturnValue({
      success: true,
      summary: 'Custom summary',
      details: { custom: true },
      impact: {},
      related_entity: null
    });

    const useCase = buildExecuteConfirmedActionUseCase({
      getToolByName: jest.fn().mockReturnValue({}),
      hasPermission: jest.fn().mockReturnValue(true),
      getPermissionError: (action, role) => `Permission denied: ${action} requires ${role}`,
      hasGranularPermission: jest.fn().mockReturnValue(true),
      getGranularPermissionError: (action, perm) => `Permission denied: ${action} requires ${perm}`,
      executeTool,
      logger: baseLogger,
      formatResultForUI: customFormatter,
      buildSuccessMessage: ({ pendingAction }) => `ok:${pendingAction.toolName}`,
      buildErrorMessage: ({ error }) => `err:${error.message}`
    });

    const user = { user_id: 300, role: 'admin' };
    const pendingAction = {
      user_id: 300,
      toolName: 'update_item',
      args: { item_id: 12, name: 'Salt' },
      expires_at: new Date(Date.now() + 60_000).toISOString()
    };

    const success = await useCase('act-3', pendingAction, user);
    expect(success.message).toBe('ok:update_item');
    expect(success.result.summary).toBe('Custom summary');
    expect(customFormatter).toHaveBeenCalledWith('update_item', pendingAction.args, { raw: true });

    const failingUseCase = buildExecuteConfirmedActionUseCase({
      getToolByName: jest.fn().mockReturnValue({}),
      hasPermission: jest.fn().mockReturnValue(true),
      getPermissionError: (action, role) => `Permission denied: ${action} requires ${role}`,
      hasGranularPermission: jest.fn().mockReturnValue(true),
      getGranularPermissionError: (action, perm) => `Permission denied: ${action} requires ${perm}`,
      executeTool: jest.fn().mockRejectedValue(new Error('boom')),
      logger: baseLogger,
      buildErrorMessage: ({ error }) => `err:${error.message}`
    });

    const failure = await failingUseCase('act-4', pendingAction, user);
    expect(failure.type).toBe('error');
    expect(failure.message).toBe('err:boom');
  });
});
