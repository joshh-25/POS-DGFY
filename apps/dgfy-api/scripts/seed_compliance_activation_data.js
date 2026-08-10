import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const DEFAULT_REFERENCE_PAYLOAD = Object.freeze({
  bir_profile: {
    software_accreditation_number: 'BIR-TEST-2026-001',
    accreditation_valid_until: '2026-12-31',
    ptu_certificate_number: 'PTU-REF-999',
    tax_classification_controls_confirmed: true,
    non_resettable_grand_total_enabled: true,
    mandatory_receipt_fields_confirmed: true
  },
  npc_profile: {
    dpo_name: 'John Compliance Doe',
    dpo_email: 'dpo@example.com',
    dps_registration_number: 'NPC-DPS-2026-123',
    dps_registration_valid_until: '2026-12-31',
    breach_notification_procedure_confirmed: true
  }
});

const DEFAULT_SETTINGS_SEED = Object.freeze({
  pos_business_name: 'Seeded Compliance Test Business',
  pos_tin_branch: '123-456-789-000',
  pos_address: '123 Compliance St, Test City',
  pos_ptu_number: 'PTU-REF-999',
  pos_min_number: 'MIN-2026-001'
});

const DEFAULT_PERIPHERALS = Object.freeze([
  {
    device_class: 'receipt_printer',
    brand: 'SeedBrand',
    model: 'Thermal-Printer-01',
    serial_number: 'SEED-RECEIPT-2026-001'
  },
  {
    device_class: 'cash_drawer',
    brand: 'SeedBrand',
    model: 'CashDrawer-01',
    serial_number: 'SEED-CASHDRAWER-2026-001'
  }
]);

const toBoolean = (value, fallback = false) => {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return fallback;
};

const deepMerge = (base, incoming) => {
  const output = { ...(base || {}) };
  Object.keys(incoming || {}).forEach((key) => {
    const nextValue = incoming[key];
    const prevValue = output[key];
    if (
      nextValue
      && typeof nextValue === 'object'
      && !Array.isArray(nextValue)
      && prevValue
      && typeof prevValue === 'object'
      && !Array.isArray(prevValue)
    ) {
      output[key] = deepMerge(prevValue, nextValue);
      return;
    }
    output[key] = nextValue;
  });
  return output;
};

const normalizeProfileObject = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return {};

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return {};
  }

  return {};
};

const parseArgs = (argv) => {
  const options = {
    companyToken: 'token-original',
    actorUserId: 2,
    readinessPassed: true,
    lastTestedAt: '',
    dryRun: false,
    seedArtifacts: true,
    seedPeripherals: true,
    seedSettings: true,
    setModePending: false,
    referenceFile: ''
  };

  argv.forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const [rawKey, rawValue] = arg.slice(2).split('=');
    const key = String(rawKey || '').trim();
    const value = rawValue == null ? 'true' : rawValue;

    switch (key) {
      case 'company-token':
        options.companyToken = String(value || '').trim() || options.companyToken;
        break;
      case 'actor-user-id': {
        const parsed = Number.parseInt(value, 10);
        if (Number.isInteger(parsed) && parsed > 0) {
          options.actorUserId = parsed;
        }
        break;
      }
      case 'readiness-passed':
        options.readinessPassed = toBoolean(value, options.readinessPassed);
        break;
      case 'last-tested-at':
        options.lastTestedAt = String(value || '').trim();
        break;
      case 'dry-run':
        options.dryRun = toBoolean(value, true);
        break;
      case 'seed-artifacts':
        options.seedArtifacts = toBoolean(value, options.seedArtifacts);
        break;
      case 'seed-peripherals':
        options.seedPeripherals = toBoolean(value, options.seedPeripherals);
        break;
      case 'seed-settings':
        options.seedSettings = toBoolean(value, options.seedSettings);
        break;
      case 'set-mode-pending':
        options.setModePending = toBoolean(value, options.setModePending);
        break;
      case 'reference-file':
        options.referenceFile = String(value || '').trim();
        break;
      default:
        break;
    }
  });

  return options;
};

const normalizeIsoDateOnly = (value, fieldLabel) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) {
    throw new Error(`${fieldLabel} must be YYYY-MM-DD`);
  }
  return match[1];
};

const isLikelyEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const parseReferencePayload = async (referenceFile) => {
  if (!referenceFile) {
    return {
      payload: DEFAULT_REFERENCE_PAYLOAD,
      source: 'embedded-default'
    };
  }

  const absolutePath = path.isAbsolute(referenceFile)
    ? referenceFile
    : path.join(process.cwd(), referenceFile);
  const fileRaw = await fs.readFile(absolutePath, 'utf8');
  const parsed = JSON.parse(fileRaw);
  return {
    payload: parsed,
    source: absolutePath
  };
};

const buildProfilePatchFromReference = (referencePayload, options) => {
  const warnings = [];
  const birInput = referencePayload?.bir_profile || referencePayload?.bir || {};
  const npcInput = referencePayload?.npc_profile || referencePayload?.npc || {};

  if (Object.prototype.hasOwnProperty.call(birInput, 'accreditation_valid_until')) {
    warnings.push(
      'bir_profile.accreditation_valid_until was mapped to bir.software_accreditation_valid_until.'
    );
  }

  const softwareAccreditationValidUntil = (
    birInput.software_accreditation_valid_until
    ?? birInput.accreditation_valid_until
    ?? ''
  );

  const profilePatch = {
    bir: {
      software_accreditation_number: String(birInput.software_accreditation_number || '').trim(),
      software_accreditation_valid_until: normalizeIsoDateOnly(
        softwareAccreditationValidUntil,
        'software_accreditation_valid_until'
      ),
      ptu_certificate_number: String(birInput.ptu_certificate_number || '').trim(),
      tax_classification_controls_confirmed: toBoolean(birInput.tax_classification_controls_confirmed, false),
      non_resettable_grand_total_enabled: toBoolean(birInput.non_resettable_grand_total_enabled, false),
      mandatory_receipt_fields_confirmed: toBoolean(birInput.mandatory_receipt_fields_confirmed, false)
    },
    npc: {
      dpo_name: String(npcInput.dpo_name || '').trim(),
      dpo_email: String(npcInput.dpo_email || '').trim(),
      dps_registration_number: String(npcInput.dps_registration_number || '').trim(),
      dps_registration_valid_until: normalizeIsoDateOnly(
        npcInput.dps_registration_valid_until,
        'dps_registration_valid_until'
      ),
      breach_notification_procedure_confirmed: toBoolean(npcInput.breach_notification_procedure_confirmed, false)
    },
    bsp: {
      ops_registration_required: false,
      ops_registration_status: 'not_required',
      ops_registration_number: '',
      ops_registration_valid_until: '',
      payment_control_reviewed: false
    },
    readiness: {
      tests_passed: options.readinessPassed,
      last_tested_at: options.lastTestedAt
        ? String(options.lastTestedAt).trim()
        : ''
    }
  };

  const requiredChecks = [
    ['bir.software_accreditation_number', profilePatch.bir.software_accreditation_number],
    ['bir.software_accreditation_valid_until', profilePatch.bir.software_accreditation_valid_until],
    ['npc.dpo_name', profilePatch.npc.dpo_name],
    ['npc.dpo_email', profilePatch.npc.dpo_email],
    ['npc.dps_registration_number', profilePatch.npc.dps_registration_number],
    ['npc.dps_registration_valid_until', profilePatch.npc.dps_registration_valid_until]
  ];

  const missing = requiredChecks.filter(([, value]) => String(value || '').trim().length === 0);
  if (missing.length > 0) {
    throw new Error(
      `Reference payload missing required values: ${missing.map(([field]) => field).join(', ')}`
    );
  }

  if (!isLikelyEmail(profilePatch.npc.dpo_email)) {
    throw new Error('npc.dpo_email is not a valid email address');
  }

  return { profilePatch, warnings };
};

const upsertSettings = async ({ tenantDb, profilePatch }) => {
  const settings = {
    ...DEFAULT_SETTINGS_SEED,
    pos_ptu_number: profilePatch?.bir?.ptu_certificate_number || DEFAULT_SETTINGS_SEED.pos_ptu_number,
    pos_accreditation_number: profilePatch?.bir?.software_accreditation_number || ''
  };

  for (const [settingKey, settingValue] of Object.entries(settings)) {
    const description = `Seeded by seed_compliance_activation_data.js (${settingKey})`;
    await tenantDb.query(
      `INSERT INTO system_settings (setting_key, setting_value, data_type, description, updated_at)
       VALUES (?, ?, 'string', ?, NOW())
       ON DUPLICATE KEY UPDATE
         setting_value = VALUES(setting_value),
         data_type = VALUES(data_type),
         description = VALUES(description),
         updated_at = NOW()`,
      [settingKey, String(settingValue || ''), description]
    );
  }
};

const upsertArtifacts = async ({ tenantDb, tenantId, actorUserId, profilePatch }) => {
  const validUntil = profilePatch?.bir?.software_accreditation_valid_until || profilePatch?.npc?.dps_registration_valid_until;
  const artifactSeeds = [
    {
      artifact_type: 'bir_accreditation_certificate',
      artifact_name: 'BIR Accreditation Certificate (Seeded)',
      reference_number: profilePatch?.bir?.software_accreditation_number || '',
      valid_until: validUntil
    },
    {
      artifact_type: 'bir_ptu_document',
      artifact_name: 'BIR PTU Document (Seeded)',
      reference_number: profilePatch?.bir?.ptu_certificate_number || '',
      valid_until: validUntil
    },
    {
      artifact_type: 'npc_dps_certificate',
      artifact_name: 'NPC DPS Certificate (Seeded)',
      reference_number: profilePatch?.npc?.dps_registration_number || '',
      valid_until: profilePatch?.npc?.dps_registration_valid_until || validUntil
    }
  ];

  for (const seed of artifactSeeds) {
    const [rows] = await tenantDb.query(
      `SELECT tenant_compliance_artifact_id
       FROM tenant_compliance_artifacts
       WHERE tenant_id = ? AND artifact_type = ?
       ORDER BY tenant_compliance_artifact_id DESC
       LIMIT 1`,
      [tenantId, seed.artifact_type]
    );

    if (Array.isArray(rows) && rows.length > 0) {
      await tenantDb.query(
        `UPDATE tenant_compliance_artifacts
         SET artifact_name = ?,
             reference_number = ?,
             valid_from = COALESCE(valid_from, NOW()),
             valid_until = ?,
             status = 'valid',
             verification_status = 'verified',
             verified_by_actor_type = 'tenant_master_admin',
             verified_by_user_id = ?,
             verified_at = NOW(),
             verification_note = 'Seeded by script',
             verification_evidence_ref = 'seed-script',
             updated_at = NOW()
         WHERE tenant_compliance_artifact_id = ?`,
        [
          seed.artifact_name,
          seed.reference_number || null,
          seed.valid_until || null,
          actorUserId,
          rows[0].tenant_compliance_artifact_id
        ]
      );
      continue;
    }

    await tenantDb.query(
      `INSERT INTO tenant_compliance_artifacts (
         tenant_id,
         artifact_type,
         artifact_name,
         reference_number,
         valid_from,
         valid_until,
         status,
         verification_status,
         verified_by_actor_type,
         verified_by_user_id,
         verified_at,
         verification_note,
         verification_evidence_ref,
         metadata,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, ?, NOW(), ?, 'valid', 'verified', 'tenant_master_admin', ?, NOW(), 'Seeded by script', 'seed-script', '{}', NOW(), NOW())`,
      [
        tenantId,
        seed.artifact_type,
        seed.artifact_name,
        seed.reference_number || null,
        seed.valid_until || null,
        actorUserId
      ]
    );
  }
};

const upsertPeripherals = async ({ tenantDb, tenantId, actorUserId, profilePatch }) => {
  for (const seed of DEFAULT_PERIPHERALS) {
    const [rows] = await tenantDb.query(
      `SELECT tenant_compliance_peripheral_id
       FROM tenant_compliance_peripherals
       WHERE tenant_id = ? AND serial_number = ?
       LIMIT 1`,
      [tenantId, seed.serial_number]
    );

    if (Array.isArray(rows) && rows.length > 0) {
      await tenantDb.query(
        `UPDATE tenant_compliance_peripherals
         SET terminal_id = NULL,
             is_shared = 1,
             device_class = ?,
             brand = ?,
             model = ?,
             accreditation_reference = ?,
             accreditation_valid_from = COALESCE(accreditation_valid_from, NOW()),
             accreditation_valid_until = ?,
             status = 'accredited',
             verification_status = 'verified',
             verified_by_actor_type = 'tenant_master_admin',
             verified_by_user_id = ?,
             verified_at = NOW(),
             verification_note = 'Seeded by script',
             verification_evidence_ref = 'seed-script',
             updated_at = NOW()
         WHERE tenant_compliance_peripheral_id = ?`,
        [
          seed.device_class,
          seed.brand,
          seed.model,
          profilePatch?.bir?.software_accreditation_number || null,
          profilePatch?.bir?.software_accreditation_valid_until || null,
          actorUserId,
          rows[0].tenant_compliance_peripheral_id
        ]
      );
      continue;
    }

    await tenantDb.query(
      `INSERT INTO tenant_compliance_peripherals (
         tenant_id,
         terminal_id,
         is_shared,
         device_class,
         brand,
         model,
         serial_number,
         accreditation_reference,
         accreditation_valid_from,
         accreditation_valid_until,
         status,
         verification_status,
         verified_by_actor_type,
         verified_by_user_id,
         verified_at,
         verification_note,
         verification_evidence_ref,
         metadata,
         created_at,
         updated_at
       ) VALUES (?, NULL, 1, ?, ?, ?, ?, ?, NOW(), ?, 'accredited', 'verified', 'tenant_master_admin', ?, NOW(), 'Seeded by script', 'seed-script', '{}', NOW(), NOW())`,
      [
        tenantId,
        seed.device_class,
        seed.brand,
        seed.model,
        seed.serial_number,
        profilePatch?.bir?.software_accreditation_number || null,
        profilePatch?.bir?.software_accreditation_valid_until || null,
        actorUserId
      ]
    );
  }
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const { payload: referencePayload, source } = await parseReferencePayload(options.referenceFile);
  const { profilePatch, warnings } = buildProfilePatchFromReference(referencePayload, options);

  const landlordDb = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sku_inventory_manager'
  });

  try {
    const [tenantRows] = await landlordDb.query(
      `SELECT id, name, company_token, db_name, compliance_profile, compliance_mode_state, compliance_mode_choice_required
       FROM tenants
       WHERE company_token = ?
       LIMIT 1`,
      [options.companyToken]
    );

    if (!Array.isArray(tenantRows) || tenantRows.length === 0) {
      throw new Error(`Tenant not found for company token: ${options.companyToken}`);
    }

    const tenant = tenantRows[0];
    const existingProfile = normalizeProfileObject(tenant.compliance_profile);

    const mergedProfile = deepMerge(existingProfile, profilePatch);

    console.log('--- Compliance Seed Plan ---');
    console.log(`Reference source: ${source}`);
    console.log(`Tenant: ${tenant.name} (${tenant.id})`);
    console.log(`Tenant DB: ${tenant.db_name}`);
    warnings.forEach((warning) => console.log(`Warning: ${warning}`));
    console.log(`Dry run: ${options.dryRun ? 'yes' : 'no'}`);
    console.log(`Seed settings: ${options.seedSettings ? 'yes' : 'no'}`);
    console.log(`Seed artifacts: ${options.seedArtifacts ? 'yes' : 'no'}`);
    console.log(`Seed peripherals: ${options.seedPeripherals ? 'yes' : 'no'}`);
    console.log(`Set mode to compliant_pending: ${options.setModePending ? 'yes' : 'no'}`);

    if (options.dryRun) {
      console.log('Merged compliance_profile preview:');
      console.log(JSON.stringify(mergedProfile, null, 2));
      return;
    }

    await landlordDb.query(
      `UPDATE tenants
       SET compliance_profile = CAST(? AS JSON),
           updated_at = NOW()
       WHERE id = ?`,
      [JSON.stringify(mergedProfile), tenant.id]
    );

    if (options.setModePending) {
      const currentState = String(tenant.compliance_mode_state || '').trim();
      const canSetPending = (
        currentState.length === 0
        || currentState === 'non_compliant_active'
        || currentState === 'compliant_pending'
      );

      if (!canSetPending) {
        console.log(
          `Skipping mode update because current mode is "${currentState}" (non-downgrade rule).`
        );
      } else {
        await landlordDb.query(
          `UPDATE tenants
           SET compliance_mode_state = 'compliant_pending',
               compliance_mode_choice_required = 0,
               compliance_mode_selected_at = COALESCE(compliance_mode_selected_at, NOW()),
               compliance_mode_selected_by = COALESCE(compliance_mode_selected_by, 'seed-script'),
               compliance_policy_version = COALESCE(compliance_policy_version, '2026.04.07'),
               updated_at = NOW()
           WHERE id = ?`,
          [tenant.id]
        );
      }
    }

    const tenantDb = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: tenant.db_name
    });

    try {
      if (options.seedSettings) {
        await upsertSettings({ tenantDb, profilePatch });
      }

      if (options.seedArtifacts) {
        await upsertArtifacts({
          tenantDb,
          tenantId: tenant.id,
          actorUserId: options.actorUserId,
          profilePatch
        });
      }

      if (options.seedPeripherals) {
        await upsertPeripherals({
          tenantDb,
          tenantId: tenant.id,
          actorUserId: options.actorUserId,
          profilePatch
        });
      }
    } finally {
      await tenantDb.end();
    }

    console.log('Compliance seed completed successfully.');
  } finally {
    await landlordDb.end();
  }
};

main().catch((error) => {
  console.error('Compliance seed failed:', error.message);
  process.exit(1);
});
