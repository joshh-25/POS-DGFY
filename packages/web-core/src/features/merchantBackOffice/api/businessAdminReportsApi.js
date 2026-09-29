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
