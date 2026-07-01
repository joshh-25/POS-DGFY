import { describe, expect, it } from '@jest/globals';
import * as posUseCases from '../src/modules/pos/usecases/posUseCases.js';

describe('POS cashier setup adoption decision', () => {
  it('does not add createLocalCashier-backed setup use cases', () => {
    expect(posUseCases.buildCreatePosSetupCashierUseCase).toBeUndefined();
    expect(posUseCases.buildListPosSetupCashiersUseCase).toBeUndefined();
  });
});
