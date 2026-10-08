import multer from 'multer';
import {
  REGISTRATION_UPLOAD_MAX_BYTES,
  REGISTRATION_UPLOAD_MIME_TYPES
} from '../modules/tenants/contracts/companyRegistrationDraftContract.js';

const allowedMimeTypes = new Set(
  Object.values(REGISTRATION_UPLOAD_MIME_TYPES).flat()
);

export const companyRegistrationUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: REGISTRATION_UPLOAD_MAX_BYTES,
    files: 1,
    fields: 12
  },
  fileFilter: (req, file, callback) => {
    const mimeType = String(file?.mimetype || '').trim().toLowerCase();
    if (allowedMimeTypes.has(mimeType)) {
      callback(null, true);
      return;
    }
    callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file?.fieldname || 'file'), false);
  }
});
