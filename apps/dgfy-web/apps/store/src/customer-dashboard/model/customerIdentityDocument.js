const APPROVED_ID_STATUSES = new Set(['approved', 'verified', 'complete', 'completed', 'valid']);

const firstValue = (...values) => values.find((value) => String(value || '').trim()) || '';

const readDocumentRecord = (account = {}) => (
  account.valid_id
  || account.validId
  || account.identity_document
  || account.identityDocument
  || account.profile_verification?.valid_id
  || account.profileVerification?.validId
  || account.verification?.id
  || {}
);

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();

export const normalizeCustomerIdentityDocument = (document = {}) => {
  const status = normalizeStatus(firstValue(document.status, document.verification_status, document.verificationStatus));
  const frontUrl = firstValue(document.front_url, document.frontUrl, document.image_url, document.imageUrl, document.preview_url, document.previewUrl);
  const backUrl = firstValue(document.back_url, document.backUrl, document.back_image_url, document.backImageUrl);
  const idType = firstValue(document.id_type, document.idType, document.document_type, document.documentType);
  const uploadedAt = firstValue(document.uploaded_at, document.uploadedAt, document.created_at, document.createdAt);
  const expiresAt = firstValue(document.expires_at, document.expiresAt, document.expiry_date, document.expiryDate);

  return {
    frontUrl,
    backUrl,
    frontFile: document.frontFile || null,
    backFile: document.backFile || null,
    idType,
    uploadedAt,
    expiresAt,
    status,
    isVerified: APPROVED_ID_STATUSES.has(status) || document.verified === true || document.is_verified === true,
    hasUploaded: Boolean(frontUrl || backUrl || idType || uploadedAt || expiresAt || status)
  };
};

export const getCustomerIdentityDocument = (accountPanel) => (
  normalizeCustomerIdentityDocument(readDocumentRecord(accountPanel?.me || {}))
);

export const formatCustomerIdentityDocumentDate = (value) => {
  if (!value) return 'Not provided';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not provided';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
};
