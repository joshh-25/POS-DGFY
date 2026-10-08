import api from '../../../services/api.js';

const unwrap = (response) => response?.data?.data ?? response?.data ?? {};

export const getBusinessAdminReportDataset = (reportKey, params = {}) => (
  api.get(`/business-admin/reports/datasets/${encodeURIComponent(reportKey)}`, { params }).then(unwrap)
);

export const exportBusinessAdminReportDataset = (reportKey, params = {}) => (
  api.get(`/business-admin/reports/datasets/${encodeURIComponent(reportKey)}/export`, {
    params,
    responseType: 'blob'
  })
);

export const getBusinessAdminEvidenceCatalog = () => (
  api.get('/business-admin/reports/evidence/catalog').then(unwrap)
);

export const getBusinessAdminEJournalEvidence = (params = {}) => (
  api.get('/business-admin/reports/evidence/ejournal', {
    params: { ...params, format: 'summary' }
  }).then(unwrap)
);

export const downloadBusinessAdminEJournalEvidence = (params = {}, format = 'txt') => (
  api.get('/business-admin/reports/evidence/ejournal', {
    params: { ...params, format },
    responseType: 'blob'
  })
);
