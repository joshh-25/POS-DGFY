import { storefrontDomainRepository } from './repositories/storefrontDomainRepository.js';
import { createVerificationToken, verifyStorefrontDns } from './services/dnsVerificationService.js';
import { clearStorefrontDomainResolverCache } from './services/storefrontDomainResolver.js';
import { storefrontDomainFeaturePolicy } from './services/storefrontDomainFeaturePolicy.js';
import { buildStorefrontDomainOperationUseCases } from './usecases/storefrontDomainOperationUseCases.js';
import { buildStorefrontDomainUseCases } from './usecases/storefrontDomainUseCases.js';

export const storefrontDomainUseCases = buildStorefrontDomainUseCases({
    repository: storefrontDomainRepository,
    dnsVerifier: verifyStorefrontDns,
    tokenFactory: createVerificationToken,
    clearResolverCache: clearStorefrontDomainResolverCache,
    featurePolicy: storefrontDomainFeaturePolicy
});

export const storefrontDomainOperationUseCases = buildStorefrontDomainOperationUseCases({
    repository: storefrontDomainRepository,
    clearResolverCache: clearStorefrontDomainResolverCache
});

export { resolveActiveStorefrontDomain, clearStorefrontDomainResolverCache } from './services/storefrontDomainResolver.js';
export { normalizeStorefrontHostname, readRequestHostname } from './utils/hostnamePolicy.js';
