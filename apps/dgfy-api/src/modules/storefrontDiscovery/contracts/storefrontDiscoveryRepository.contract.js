const REQUIRED_METHODS = Object.freeze([
    'listDiscovery',
    'getStorefrontBySlug'
]);

export const assertStorefrontDiscoveryRepositoryContract = (repository) => {
    if (!repository || typeof repository !== 'object') {
        throw new Error('storefrontDiscoveryRepository must be an object');
    }

    const missingMethods = REQUIRED_METHODS.filter((methodName) => typeof repository[methodName] !== 'function');
    if (missingMethods.length > 0) {
        throw new Error(`storefrontDiscoveryRepository missing required methods: ${missingMethods.join(', ')}`);
    }
};

export const STOREFRONT_DISCOVERY_REPOSITORY_METHODS = REQUIRED_METHODS;
