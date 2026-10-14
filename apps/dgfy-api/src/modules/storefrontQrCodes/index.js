import { storefrontQrCodeRepository } from './repositories/storefrontQrCodeRepository.js';
import {
    buildCreateStorefrontQrCodeUseCase,
    buildDeactivateStorefrontQrCodeUseCase,
    buildListStorefrontQrCodesUseCase,
    buildResolvePublicStorefrontQrCodeUseCase,
    buildUpdateStorefrontQrCodeUseCase
} from './usecases/storefrontQrCodeUseCases.js';

export { storefrontQrCodeRepository };

export const listStorefrontQrCodesUseCase = buildListStorefrontQrCodesUseCase({ repository: storefrontQrCodeRepository });
export const createStorefrontQrCodeUseCase = buildCreateStorefrontQrCodeUseCase({ repository: storefrontQrCodeRepository });
export const updateStorefrontQrCodeUseCase = buildUpdateStorefrontQrCodeUseCase({ repository: storefrontQrCodeRepository });
export const deactivateStorefrontQrCodeUseCase = buildDeactivateStorefrontQrCodeUseCase({ repository: storefrontQrCodeRepository });
export const resolvePublicStorefrontQrCodeUseCase = buildResolvePublicStorefrontQrCodeUseCase({ repository: storefrontQrCodeRepository });
