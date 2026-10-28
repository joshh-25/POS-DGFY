import express from 'express';
import { authenticateDgfyAccount } from '../middleware/dgfyAuth.js';
import { oidcLimiter } from '../middleware/rateLimiter.js';
import { prefersHtmlNavigation } from '../modules/partnerIdentity/domain/oidcInteractionPolicy.js';
import { createOidcInteractionHandlers } from '../modules/partnerIdentity/controllers/oidcInteractionHandlers.js';
import { oidcInteractionUseCases } from '../modules/partnerIdentity/oidcInteractionRuntime.js';
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
const authorizeHandler = buildOidcAuthorizeHandler();
const interactionHandlers = createOidcInteractionHandlers({ interactionUseCases: oidcInteractionUseCases });
router.get('/.well-known/openid-configuration', oidcDiscovery);
router.get('/jwks', oidcJwks);
router.post('/par', oidcPar);
router.get('/authorize', (req, res, next) => {
  if (prefersHtmlNavigation(req.headers.accept)) return interactionHandlers.authorizeBrowser(req, res, next);
  return authenticateDgfyAccount(req, res, () => authorizeHandler(req, res, next));
});
router.get('/complete', interactionHandlers.getCompletionBridge);
router.post('/complete', interactionHandlers.postCompletionBridge);
router.get('/logout', authenticateDgfyAccount, oidcEndSession, oidcLogout, logoutDgfyAccount);
router.post('/token', oidcToken);
router.post('/revoke', oidcRevoke);
router.post('/introspect', oidcIntrospect);

export default router;
