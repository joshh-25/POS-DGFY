import express from 'express';
import { authenticateDgfyAccount } from '../middleware/dgfyAuth.js';
import { oidcLimiter } from '../middleware/rateLimiter.js';
import { logoutDgfyAccount } from '../modules/dgfy/controllers/dgfyAuthHandlers.js';
import { configurePartnerIdentityProvider } from '../modules/partnerIdentity/services/oidcProvider.js';
import { dglaundryLegacyClientSource, dglaundryContextAdapter, dglaundryBrowserClientId, dglaundryMachineClientId } from '../modules/partnerIdentity/adapters/dglaundryOidcAdapter.js';
import { oidcDiscovery, oidcJwks, oidcPar, buildOidcAuthorizeHandler, oidcToken, oidcRevoke, oidcIntrospect, oidcEndSession, oidcLogout } from '../modules/partnerIdentity/services/oidcProvider.js';

configurePartnerIdentityProvider({
  legacyClientSource: dglaundryLegacyClientSource,
  contextAdapters: { dglaundry: dglaundryContextAdapter },
  dglaundryBrowserClientId: dglaundryBrowserClientId(),
  dglaundryMachineClientId: dglaundryMachineClientId()
});

const router = express.Router();
router.use(oidcLimiter);
router.get('/.well-known/openid-configuration', oidcDiscovery);
router.get('/jwks', oidcJwks);
router.post('/par', oidcPar);
router.get('/authorize', authenticateDgfyAccount, buildOidcAuthorizeHandler());
router.get('/logout', authenticateDgfyAccount, oidcEndSession, oidcLogout, logoutDgfyAccount);
router.post('/token', oidcToken);
router.post('/revoke', oidcRevoke);
router.post('/introspect', oidcIntrospect);

export default router;
