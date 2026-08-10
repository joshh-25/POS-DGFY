import { buildGenerateConfirmationUseCase } from '../src/modules/ai/usecases/generateConfirmationUseCase.js';

describe('generateConfirmationUseCase', () => {
  it('builds deterministic confirmation payload for write actions', async () => {
    const useCase = buildGenerateConfirmationUseCase({
      generateId: () => 'act-fixed',
      nowProvider: () => new Date('2026-03-05T00:00:00.000Z')
    });

    const result = await useCase(
      'create_purchase_order',
      {
        supplier_id: 9,
        supplier_name: 'Kitchen Source',
        items: [
          { quantity: 2, unit_price: 10 },
          { quantity: 5, unit_price: 4 }
        ],
        expected_delivery_date: '2026-03-07'
      },
      { user_id: 44 },
      'conv-55'
    );

    expect(result).toEqual({
      action_id: 'act-fixed',
      toolName: 'create_purchase_order',
      args: {
        supplier_id: 9,
        supplier_name: 'Kitchen Source',
        items: [
          { quantity: 2, unit_price: 10 },
          { quantity: 5, unit_price: 4 }
        ],
        expected_delivery_date: '2026-03-07'
      },
      description: 'Create Purchase Order for Kitchen Source',
      details: {
        supplier_id: 9,
        supplier_name: 'Kitchen Source',
        items: [
          { quantity: 2, unit_price: 10 },
          { quantity: 5, unit_price: 4 }
        ],
        item_count: 2,
        total_amount: 40,
        expected_delivery: '2026-03-07'
      },
      user_id: 44,
      conversation_id: 'conv-55',
      created_at: '2026-03-05T00:00:00.000Z',
      expires_at: '2026-03-05T00:05:00.000Z'
    });
  });

  it('falls back to generic description for unknown tools', async () => {
    const useCase = buildGenerateConfirmationUseCase({
      generateId: () => 'act-generic',
      nowProvider: () => new Date('2026-03-05T00:00:00.000Z')
    });

    const result = await useCase(
      'custom_tool',
      { alpha: 1 },
      { user_id: 22 },
      'conv-99'
    );

    expect(result.description).toBe('Execute custom tool');
    expect(result.details).toEqual({ alpha: 1 });
  });
});
