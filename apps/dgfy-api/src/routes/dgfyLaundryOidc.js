import express from 'express';
import { authenticateDgfyAccount } from '../middleware/dgfyAuth.js';
import { oidcLimiter } from '../middleware/rateLimiter.js';
import { dgfyLaundryProviderUseCases } from '../modules/dgfyLaundry/index.js';
import {
    oidcDiscovery,
    oidcJwks,
    oidcPar,
    buildOidcAuthorizeHandler,
    oidcToken,
    oidcRevoke,
    oidcIntrospect,
    oidcLogout
} from '../modules/dgfyLaundry/services/dgfyLaundryOidcProvider.js';

const router = express.Router();
router.use(oidcLimiter);
router.get('/.well-known/openid-configuration', oidcDiscovery);
router.get('/jwks', oidcJwks);
router.post('/par', oidcPar);
router.get('/authorize', authenticateDgfyAccount, buildOidcAuthorizeHandler({ chooseCompany: dgfyLaundryProviderUseCases.chooseCompany }));
router.post('/token', oidcToken);
router.post('/revoke', oidcRevoke);
router.post('/introspect', oidcIntrospect);
router.get('/logout', oidcLogout);

export default router;
