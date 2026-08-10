import { ok } from '../../shared/contracts/applicationResult.js';
import { getDgfyLegalTermsPayload } from '../../shared/utils/dgfyLegalTerms.js';

export const buildGetDgfyLegalTermsUseCase = () => async () => ok({
    statusCode: 200,
    payload: {
        success: true,
        data: getDgfyLegalTermsPayload()
    }
});

