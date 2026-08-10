import { buildHandleSpecialQueriesUseCase } from '../src/modules/ai/usecases/handleSpecialQueriesUseCase.js';

describe('handleSpecialQueriesUseCase', () => {
  const getCapabilitiesExplanation = () => 'CAPABILITIES_TEXT';
  const getLimitationsExplanation = () => 'LIMITATIONS_TEXT';

  const useCase = buildHandleSpecialQueriesUseCase({
    getCapabilitiesExplanation,
    getLimitationsExplanation
  });

  it('returns capabilities response for capability queries', () => {
    const result = useCase('What can you do in this app?');
    expect(result).toEqual({
      type: 'text',
      content: 'CAPABILITIES_TEXT'
    });
  });

  it('returns limitations response for limitations queries', () => {
    const result = useCase("What can't you do?");
    expect(result).toEqual({
      type: 'text',
      content: 'LIMITATIONS_TEXT'
    });
  });

  it('returns null for regular non-special prompts', () => {
    const result = useCase('Show me low stock soy sauce');
    expect(result).toBeNull();
  });
});
