import { describe, expect, it } from '@jest/globals';
import * as posUseCases from '../src/modules/pos/usecases/posUseCases.js';

describe('POS cashier identity adoption decision', () => {
  it('does not add a tenant-local cashier credential login use case', () => {
    expect(posUseCases.buildLoginPosCashierUseCase).toBeUndefined();
  });
});
