import { jest } from '@jest/globals';
import {
  buildHandleToolCallsUseCase,
  formatContextForMemory
} from '../src/modules/ai/usecases/handleToolCallsUseCase.js';

const createBaseDeps = () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn()
  },
  getToolByName: jest.fn().mockReturnValue({}),
  hasPermission: jest.fn().mockReturnValue(true),
  getPermissionError: jest.fn().mockReturnValue('Role is not allowed'),
  hasGranularPermission: jest.fn().mockReturnValue(true),
  getGranularPermissionError: jest.fn().mockReturnValue('Permission is not allowed'),
  toolRequiresConfirmation: jest.fn().mockReturnValue(false),
  generateConfirmation: jest.fn(),
  executeTool: jest.fn(),
  generateDestructiveWarning: jest.fn(),
  createToolAwareCompletion: jest.fn(),
  normalizeAssistantContent: jest.fn((value) => value)
});

describe('handleToolCallsUseCase', () => {
  it('returns confirmation payload when a tool requires confirmation', async () => {
    const deps = createBaseDeps();
    deps.toolRequiresConfirmation.mockImplementation((toolName) => toolName === 'delete_item');
    deps.generateConfirmation.mockResolvedValue({
      action_id: 'act-1',
      toolName: 'delete_item',
      description: 'Delete item ID 1',
      details: { item_id: 1 }
    });
    deps.generateDestructiveWarning.mockResolvedValue('This cannot be undone.');

    const useCase = buildHandleToolCallsUseCase(deps);
    const result = await useCase(
      {
        tool_calls: [
          {
            id: 'call-1',
            function: {
              name: 'delete_item',
              arguments: '{"item_id":1}'
            }
          }
        ]
      },
      [{ role: 'system', content: 'system prompt' }],
      { user_id: 10, role: 'admin' },
      'conv-1',
      {}
    );

    expect(result).toEqual({
      type: 'confirmation_required',
      action_id: 'act-1',
      action_type: 'delete_item',
      description: 'Delete item ID 1',
      details: { item_id: 1 },
      expires_in: 300,
      conversationId: 'conv-1',
      ai_message: 'This cannot be undone.'
    });
    expect(deps.executeTool).not.toHaveBeenCalled();
    expect(deps.createToolAwareCompletion).not.toHaveBeenCalled();
  });

  it('returns a permission denied response when role check fails', async () => {
    const deps = createBaseDeps();
    deps.getToolByName.mockReturnValue({ requiredRole: 'admin' });
    deps.hasPermission.mockReturnValue(false);
    deps.getPermissionError.mockReturnValue('delete item requires admin role');

    const useCase = buildHandleToolCallsUseCase(deps);
    const result = await useCase(
      {
        tool_calls: [
          {
            id: 'call-1',
            function: {
              name: 'delete_item',
              arguments: '{"item_id":1}'
            }
          }
        ]
      },
      [],
      { user_id: 12, role: 'staff' },
      'conv-2',
      {}
    );

    expect(result).toEqual({
      type: 'text',
      content: 'Permission denied: delete item requires admin role',
      conversationId: 'conv-2'
    });
    expect(deps.executeTool).not.toHaveBeenCalled();
  });

  it('executes read-only tool flow and returns normalized response with tool context', async () => {
    const deps = createBaseDeps();
    deps.executeTool.mockResolvedValue({
      items: [
        {
          id: 77,
          sku_code: 'SOY-77',
          name: 'Soy Sauce',
          category: 'Condiment'
        }
      ]
    });
    deps.createToolAwareCompletion.mockResolvedValue({
      content: 'Inventory retrieved successfully.'
    });
    deps.normalizeAssistantContent.mockImplementation((value) => `normalized:${value}`);

    const useCase = buildHandleToolCallsUseCase(deps);
    const result = await useCase(
      {
        tool_calls: [
          {
            id: 'call-1',
            function: {
              name: 'get_items',
              arguments: '{"search":"soy"}'
            }
          }
        ]
      },
      [{ role: 'user', content: 'Show me soy items' }],
      { user_id: 13, role: 'admin' },
      'conv-3',
      {}
    );

    expect(result).toEqual({
      type: 'text',
      content: 'normalized:Inventory retrieved successfully.',
      conversationId: 'conv-3',
      toolsExecuted: ['get_items'],
      toolContext: {
        items: [
          {
            id: 77,
            sku_code: 'SOY-77',
            name: 'Soy Sauce',
            category: 'Condiment'
          }
        ]
      }
    });
    expect(deps.createToolAwareCompletion).toHaveBeenCalledTimes(1);
  });

  it('formats tool context into memory-safe summary text', () => {
    const summary = formatContextForMemory({
      items: [
        {
          id: 5,
          sku_code: 'SKU-5',
          name: 'Pepper',
          suppliers: [
            {
              supplier_id: 2,
              name: 'Spice House',
              price_per_unit: 3.5,
              moq: 10
            }
          ]
        }
      ],
      suppliers: [
        {
          id: 2,
          name: 'Spice House',
          price_per_unit: 3.5,
          moq: 10
        }
      ]
    });

    expect(summary).toContain('Item "Pepper" (ID: 5, SKU: SKU-5)');
    expect(summary).toContain('"Spice House" (ID: 2)');
  });
});
