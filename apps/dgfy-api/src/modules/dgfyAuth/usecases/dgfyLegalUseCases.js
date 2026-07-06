import { ok } from '../contracts/applicationResult.js';
import { getDgfyLegalTermsPayload } from '../utils/dgfyLegalTerms.js';

export const buildGetDgfyLegalTermsUseCase = () => async () => ok({
    statusCode: 200,
    payload: {
        success: true,
        data: getDgfyLegalTermsPayload()
    }
});
