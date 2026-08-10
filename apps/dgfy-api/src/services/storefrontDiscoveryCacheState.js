let cacheVersion = 0;

export const getStorefrontDiscoveryCacheVersion = () => cacheVersion;

export const bumpStorefrontDiscoveryCacheVersion = () => {
    cacheVersion += 1;
    return cacheVersion;
};
