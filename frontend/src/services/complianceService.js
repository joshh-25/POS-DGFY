import api from './api.js';

const unwrapData = (response) => response?.data?.data;

export const getComplianceProfile = async () => unwrapData(await api.get('/compliance/profile'));

export const selectComplianceMode = async (modeChoice) => (
  unwrapData(await api.post('/compliance/mode/select', { mode_choice: modeChoice }))
);

export const upgradeToCompliant = async () => unwrapData(await api.post('/compliance/mode/upgrade'));

export const getComplianceChecklist = async ({ terminalId = null } = {}) => {
  const params = {};
  if (terminalId) params.terminal_id = terminalId;
  return unwrapData(await api.get('/compliance/checklist', { params }));
};

export const activateCompliantMode = async (payload = {}) => unwrapData(await api.post('/compliance/activate', payload));

export const updateComplianceProfile = async (profilePatch) => (
  unwrapData(await api.put('/compliance/profile', profilePatch))
);

export const listComplianceArtifacts = async () => unwrapData(await api.get('/compliance/artifacts'));

export const createComplianceArtifact = async (payload) => (
  unwrapData(await api.post('/compliance/artifacts', payload))
);

export const updateComplianceArtifact = async (artifactId, payload) => (
  unwrapData(await api.patch(`/compliance/artifacts/${artifactId}`, payload))
);

export const updateComplianceArtifactVerification = async (artifactId, payload) => (
  unwrapData(await api.post(`/compliance/artifacts/${artifactId}/verification`, payload))
);

export const listCompliancePeripherals = async () => unwrapData(await api.get('/compliance/peripherals'));

export const createCompliancePeripheral = async (payload) => (
  unwrapData(await api.post('/compliance/peripherals', payload))
);

export const updateCompliancePeripheral = async (peripheralId, payload) => (
  unwrapData(await api.patch(`/compliance/peripherals/${peripheralId}`, payload))
);

export const updateCompliancePeripheralVerification = async (peripheralId, payload) => (
  unwrapData(await api.post(`/compliance/peripherals/${peripheralId}/verification`, payload))
);

export const listFinalReviewDocuments = async () => unwrapData(await api.get('/compliance/final-review/documents'));

export const upsertFinalReviewDocument = async (payload) => (
  unwrapData(await api.post('/compliance/final-review/documents', payload))
);

export const uploadFinalReviewDocument = async (documentId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  return unwrapData(await api.post(`/compliance/final-review/documents/${documentId}/upload`, formData));
};

export const reviewFinalReviewDocument = async (documentId, payload) => (
  unwrapData(await api.post(`/compliance/final-review/documents/${documentId}/review`, payload))
);

export const upsertFinalReviewSignoff = async (payload) => (
  unwrapData(await api.put('/compliance/final-review/signoff-metadata', payload))
);

export const listComplianceAuditLogs = async ({ limit = 100 } = {}) => (
  unwrapData(await api.get('/compliance/audit-logs', { params: { limit } }))
);

export const runCompliancePreflight = async (payload) => (
  unwrapData(await api.post('/compliance/preflight', payload))
);
