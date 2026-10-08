import { CompanyRegistrationDownloadAudit } from '../../../models/index.js';

export const companyRegistrationDownloadAuditRepository = {
  create(payload) {
    return CompanyRegistrationDownloadAudit.create(payload);
  }
};
