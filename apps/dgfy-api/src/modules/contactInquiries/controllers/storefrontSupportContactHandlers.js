import {
  getPublicStorefrontSupportContactStatus,
  getStorefrontSupportContactStatus,
  requestStorefrontSupportEmailVerification,
  saveStorefrontSupportEmailConfiguration,
  verifyStorefrontSupportEmail
} from '../index.js';

const sendError = (res, error) => res.status(error.statusCode || 500).json({
  success: false,
  error_code: error.code || 'SUPPORT_EMAIL_ERROR',
  message: error.message || 'Support email configuration failed.'
});

export const getAdminStorefrontSupportContact = async (_req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      data: await getStorefrontSupportContactStatus()
    });
  } catch (error) {
    return next(error);
  }
};

export const saveAdminStorefrontSupportContact = async (req, res, next) => {
  try {
    const data = await saveStorefrontSupportEmailConfiguration({
      email: req.body?.email,
      admin: req.admin
    });
    return res.status(200).json({
      success: true,
      data,
      message: 'The Storefront support email was saved and is now public.'
    });
  } catch (error) {
    if (error.statusCode) return sendError(res, error);
    return next(error);
  }
};

export const requestAdminStorefrontSupportEmailVerification = async (req, res, next) => {
  try {
    const data = await requestStorefrontSupportEmailVerification({
      email: req.body?.email,
      admin: req.admin,
      metadata: { request_id: req.id || null, ip_address: req.ip || null }
    });
    return res.status(202).json({
      success: true,
      data,
      message: 'A verification code was sent to the configured support email.'
    });
  } catch (error) {
    if (error.statusCode) return sendError(res, error);
    return next(error);
  }
};

export const verifyAdminStorefrontSupportEmail = async (req, res, next) => {
  try {
    const data = await verifyStorefrontSupportEmail({
      email: req.body?.email,
      code: req.body?.code,
      monitoringConfirmed: req.body?.monitoring_confirmed,
      admin: req.admin
    });
    return res.status(200).json({
      success: true,
      data,
      message: 'Optional email verification was recorded.'
    });
  } catch (error) {
    if (error.statusCode) return sendError(res, error);
    return next(error);
  }
};

export const getPublicStorefrontSupportContact = async (_req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      data: await getPublicStorefrontSupportContactStatus()
    });
  } catch (error) {
    return next(error);
  }
};
