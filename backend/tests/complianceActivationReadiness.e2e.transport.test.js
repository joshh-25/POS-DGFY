import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import {
  buildGetComplianceProfileUseCase,
  buildGetComplianceChecklistUseCase,
  buildActivateCompliantModeUseCase,
  buildUpdateComplianceProfileUseCase,
  buildListComplianceArtifactsUseCase,
  buildCreateComplianceArtifactUseCase,
  buildUpdateComplianceArtifactUseCase,
  buildUpdateComplianceArtifactVerificationUseCase,
  buildListCompliancePeripheralsUseCase,
  buildCreateCompliancePeripheralUseCase,
  buildUpdateCompliancePeripheralUseCase,
  buildUpdateCompliancePeripheralVerificationUseCase,
  buildListComplianceAuditLogsUseCase
} from '../src/modules/compliance/usecases/complianceUseCases.js';
import { COMPLIANCE_MODE_STATE } from '../src/modules/compliance/policy/complianceConstants.js';

const TENANT_ID = 'tenant-readiness-e2e';
const noopUseCase = jest.fn().mockResolvedValue({ success: true, data: {} });

const clone = (value) => JSON.parse(JSON.stringify(value));

const mergeObjects = (base, incoming) => {
  const output = { ...base };
  Object.keys(incoming || {}).forEach((key) => {
    const nextValue = incoming[key];
    if (
      nextValue
      && typeof nextValue === 'object'
      && !Array.isArray(nextValue)
      && output[key]
      && typeof output[key] === 'object'
      && !Array.isArray(output[key])
    ) {
      output[key] = mergeObjects(output[key], nextValue);
      return;
    }
    output[key] = nextValue;
  });
  return output;
};

const buildRequiredSettingsSnapshot = () => ({
  pos_business_name: { value: 'Demo Business' },
  pos_tin_branch: { value: 'TIN-123-456-789' },
  pos_address: { value: '123 Demo Street' },
  pos_ptu_number: { value: 'PTU-12345' },
  pos_min_number: { value: 'MIN-12345' },
  pos_accreditation_number: { value: 'ACC-12345' }
});

const createComplianceHarness = () => {
  const state = {
    tenant: {
      id: TENANT_ID,
      compliance_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_PENDING,
      compliance_mode_choice_required: false,
      compliance_mode_selected_at: null,
      compliance_mode_selected_by: null,
      compliance_activated_at: null,
      compliance_policy_version: '2026.04.07',
      compliance_profile: {}
    },
    artifacts: [],
    peripherals: [],
    auditLogs: [],
    artifactSeq: 1,
    peripheralSeq: 1
  };

  let settingsSnapshot = buildRequiredSettingsSnapshot();

  const repository = {
    async beginTransaction() {
      return {
        finished: false,
        async commit() {
          this.finished = true;
        },
        async rollback() {
          this.finished = true;
        }
      };
    },
    async findTenantById(tenantId) {
      if (tenantId !== state.tenant.id) return null;
      return clone(state.tenant);
    },
    async updateTenantById(tenantId, payload = {}) {
      if (tenantId !== state.tenant.id) return null;
      state.tenant = { ...state.tenant, ...clone(payload) };
      return clone(state.tenant);
    },
    async updateComplianceProfile(tenantId, patch = {}) {
      if (tenantId !== state.tenant.id) return null;
      state.tenant.compliance_profile = mergeObjects(
        state.tenant.compliance_profile || {},
        clone(patch)
      );
      return {
        tenant: clone(state.tenant),
        compliance_profile: clone(state.tenant.compliance_profile)
      };
    },
    async listArtifactsByTenantId(tenantId) {
      if (tenantId !== state.tenant.id) return [];
      return clone(state.artifacts);
    },
    async createArtifact(payload = {}) {
      const record = {
        tenant_compliance_artifact_id: state.artifactSeq++,
        ...clone(payload)
      };
      state.artifacts.push(record);
      return clone(record);
    },
    async updateArtifactById(artifactId, payload = {}) {
      const id = Number(artifactId);
      const index = state.artifacts.findIndex((entry) => Number(entry.tenant_compliance_artifact_id) === id);
      if (index === -1) return null;
      state.artifacts[index] = {
        ...state.artifacts[index],
        ...clone(payload)
      };
      return clone(state.artifacts[index]);
    },
    async listPeripheralsByTenantId(tenantId) {
      if (tenantId !== state.tenant.id) return [];
      return clone(state.peripherals);
    },
    async createPeripheral(payload = {}) {
      const record = {
        tenant_compliance_peripheral_id: state.peripheralSeq++,
        ...clone(payload)
      };
      state.peripherals.push(record);
      return clone(record);
    },
    async updatePeripheralById(peripheralId, payload = {}) {
      const id = Number(peripheralId);
      const index = state.peripherals.findIndex((entry) => Number(entry.tenant_compliance_peripheral_id) === id);
      if (index === -1) return null;
      state.peripherals[index] = {
        ...state.peripherals[index],
        ...clone(payload)
      };
      return clone(state.peripherals[index]);
    },
    async createAuditLog(payload = {}) {
      state.auditLogs.push(clone(payload));
      return clone(payload);
    },
    async createAuditFailureLog(payload = {}) {
      return clone(payload);
    },
    async listAuditLogsByTenantId(tenantId) {
      if (tenantId !== state.tenant.id) return [];
      return clone(state.auditLogs);
    }
  };

  const logger = {
    warn: jest.fn(),
    error: jest.fn()
  };

  const getSettingsSnapshot = async () => clone(settingsSnapshot);

  const getComplianceChecklistUseCase = buildGetComplianceChecklistUseCase({
    complianceRepository: repository,
    getSettingsSnapshot
  });

  return {
    state,
    reset() {
      state.tenant = {
        id: TENANT_ID,
        compliance_mode_state: COMPLIANCE_MODE_STATE.COMPLIANT_PENDING,
        compliance_mode_choice_required: false,
        compliance_mode_selected_at: null,
        compliance_mode_selected_by: null,
        compliance_activated_at: null,
        compliance_policy_version: '2026.04.07',
        compliance_profile: {}
      };
      state.artifacts = [];
      state.peripherals = [];
      state.auditLogs = [];
      state.artifactSeq = 1;
      state.peripheralSeq = 1;
      settingsSnapshot = buildRequiredSettingsSnapshot();
    },
    usecases: {
      getComplianceProfileUseCase: buildGetComplianceProfileUseCase({
        complianceRepository: repository,
        getSettingsSnapshot
      }),
      selectComplianceModeUseCase: noopUseCase,
      upgradeToCompliantUseCase: noopUseCase,
      getComplianceChecklistUseCase,
      activateCompliantModeUseCase: buildActivateCompliantModeUseCase({
        complianceRepository: repository,
        getComplianceChecklistUseCase,
        logger
      }),
      updateComplianceProfileUseCase: buildUpdateComplianceProfileUseCase({
        complianceRepository: repository,
        logger
      }),
      listComplianceArtifactsUseCase: buildListComplianceArtifactsUseCase({
        complianceRepository: repository
      }),
      createComplianceArtifactUseCase: buildCreateComplianceArtifactUseCase({
        complianceRepository: repository,
        logger
      }),
      updateComplianceArtifactUseCase: buildUpdateComplianceArtifactUseCase({
        complianceRepository: repository
      }),
      updateComplianceArtifactVerificationUseCase: buildUpdateComplianceArtifactVerificationUseCase({
        complianceRepository: repository,
        logger
      }),
      listCompliancePeripheralsUseCase: buildListCompliancePeripheralsUseCase({
        complianceRepository: repository
      }),
      createCompliancePeripheralUseCase: buildCreateCompliancePeripheralUseCase({
        complianceRepository: repository,
        logger
      }),
      updateCompliancePeripheralUseCase: buildUpdateCompliancePeripheralUseCase({
        complianceRepository: repository
      }),
      updateCompliancePeripheralVerificationUseCase: buildUpdateCompliancePeripheralVerificationUseCase({
        complianceRepository: repository,
        logger
      }),
      listComplianceAuditLogsUseCase: buildListComplianceAuditLogsUseCase({
        complianceRepository: repository
      }),
      compliancePreflightUseCase: noopUseCase
    }
  };
};

const harness = createComplianceHarness();

const mockAuthenticate = jest.fn((req, res, next) => {
  req.user = {
    user_id: 9,
    is_master_admin: true
  };
  req.tenant = { id: TENANT_ID };
  next();
});

const mockCheckPermission = jest.fn(() => (req, res, next) => next());

jest.unstable_mockModule('../src/modules/compliance/index.js', () => ({
  ...harness.usecases
}));

jest.unstable_mockModule('../src/middleware/auth.js', () => ({
  authenticate: mockAuthenticate,
  checkPermission: mockCheckPermission
}));

jest.unstable_mockModule('../src/middleware/tenantHandler.js', () => ({
  invalidateTenantLookupCache: jest.fn()
}));

let app;

beforeAll(async () => {
  const complianceRouter = (await import('../src/routes/compliance.js')).default;
  app = express();
  app.use(express.json());
  app.use('/api/v1/compliance', complianceRouter);
});

describe('compliance activation readiness e2e transport flow', () => {
  beforeEach(() => {
    harness.reset();
    jest.clearAllMocks();
  });

  it('blocks activation while checklist is incomplete and returns blockers', async () => {
    const checklistResponse = await request(app).get('/api/v1/compliance/checklist');
    expect(checklistResponse.status).toBe(200);
    expect(checklistResponse.body.data.ready_for_compliant_activation).toBe(false);
    expect(Array.isArray(checklistResponse.body.data.missing_profile_fields)).toBe(true);
    expect(checklistResponse.body.data.missing_profile_fields.length).toBeGreaterThan(0);

    const activateResponse = await request(app)
      .post('/api/v1/compliance/activate')
      .send({ confirmation_text: 'ACTIVATE COMPLIANT' });

    expect(activateResponse.status).toBe(422);
    expect(activateResponse.body).toEqual(expect.objectContaining({
      success: false,
      message: 'Compliance activation checklist is incomplete',
      error_code: 'VALIDATION_FAILED'
    }));
    expect(activateResponse.body.errors?.checklist?.ready_for_compliant_activation).toBe(false);
  });

  it('transitions from pending to active after completing profile, artifact, and peripheral requirements', async () => {
    const profileUpdateResponse = await request(app)
      .put('/api/v1/compliance/profile')
      .send({
        bir: {
          software_accreditation_number: 'BIR-TEST-2026-001',
          software_accreditation_valid_until: '2026-12-31',
          ptu_certificate_number: 'PTU-REF-999',
          tax_classification_controls_confirmed: true,
          non_resettable_grand_total_enabled: true,
          mandatory_receipt_fields_confirmed: true
        },
        npc: {
          dpo_name: 'John Compliance Doe',
          dpo_email: 'dpo@example.com',
          dps_registration_number: 'NPC-DPS-2026-123',
          dps_registration_valid_until: '2026-12-31',
          breach_notification_procedure_confirmed: true
        },
        readiness: {
          tests_passed: true
        }
      });
    expect(profileUpdateResponse.status).toBe(200);

    const checklistAfterProfile = await request(app).get('/api/v1/compliance/checklist');
    expect(checklistAfterProfile.status).toBe(200);

    const missingArtifacts = checklistAfterProfile.body.data?.missing_artifacts || [];
    const missingPeripherals = checklistAfterProfile.body.data?.missing_peripheral_classes || [];
    expect(Array.isArray(missingArtifacts)).toBe(true);
    expect(Array.isArray(missingPeripherals)).toBe(true);

    for (const artifactType of missingArtifacts) {
      const createArtifactResponse = await request(app)
        .post('/api/v1/compliance/artifacts')
        .send({
          artifact_type: artifactType,
          artifact_name: `${artifactType}-doc`
        });
      expect(createArtifactResponse.status).toBe(201);
      const artifactId = createArtifactResponse.body?.data?.tenant_compliance_artifact_id;
      expect(Number.isInteger(Number(artifactId))).toBe(true);

      const verifyArtifactResponse = await request(app)
        .post(`/api/v1/compliance/artifacts/${artifactId}/verification`)
        .send({ action: 'verify', verification_note: 'e2e readiness verification' });
      expect(verifyArtifactResponse.status).toBe(200);
    }

    for (const deviceClass of missingPeripherals) {
      const createPeripheralResponse = await request(app)
        .post('/api/v1/compliance/peripherals')
        .send({
          device_class: deviceClass,
          brand: 'E2E',
          model: `${deviceClass}-model`,
          serial_number: `${deviceClass}-serial-001`,
          is_shared: true
        });
      expect(createPeripheralResponse.status).toBe(201);
      const peripheralId = createPeripheralResponse.body?.data?.tenant_compliance_peripheral_id;
      expect(Number.isInteger(Number(peripheralId))).toBe(true);

      const verifyPeripheralResponse = await request(app)
        .post(`/api/v1/compliance/peripherals/${peripheralId}/verification`)
        .send({ action: 'verify', verification_note: 'e2e readiness verification' });
      expect(verifyPeripheralResponse.status).toBe(200);
    }

    const checklistReadyResponse = await request(app).get('/api/v1/compliance/checklist');
    expect(checklistReadyResponse.status).toBe(200);
    expect(checklistReadyResponse.body.data.ready_for_compliant_activation).toBe(true);
    expect(checklistReadyResponse.body.data.activation_blockers).toEqual([]);

    const activateResponse = await request(app)
      .post('/api/v1/compliance/activate')
      .send({ confirmation_text: 'ACTIVATE COMPLIANT' });
    expect(activateResponse.status).toBe(200);
    expect(activateResponse.body).toEqual(expect.objectContaining({
      success: true,
      message: 'Compliant mode activated'
    }));
    expect(activateResponse.body.data.mode_state).toBe(COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE);

    const profileResponse = await request(app).get('/api/v1/compliance/profile');
    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body.data.mode_state).toBe(COMPLIANCE_MODE_STATE.COMPLIANT_ACTIVE);
    expect(profileResponse.body.data.checklist.ready_for_compliant_activation).toBe(true);
  });
});
