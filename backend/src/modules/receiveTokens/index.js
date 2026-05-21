import * as receiveTokenService from '../../services/receiveTokenService.js';
import {
  buildGenerateTokenUseCase,
  buildValidateTokenUseCase,
  buildReceiveViaTokenUseCase,
  buildMarkTokenUsedUseCase
} from './usecases/receiveTokenUseCases.js';

export const generateTokenUseCase = buildGenerateTokenUseCase({ receiveTokenService });
export const validateTokenUseCase = buildValidateTokenUseCase({ receiveTokenService });
export const receiveViaTokenUseCase = buildReceiveViaTokenUseCase({ receiveTokenService });
export const markTokenUsedUseCase = buildMarkTokenUsedUseCase({ receiveTokenService });
