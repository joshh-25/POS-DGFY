import { jest } from '@jest/globals';
import { buildGenerateAlertsUseCase } from '../src/modules/alerts/usecases/generateAlertsUseCase.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('alerts use-cases application result contract', () => {
  it('wraps alert service result in success envelope', async () => {
    const useCase = buildGenerateAlertsUseCase({
      alertService: {
        generateAlerts: jest.fn().mockResolvedValue([{ type: 'LOW_STOCK' }])
      }
    });

    const result = await useCase();
    expect(result).toEqual({
      success: true,
      data: [{ type: 'LOW_STOCK' }],
      error: null,
      message: null
    });
  });

  it('maps alert service failures to domain error contract', async () => {
    const useCase = buildGenerateAlertsUseCase({
      alertService: {
        generateAlerts: jest.fn().mockRejectedValue(new Error('Alerts unavailable'))
      }
    });

    const result = await useCase();
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.INTERNAL_ERROR);
    expect(result.error.message).toBe('Alerts unavailable');
  });
});
