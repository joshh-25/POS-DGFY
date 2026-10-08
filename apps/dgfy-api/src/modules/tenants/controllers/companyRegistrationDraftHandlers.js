import {
    createCompanyRegistrationDraftUseCase,
    getCompanyRegistrationDraftUseCase,
    approveCompanyRegistrationDraftUseCase,
    removeCompanyRegistrationFileUseCase,
    submitCompanyRegistrationDraftUseCase,
    updateCompanyRegistrationDraftUseCase,
    uploadCompanyRegistrationFileUseCase
} from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

const requestMetadata = (req) => ({
    ip_address: req.ip || req.headers['x-forwarded-for'] || null,
    user_agent: req.get('user-agent') || null,
    request_id: req.id || req.requestId || req.headers['x-request-id'] || null
});

export const createCompanyRegistrationDraft = async (req, res) => sendUseCaseResult(
    res,
    await createCompanyRegistrationDraftUseCase({ dgfyAccount: req.dgfyAccount })
);

export const getCompanyRegistrationDraft = async (req, res) => sendUseCaseResult(
    res,
    await getCompanyRegistrationDraftUseCase({
        draftId: req.params.draftId,
        dgfyAccount: req.dgfyAccount
    })
);

export const updateCompanyRegistrationDraft = async (req, res) => sendUseCaseResult(
    res,
    await updateCompanyRegistrationDraftUseCase({
        draftId: req.params.draftId,
        dgfyAccount: req.dgfyAccount,
        body: req.body
    })
);

export const uploadCompanyRegistrationFile = async (req, res) => sendUseCaseResult(
    res,
    await uploadCompanyRegistrationFileUseCase({
        draftId: req.params.draftId,
        dgfyAccount: req.dgfyAccount,
        body: req.body,
        file: req.file
    })
);

export const removeCompanyRegistrationFile = async (req, res) => sendUseCaseResult(
    res,
    await removeCompanyRegistrationFileUseCase({
        draftId: req.params.draftId,
        uploadId: req.params.uploadId,
        dgfyAccount: req.dgfyAccount
    })
);

export const submitCompanyRegistrationDraft = async (req, res) => sendUseCaseResult(
    res,
    await submitCompanyRegistrationDraftUseCase({
        draftId: req.params.draftId,
        dgfyAccount: req.dgfyAccount,
        body: req.body,
        metadata: requestMetadata(req)
    })
);

export const approveCompanyRegistrationDraft = async (req, res) => sendUseCaseResult(
    res,
    await approveCompanyRegistrationDraftUseCase({
        draftId: req.params.draftId,
        actor: req.admin
    })
);

export const retryCompanyRegistrationDraftMaterialization = async (req, res) => sendUseCaseResult(
    res,
    await approveCompanyRegistrationDraftUseCase({
        draftId: req.params.draftId,
        actor: req.admin,
        retry: true
    })
);
