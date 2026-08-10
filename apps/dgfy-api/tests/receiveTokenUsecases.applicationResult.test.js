import { jest } from '@jest/globals';
import {
  buildGenerateTokenUseCase,
  buildValidateTokenUseCase,
  buildReceiveViaTokenUseCase,
  buildMarkTokenUsedUseCase
} from '../src/modules/receiveTokens/usecases/receiveTokenUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('receive token use-cases application result contract', () => {
  it('validates orderType for generateToken', async () => {
    const useCase = buildGenerateTokenUseCase({
      receiveTokenService: { generateToken: jest.fn() }
    });

    const result = await useCase({ orderType: 'INVALID', orderId: 12, userId: 7 });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('maps invalid token service errors to AUTHENTICATION_FAILED', async () => {
    const authError = new Error('Invalid or expired token');
    authError.statusCode = 401;
    const useCase = buildValidateTokenUseCase({
      receiveTokenService: { validateToken: jest.fn().mockRejectedValue(authError) }
    });

    const result = await useCase({ token: 'bad-token' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.AUTHENTICATION_FAILED);
    expect(result.error.statusCode).toBe(401);
  });

  it('receiveViaToken wraps service result in success envelope', async () => {
    const receiveViaToken = jest.fn().mockResolvedValue({ po_id: 45, status: 'received' });
    const useCase = buildReceiveViaTokenUseCase({
      receiveTokenService: { receiveViaToken }
    });

    const payload = { line_items: [{ line_item_id: 3, quantity_received: 5 }] };
    const result = await useCase({ token: 'token-123', payload, userId: 11 });

    expect(receiveViaToken).toHaveBeenCalledWith('token-123', payload, 11);
    expect(result).toEqual({
      success: true,
      data: { po_id: 45, status: 'received' },
      error: null,
      message: null
    });
  });

  it('receiveViaToken maps missing location field errors to VALIDATION_FAILED (422)', async () => {
    const validationError = new Error('location_id is required to receive PO via QR');
    validationError.statusCode = 422;
    const useCase = buildReceiveViaTokenUseCase({
      receiveTokenService: { receiveViaToken: jest.fn().mockRejectedValue(validationError) }
    });

    const result = await useCase({
      token: 'token-123',
      payload: { line_items: [{ line_item_id: 3, quantity_received: 5 }] },
      userId: 11
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(422);
    expect(result.error.message).toBe('location_id is required to receive PO via QR');
  });

  it('receiveViaToken maps location permission errors to AUTHORIZATION_FAILED (403)', async () => {
    const authorizationError = new Error('You do not have location access to perform QR receive at location 2.');
    authorizationError.statusCode = 403;
    const useCase = buildReceiveViaTokenUseCase({
      receiveTokenService: { receiveViaToken: jest.fn().mockRejectedValue(authorizationError) }
    });

    const result = await useCase({
      token: 'token-123',
      payload: { source_location_id: 2, destination_location_id: 3, quantity_produced: 5 },
      userId: 11
    });

    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.AUTHORIZATION_FAILED);
    expect(result.error.statusCode).toBe(403);
    expect(result.error.message).toBe('You do not have location access to perform QR receive at location 2.');
  });

  it('markTokenUsed validates tokenId and normalizes userId', async () => {
    const markTokenUsed = jest.fn().mockResolvedValue(undefined);
    const useCase = buildMarkTokenUsedUseCase({
      receiveTokenService: { markTokenUsed }
    });

    const successResult = await useCase({ tokenId: '19', userId: '4' });
    expect(markTokenUsed).toHaveBeenCalledWith(19, 4);
    expect(successResult.success).toBe(true);

    const validationResult = await useCase({ tokenId: 'bad', userId: 4 });
    expect(validationResult.success).toBe(false);
    expect(validationResult.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
  });
});
