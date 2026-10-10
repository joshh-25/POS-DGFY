// @compat-seam id=oidc-dglaundry-old-path-reexports
import { configurePartnerIdentityProvider } from '../../partnerIdentity/services/oidcProvider.js';
import { dglaundryLegacyClientSource, dglaundryContextAdapter, dglaundryBrowserClientId, dglaundryMachineClientId, isDglaundryParPkceConfigured } from '../../partnerIdentity/adapters/dglaundryOidcAdapter.js';

configurePartnerIdentityProvider({
  legacyClientSource: dglaundryLegacyClientSource,
  contextAdapters: { dglaundry: dglaundryContextAdapter },
  dglaundryBrowserClientId: dglaundryBrowserClientId(),
  dglaundryMachineClientId: dglaundryMachineClientId()
});

export { isDglaundryParPkceConfigured };
export * from '../../partnerIdentity/services/oidcProvider.js';
