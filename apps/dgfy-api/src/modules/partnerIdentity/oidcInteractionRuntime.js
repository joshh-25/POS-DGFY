import { verifyToken, isTokenBlacklisted } from '../../services/authService.js';
import { dgfyAccountRepository } from '../dgfy/repositories/dgfyAccountRepository.js';
import { dgfyLaundryRepository } from '../dgfyLaundry/repositories/dgfyLaundryRepository.js';
import {
  buildOidcAuthorizationCodeGrant,
  consumePushedAuthorizationRequest,
  OIDC_AUTHORIZATION_CODE_TTL_SECONDS,
  oidcKey,
  resolveOidcClient
} from './services/oidcProvider.js';
import { dglaundryBrowserClientId } from './adapters/dglaundryOidcAdapter.js';
import { createOidcInteractionRepository } from './repositories/oidcInteractionRepository.js';
import { buildOidcInteractionUseCases } from './usecases/oidcInteractionUseCases.js';

export const oidcInteractionRepository = createOidcInteractionRepository();

export const oidcInteractionUseCases = buildOidcInteractionUseCases({
  repository: oidcInteractionRepository,
  consumePar: consumePushedAuthorizationRequest,
  resolveClient: resolveOidcClient,
  listLaundryCompanies: ({ dgfyAccountId }) => dgfyLaundryRepository.listLaundryCompanies({ dgfyAccountId }),
  findAccountById: (id) => dgfyAccountRepository.findById(id),
  verifyDgfyToken: verifyToken,
  isTokenBlacklisted,
  buildAuthorizationCodeGrant: buildOidcAuthorizationCodeGrant,
  authorizationCodeKey: (clientId, code) => oidcKey(clientId, 'code', code),
  dglaundryClientId: dglaundryBrowserClientId(),
  codeTtlMs: OIDC_AUTHORIZATION_CODE_TTL_SECONDS * 1000
});
