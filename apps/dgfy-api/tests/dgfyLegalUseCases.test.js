import { buildGetDgfyLegalTermsUseCase } from '../src/modules/dgfy/usecases/dgfyLegalUseCases.js';
import { DGFY_LEGAL_TERM_VERSIONS } from '../src/modules/shared/utils/dgfyLegalTerms.js';

describe('dgfyLegalUseCases', () => {
    it('returns backend-owned current legal terms metadata for registration flows', async () => {
        const useCase = buildGetDgfyLegalTermsUseCase();

        const result = await useCase();

        expect(result.success).toBe(true);
        expect(result.data.statusCode).toBe(200);
        expect(result.data.payload.data.versions).toEqual(DGFY_LEGAL_TERM_VERSIONS);
        expect(result.data.payload.data.provider_clause).toContain('seller of record');
        expect(result.data.payload.data.flows.account_registration.snapshot).toEqual(expect.objectContaining({
            terms_version: DGFY_LEGAL_TERM_VERSIONS.accountTerms,
            privacy_version: DGFY_LEGAL_TERM_VERSIONS.privacy,
            marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms
        }));
        expect(result.data.payload.data.flows.company_registration.snapshot).toEqual(expect.objectContaining({
            company_terms_version: DGFY_LEGAL_TERM_VERSIONS.companyTerms,
            marketplace_terms_version: DGFY_LEGAL_TERM_VERSIONS.marketplaceTerms
        }));
    });
});

