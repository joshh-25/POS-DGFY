import { buildAdminLoginUseCase } from './usecases/adminLoginUseCase.js';
import { buildAdminLogoutUseCase } from './usecases/adminLogoutUseCase.js';
import { getAdminLockoutConfig } from '../../config/adminAuthConfig.js';
import { createInMemoryAdminLoginLockoutPolicy } from './services/adminLoginLockoutPolicy.js';
import { createRedisAdminLoginLockoutPolicy } from './services/adminLoginLockoutPolicyRedis.js';
import * as authService from '../../services/authService.js';

const lockoutConfig = getAdminLockoutConfig();
const inMemoryAdminLockoutPolicy = createInMemoryAdminLoginLockoutPolicy(lockoutConfig);
const adminLockoutPolicy = createRedisAdminLoginLockoutPolicy({
  ...lockoutConfig,
  fallbackPolicy: inMemoryAdminLockoutPolicy
});

export const adminLoginUseCase = buildAdminLoginUseCase({
  jwtSecretProvider: () => process.env.JWT_SECRET,
  lockoutPolicy: adminLockoutPolicy
});

export const adminLogoutUseCase = buildAdminLogoutUseCase({ authService });
