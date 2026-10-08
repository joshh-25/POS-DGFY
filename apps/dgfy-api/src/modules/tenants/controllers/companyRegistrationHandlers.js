import { getCompanyRegistrationStatusUseCase, resubmitCompanyRegistrationUseCase, uploadCompanyRegistrationApplicationFileUseCase, listAdminCompanyRegistrationUseCase, downloadAdminCompanyRegistrationUploadUseCase, revokeAdminCompanyRegistrationUploadUseCase } from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

export const getCompanyRegistrationStatus = async (req, res) => sendUseCaseResult(res, await getCompanyRegistrationStatusUseCase({
  applicationId: req.params.applicationId,
  dgfyAccountId: req.dgfyAccount?.id
}));

export const resubmitCompanyRegistration = async (req, res) => sendUseCaseResult(res, await resubmitCompanyRegistrationUseCase({
  applicationId: req.params.applicationId,
  dgfyAccountId: req.dgfyAccount?.id,
  body: req.body
}));

export const uploadCompanyRegistrationFile = async (req, res) => sendUseCaseResult(res, await uploadCompanyRegistrationApplicationFileUseCase({
  applicationId: req.params.applicationId,
  dgfyAccountId: req.dgfyAccount?.id,
  kind: req.params.kind,
  file: req.file
}));

export const getAdminCompanyRegistration = async (req, res) => sendUseCaseResult(res, await listAdminCompanyRegistrationUseCase({
  tenantId: req.params.id,
  admin: req.admin
}));

export const downloadAdminCompanyRegistrationUpload = async (req, res, next) => {
  try {
    const result = await downloadAdminCompanyRegistrationUploadUseCase({ tenantId: req.params.id, uploadId: req.params.uploadId, admin: req.admin });
    if (!result?.success) return sendUseCaseResult(res, result);
    const { data } = result.data;
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', data.mimeType);
    res.setHeader('Content-Length', String(data.size));
    res.setHeader('Content-Disposition', `attachment; filename="${String(data.filename).replace(/["\r\n]/g, '_')}"`);
    data.stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Registration upload could not be read.' });
      } else {
        res.destroy();
      }
    });
    return data.stream.pipe(res);
  } catch (error) {
    if (typeof next === 'function') return next(error);
    throw error;
  }
};

export const revokeAdminCompanyRegistrationUpload = async (req, res) => sendUseCaseResult(res, await revokeAdminCompanyRegistrationUploadUseCase({
  tenantId: req.params.id,
  uploadId: req.params.uploadId,
  admin: req.admin,
  reason: req.body?.reason
}));
