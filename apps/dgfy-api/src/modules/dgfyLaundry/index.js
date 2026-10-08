import { dgfyLaundryRepository } from './repositories/dgfyLaundryRepository.js';
import { buildDgfyLaundryProviderUseCases } from './usecases/dgfyLaundryProviderUseCases.js';
import { buildDglaundryRuntimeAttestationUseCase } from './usecases/dglaundryRuntimeAttestationUseCase.js';
import { resolveRuntimeShaInfo } from '../../services/healthService.js';
import { getRedisClient, isRedisConnected } from '../../config/redis.js';
import { isRedisConfigured } from '../../config/hostingProfile.js';
import { listVerificationKeys } from './services/oidcSigningKeyRegistry.js';
import { isDglaundryParPkceConfigured } from './services/dgfyLaundryOidcProvider.js';
import { signDgfyJsonDocument } from '../dgfyLaundryOrders/services/dglaundryEventSignature.js';

export const dgfyLaundryProviderUseCases = buildDgfyLaundryProviderUseCases({
  repository: dgfyLaundryRepository,
  runtimeAttestation: buildDglaundryRuntimeAttestationUseCase({
    repository: dgfyLaundryRepository,
    resolveRuntimeShaInfoFn: resolveRuntimeShaInfo,
    listVerificationKeysFn: listVerificationKeys,
    redisConfiguredFn: isRedisConfigured,
    redisConnectedFn: isRedisConnected,
    redisClientFn: getRedisClient,
    parPkceConfiguredFn: isDglaundryParPkceConfigured,
    signDocumentFn: signDgfyJsonDocument
  })
});
export { dgfyLaundryRepository };
