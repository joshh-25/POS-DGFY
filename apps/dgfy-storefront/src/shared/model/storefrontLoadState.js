export const buildStorefrontLoadFailureState = ({
  profile = null,
  profileLocations = [],
  errorMessage = ''
} = {}) => {
  const profileWasLoaded = Boolean(profile?.slug);

  return {
    selectedStore: profileWasLoaded ? profile : null,
    storeLocations: profileWasLoaded && Array.isArray(profileLocations) ? profileLocations : [],
    catalog: [],
    catalogError: String(errorMessage || '')
  };
};
