import { buildAdminLoginUseCase } from './usecases/adminLoginUseCase.js';
import { buildAdminLogoutUseCase } from './usecases/adminLogoutUseCase.js';
import { getAdminLockoutConfig } from '../../config/adminAuthConfig.js';
import { createInMemoryAdminLoginLockoutPolicy } from './services/adminLoginLockoutPolicy.js';
import { createRedisAdminLoginLockoutPolicy } from './services/adminLoginLockoutPolicyRedis.js';
import * as authService from '../../services/authService.js';
import { createPlatformAdminRepository } from '../platformAdmin/repositories/platformAdminRepository.js';

const lockoutConfig = getAdminLockoutConfig();
const inMemoryAdminLockoutPolicy = createInMemoryAdminLoginLockoutPolicy(lockoutConfig);
const adminLockoutPolicy = createRedisAdminLoginLockoutPolicy({
  ...lockoutConfig,
  fallbackPolicy: inMemoryAdminLockoutPolicy
});
const platformAdminRepository = createPlatformAdminRepository();

export const adminLoginUseCase = buildAdminLoginUseCase({
  jwtSecretProvider: () => process.env.JWT_SECRET,
  lockoutPolicy: adminLockoutPolicy,
  platformAdminRepository
});

export const adminLogoutUseCase = buildAdminLogoutUseCase({ authService });
