import express from 'express';
import { authenticateDgfyAccount } from '../middleware/dgfyAuth.js';
import { oidcLimiter } from '../middleware/rateLimiter.js';
import { logoutDgfyAccount } from '../modules/dgfy/controllers/dgfyAuthHandlers.js';
import { dgfyLaundryProviderUseCases } from '../modules/dgfyLaundry/index.js';
import {
    oidcDiscovery,
    oidcJwks,
    oidcPar,
    buildOidcAuthorizeHandler,
    oidcToken,
    oidcRevoke,
    oidcIntrospect,
    oidcEndSession,
    oidcLogout
} from '../modules/dgfyLaundry/services/dgfyLaundryOidcProvider.js';

const router = express.Router();
router.use(oidcLimiter);
router.get('/.well-known/openid-configuration', oidcDiscovery);
router.get('/jwks', oidcJwks);
router.post('/par', oidcPar);
router.get('/authorize', authenticateDgfyAccount, buildOidcAuthorizeHandler({ chooseCompany: dgfyLaundryProviderUseCases.chooseCompany }));
router.get('/logout', authenticateDgfyAccount, oidcEndSession, oidcLogout, logoutDgfyAccount);
router.post('/token', oidcToken);
router.post('/revoke', oidcRevoke);
router.post('/introspect', oidcIntrospect);

export default router;
