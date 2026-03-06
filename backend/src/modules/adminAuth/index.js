import { buildAdminLoginUseCase } from './usecases/adminLoginUseCase.js';

export const adminLoginUseCase = buildAdminLoginUseCase({
  jwtSecretProvider: () => process.env.JWT_SECRET
});
