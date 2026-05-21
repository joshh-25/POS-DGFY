import { jest } from '@jest/globals';
import {
  buildProcessMessageUseCase,
  extractTextContentFromMessage
} from '../src/modules/ai/usecases/processMessageUseCase.js';

const createDeps = () => ({
  buildContext: jest.fn().mockResolvedValue({ tenant: 'demo' }),
  getOpenAITools: jest.fn().mockReturnValue([{ type: 'function' }]),
  buildSystemPrompt: jest.fn().mockReturnValue('system prompt'),
  formatContextForMemory: jest.fn().mockReturnValue('Item "Soy Sauce" (ID: 7, SKU: SOY-7)'),
  handleSpecialQueries: jest.fn().mockReturnValue(null),
  createChatCompletion: jest.fn().mockResolvedValue({
    choices: [{ message: { content: 'model response' } }]
  }),
  handleToolCalls: jest.fn().mockResolvedValue({ type: 'text', content: 'tool output' }),
  normalizeAssistantContent: jest.fn((value) => `normalized:${value}`),
  logger: { error: jest.fn() },
  debugLogger: { log: jest.fn() }
});

describe('processMessageUseCase', () => {
  it('extracts text content from string, multimodal array, and wrapper objects', () => {
    expect(extractTextContentFromMessage('hello')).toBe('hello');
    expect(extractTextContentFromMessage([{ type: 'text', text: 'from-array' }])).toBe('from-array');
    expect(extractTextContentFromMessage({ content: 'from-object' })).toBe('from-object');
  });

  it('returns early for special queries without calling the model', async () => {
    const deps = createDeps();
    deps.handleSpecialQueries.mockReturnValue({
      type: 'text',
      content: 'I can help with inventory and forecasting.'
    });

    const useCase = buildProcessMessageUseCase(deps);
    const result = await useCase(
      [{ type: 'text', text: 'What can you do?' }],
      [],
      { user_id: 11, role: 'admin' },
      'conv-special'
    );

    expect(deps.handleSpecialQueries).toHaveBeenCalledWith('What can you do?');
    expect(deps.createChatCompletion).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'text',
      content: 'I can help with inventory and forecasting.',
      specialQuery: true,
      conversationId: 'conv-special'
    });
  });

  it('builds chat payload with assistant tool context and returns normalized text', async () => {
    const deps = createDeps();
    const useCase = buildProcessMessageUseCase(deps);

    const result = await useCase(
      'Show me last query context',
      [
        {
          role: 'assistant',
          content: 'Here is your previous answer',
          context: { items: [{ id: 7 }] }
        }
      ],
      { user_id: 12, role: 'admin' },
      'conv-context'
    );

    expect(deps.createChatCompletion).toHaveBeenCalledWith({
      messages: [
        { role: 'system', content: 'system prompt' },
        {
          role: 'assistant',
          content: 'Here is your previous answer\n\n[Context from tools: Item "Soy Sauce" (ID: 7, SKU: SOY-7)]'
        },
        { role: 'user', content: 'Show me last query context' }
      ],
      tools: [{ type: 'function' }],
      user: { user_id: 12, role: 'admin' }
    });
    expect(result).toEqual({
      type: 'text',
      content: 'normalized:model response',
      conversationId: 'conv-context'
    });
  });

  it('delegates to tool-call handler when model emits tool calls', async () => {
    const deps = createDeps();
    deps.createChatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            tool_calls: [
              {
                id: 'call-1',
                function: {
                  name: 'get_items',
                  arguments: '{"search":"soy"}'
                }
              }
            ]
          }
        }
      ]
    });
    deps.handleToolCalls.mockResolvedValue({
      type: 'text',
      content: 'tool chained',
      conversationId: 'conv-tools'
    });

    const useCase = buildProcessMessageUseCase(deps);
    const result = await useCase(
      'Find soy',
      [],
      { user_id: 13, role: 'manager' },
      'conv-tools'
    );

    expect(deps.handleToolCalls).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_calls: expect.any(Array)
      }),
      expect.any(Array),
      { user_id: 13, role: 'manager' },
      'conv-tools',
      { tenant: 'demo' },
      [{ type: 'function' }],
      [],
      0,
      []
    );
    expect(result).toEqual({
      type: 'text',
      content: 'tool chained',
      conversationId: 'conv-tools'
    });
  });

  it('maps OpenAI quota failures to stable user-facing error payload', async () => {
    const deps = createDeps();
    const quotaError = new Error('quota');
    quotaError.code = 'insufficient_quota';
    deps.createChatCompletion.mockRejectedValue(quotaError);

    const useCase = buildProcessMessageUseCase(deps);
    const result = await useCase(
      'hello',
      [],
      { user_id: 14, role: 'admin' },
      'conv-quota'
    );

    expect(deps.logger.error).toHaveBeenCalledWith('AI processing error:', quotaError);
    expect(result).toEqual({
      type: 'error',
      content: 'The AI service is temporarily unavailable due to quota limits. Please try again later or contact support.',
      conversationId: 'conv-quota'
    });
  });
});
