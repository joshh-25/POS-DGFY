/**
 * Provision two disposable tenant databases for the local Annex B test plan.
 *
 * This script deliberately creates synthetic data only. It must never be used
 * against staging or production and must not be interpreted as BIR evidence.
 * The fixtures are kept separate from the user's existing tenant databases so
 * local fiscal/non-fiscal behavior can be exercised without mutating Masu Cafe.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    DgfyAccount,
    DgfyAccountTenantMembership,
    Tenant,
    TenantComplianceArtifact,
    TenantCompliancePeripheral,
    sequelize as landlordSequelize
} from '../apps/dgfy-api/src/models/index.js';
import { createTestTenant, destroyTestTenant } from '../apps/dgfy-api/tests/helpers/testTenantHelper.js';

const LOCAL_LABEL = 'LOCAL TEST — NOT FOR SUBMISSION';
const LOCAL_DB_PREFIX = 'test_tenant_bir_';
const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(sourceDirectory, '..');
const evidenceDirectory = path.join(repoRoot, 'BIR_ANNEX_B_LOCAL_EVIDENCE', '00-run');

const fixtureSpecs = [
    {
        key: 'vat',
        taxpayerType: 'vat_registered',
        companyName: `${LOCAL_LABEL} — VAT FIXTURE`,
        terminalId: 'BIR-LOCAL-VAT-01',
        suffix: 'VAT',
        primaryItemVatType: 'vatable'
    },
    {
        key: 'non_vat',
        taxpayerType: 'non_vat_registered',
        companyName: `${LOCAL_LABEL} — NON-VAT FIXTURE`,
        terminalId: 'BIR-LOCAL-NONVAT-01',
        suffix: 'NONVAT',
        primaryItemVatType: 'vat_exempt'
    }
];

const assertLocalOnlyEnvironment = () => {
    const apiBaseUrl = String(process.env.API_BASE_URL || process.env.BASE_URL || '').trim().toLowerCase();
    const forbiddenHost = /(staging|prod|production|beta\.dgfy\.ph|dgfy\.ph)/i.test(apiBaseUrl);
    if (forbiddenHost) {
        throw new Error(`Refusing to provision local fixtures for non-local API URL: ${apiBaseUrl}`);
    }

    const databaseHost = String(process.env.DB_HOST || 'localhost').trim().toLowerCase();
    if (!['localhost', '127.0.0.1', '::1'].includes(databaseHost)) {
        throw new Error(`Refusing to provision local fixtures for non-local database host: ${databaseHost}`);
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('Refusing to provision local fixtures while NODE_ENV=production.');
    }
};

const parseJson = (value, fallback = {}) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {
            // Fall through to the safe default for an empty fixture database.
        }
    }
    return fallback;
};

const makeComplianceProfile = (spec) => ({
    bir: {
        software_accreditation_number: `LOCAL-TEST-ACC-${spec.suffix}`,
        software_accreditation_valid_until: '2036-12-31',
        ptu_certificate_number: `LOCAL-TEST-PTU-${spec.suffix}`,
        tax_classification_controls_confirmed: true,
        non_resettable_grand_total_enabled: true,
        mandatory_receipt_fields_confirmed: true,
        // These values are intentionally synthetic. The activation path may
        // still remain blocked by documentary readiness, which is correct.
        rmo_24_2023_filing_verified: false,
        fiscal_document_content_reviewed: true,
        terminal_registration_controls_confirmed: true,
        ejournal_integrity_controls_confirmed: true,
        esales_reporting_controls_confirmed: true
    },
    npc: {
        dpo_name: `${LOCAL_LABEL} DPO`,
        dpo_email: `dpo+${spec.key}@local.invalid`,
        dps_registration_number: `LOCAL-TEST-DPS-${spec.suffix}`,
        dps_registration_valid_until: '2036-12-31',
        breach_notification_procedure_confirmed: true
    },
    bsp: {
        ops_registration_required: false,
        ops_registration_status: 'not_required',
        ops_registration_number: '',
        ops_registration_valid_until: '',
        payment_control_reviewed: true
    },
    readiness: {
        tests_passed: false,
        last_tested_at: ''
    },
    fixture: {
        label: LOCAL_LABEL,
        synthetic: true,
        taxpayer_type: spec.taxpayerType
    }
});

const createOrReplaceSetting = async (SystemSetting, settingKey, value, dataType, description) => {
    const serializedValue = dataType === 'json' ? JSON.stringify(value) : String(value ?? '');
    const existing = await SystemSetting.findOne({ where: { setting_key: settingKey } });
    if (existing) {
        await existing.update({ setting_value: serializedValue, data_type: dataType, description });
        return existing;
    }
    return SystemSetting.create({
        setting_key: settingKey,
        setting_value: serializedValue,
        data_type: dataType,
        description
    });
};

const seedFixture = async ({ context, account, spec }) => {
    const { models, tenant } = context;
    const {
        User,
        TenantLocation,
        Item,
        ItemLocationStock,
        SystemSetting,
        PosFiscalTerminalRegistration
    } = models;

    const tenantAdmin = await User.create({
        username: `bir_local_${spec.key}_admin`,
        email: account.email,
        phone_number: `+63 917 000 ${spec.key === 'vat' ? '0001' : '0002'}`,
        // Reuse the already-authenticated local DGFY account hash without
        // writing or printing the user's password anywhere.
        password_hash: account.password_hash,
        role: 'admin',
        role_preset_key: 'admin',
        permission_mode: 'inherit',
        permissions: [],
        is_active: true,
        is_master_admin: true
    });

    const location = await TenantLocation.create({
        name: `${LOCAL_LABEL} — ${spec.suffix} BRANCH`,
        address_line: `${LOCAL_LABEL}, Iloilo City`,
        address_details: 'Disposable local branch fixture',
        latitude: 10.7202,
        longitude: 122.5621,
        delivery_radius_km: 5,
        is_open: true,
        is_active: true,
        is_primary_storefront: true,
        allow_out_of_stock_sales: false,
        supports_delivery: true,
        supports_pickup: true,
        supports_dine_in: true,
        allow_dine_in_pay_at_store: true,
        operating_hours: { fixture: LOCAL_LABEL, open: '00:00', close: '23:59' }
    });

    const productDefinitions = [
        {
            name: `${LOCAL_LABEL} — ${spec.suffix} TAXABLE ITEM`,
            sku_code: `LOCAL-${spec.suffix}-ITEM-001`,
            vat_type: spec.primaryItemVatType,
            default_sale_price: 100,
            cost_per_unit: 50
        },
        {
            name: `${LOCAL_LABEL} — ${spec.suffix} EXEMPT ITEM`,
            sku_code: `LOCAL-${spec.suffix}-ITEM-002`,
            vat_type: 'vat_exempt',
            default_sale_price: 75,
            cost_per_unit: 35
        },
        {
            name: `${LOCAL_LABEL} — ${spec.suffix} ZERO-RATED ITEM`,
            sku_code: `LOCAL-${spec.suffix}-ITEM-003`,
            vat_type: 'zero_rated',
            default_sale_price: 80,
            cost_per_unit: 40
        }
    ];

    const items = [];
    for (const definition of productDefinitions) {
        const item = await Item.create({
            ...definition,
            category: 'product',
            product_type: 'finished_goods',
            tracking_mode: 'count_ledger',
            current_stock: 100,
            unit_of_measure: 'piece',
            senior_pwd_discount_eligible: false,
            fifo_enabled: false,
            status: 'active',
            description: LOCAL_LABEL,
            wizard_metadata: { fixture: LOCAL_LABEL }
        });
        await ItemLocationStock.create({
            item_id: item.item_id,
            location_id: location.location_id,
            quantity_on_hand: 100,
            updated_by: tenantAdmin.user_id
        });
        items.push(item);
    }

    const terminalRegistryEntry = {
        terminal_id: spec.terminalId,
        label: `${LOCAL_LABEL} — ${spec.suffix} TERMINAL`,
        location_id: location.location_id,
        is_active: true,
        pairing_version: `local-fixture-${spec.key}-v1`,
        cashier_user_ids: [tenantAdmin.user_id],
        device_serial_number: `LOCAL-TEST-DEVICE-${spec.suffix}`,
        fixture_label: LOCAL_LABEL
    };

    const settingDescription = `${LOCAL_LABEL}; disposable local Annex B fixture.`;
    const settings = [
        ['pos_registered_name', spec.companyName, 'string'],
        ['pos_business_name', spec.companyName, 'string'],
        ['pos_business_style', `${LOCAL_LABEL} FOOD SERVICE`, 'string'],
        ['pos_taxpayer_type', spec.taxpayerType, 'string'],
        ['pos_tin_branch', `LOCAL-TEST-${spec.suffix}-000`, 'string'],
        ['pos_address', `${LOCAL_LABEL}, Iloilo City`, 'string'],
        ['pos_ptu_number', `LOCAL-TEST-PTU-${spec.suffix}`, 'string'],
        ['pos_min_number', `LOCAL-TEST-MIN-${spec.suffix}`, 'string'],
        ['pos_accreditation_number', `LOCAL-TEST-ACC-${spec.suffix}`, 'string'],
        ['pos_terminal_registry', [terminalRegistryEntry], 'json'],
        ['pos_terminal_registry_mode', 'warn', 'string'],
        ['workflow_mode', 'fnb', 'string']
    ];
    for (const [settingKey, value, dataType] of settings) {
        await createOrReplaceSetting(SystemSetting, settingKey, value, dataType, settingDescription);
    }

    const fiscalRegistration = await PosFiscalTerminalRegistration.create({
        terminal_id: spec.terminalId,
        location_id: location.location_id,
        min_number: `LOCAL-TEST-MIN-${spec.suffix}`,
        machine_serial_number: `LOCAL-TEST-MACHINE-${spec.suffix}`,
        software_version: 'LOCAL-TEST',
        software_serial_number: `LOCAL-TEST-SW-${spec.suffix}`,
        ptu_number: `LOCAL-TEST-PTU-${spec.suffix}`,
        permit_issued_at: '2026-01-01',
        permit_effective_at: '2026-01-01',
        permit_expires_at: '2036-12-31',
        receipt_printer_binding: `LOCAL-TEST-PRINTER-${spec.suffix}`,
        cash_drawer_binding: `LOCAL-TEST-DRAWER-${spec.suffix}`,
        accreditation_status: 'verified',
        evidence_ref: LOCAL_LABEL,
        metadata: { fixture: LOCAL_LABEL, synthetic: true },
        registered_by: tenantAdmin.user_id,
        verified_by: tenantAdmin.user_id,
        verified_at: new Date()
    });

    const now = new Date();
    const validUntil = new Date('2036-12-31T23:59:59.000Z');
    const complianceArtifactDefinitions = [
        ['bir_accreditation_certificate', `LOCAL TEST ACCREDITATION — ${spec.suffix}`, `LOCAL-TEST-ACC-${spec.suffix}`],
        ['bir_ptu_document', `LOCAL TEST PTU — ${spec.suffix}`, `LOCAL-TEST-PTU-${spec.suffix}`],
        ['npc_dps_certificate', `LOCAL TEST DPS — ${spec.suffix}`, `LOCAL-TEST-DPS-${spec.suffix}`]
    ];
    for (const [artifactType, artifactName, referenceNumber] of complianceArtifactDefinitions) {
        await TenantComplianceArtifact.create({
            tenant_id: tenant.id,
            artifact_type: artifactType,
            artifact_name: artifactName,
            reference_number: referenceNumber,
            valid_from: now,
            valid_until: validUntil,
            status: 'valid',
            verification_status: 'verified',
            verified_by_actor_type: 'tenant_master_admin',
            verified_by_user_id: tenantAdmin.user_id,
            verified_at: now,
            verification_note: `${LOCAL_LABEL}; synthetic fixture only; not an official verification.`,
            verification_evidence_ref: LOCAL_LABEL,
            metadata: { fixture: LOCAL_LABEL, synthetic: true }
        });
    }

    for (const [deviceClass, model, serialNumber] of [
        ['receipt_printer', 'LOCAL-TEST-THERMAL-PRINTER', `LOCAL-TEST-PRINTER-${spec.suffix}`],
        ['cash_drawer', 'LOCAL-TEST-CASH-DRAWER', `LOCAL-TEST-DRAWER-${spec.suffix}`]
    ]) {
        await TenantCompliancePeripheral.create({
            tenant_id: tenant.id,
            terminal_id: spec.terminalId,
            is_shared: false,
            device_class: deviceClass,
            brand: 'LOCAL TEST',
            model,
            serial_number: serialNumber,
            accreditation_reference: LOCAL_LABEL,
            accreditation_valid_from: now,
            accreditation_valid_until: validUntil,
            status: 'accredited',
            verification_status: 'verified',
            verified_by_actor_type: 'tenant_master_admin',
            verified_by_user_id: tenantAdmin.user_id,
            verified_at: now,
            verification_note: `${LOCAL_LABEL}; synthetic fixture only; no physical device evidence.`,
            verification_evidence_ref: LOCAL_LABEL,
            metadata: { fixture: LOCAL_LABEL, synthetic: true }
        });
    }

    await tenant.update({
        name: spec.companyName,
        admin_email: account.email,
        admin_password_hash: account.password_hash,
        owner_dgfy_account_id: account.id,
        ownership_status: 'claimed',
        provisioning_source: 'platform_admin',
        compliance_mode_state: null,
        compliance_mode_choice_required: true,
        compliance_mode_selected_at: null,
        compliance_mode_selected_by: null,
        compliance_profile: makeComplianceProfile(spec),
        settings: { workflow_mode: 'fnb', fixture_label: LOCAL_LABEL, synthetic: true }
    });

    await DgfyAccountTenantMembership.create({
        dgfy_account_id: account.id,
        tenant_id: tenant.id,
        tenant_user_id: tenantAdmin.user_id,
        role: 'owner',
        status: 'accepted',
        source: 'admin_provisioned',
        accepted_at: now
    });

    return {
        fixture_key: spec.key,
        company_name: spec.companyName,
        tenant_id: tenant.id,
        database_name: context.dbName,
        location_id: location.location_id,
        terminal_id: spec.terminalId,
        taxpayer_type: spec.taxpayerType,
        tenant_admin_user_id: tenantAdmin.user_id,
        item_ids: items.map((item) => item.item_id),
        fiscal_terminal_registration_id: fiscalRegistration.pos_fiscal_terminal_registration_id,
        label: LOCAL_LABEL,
        synthetic: true
    };
};

const main = async () => {
    assertLocalOnlyEnvironment();

    const accountEmail = String(process.env.BIR_LOCAL_EMAIL || process.env.SMOKE_DGFY_EMAIL || '').trim().toLowerCase();
    if (!accountEmail) {
        throw new Error('Set BIR_LOCAL_EMAIL to an existing local DGFY account email before provisioning fixtures.');
    }

    const account = await DgfyAccount.findOne({ where: { email: accountEmail, deleted_at: null } });
    if (!account) {
        throw new Error(`The local DGFY account ${accountEmail} was not found; no fixture was created.`);
    }

    const createdContexts = [];
    try {
        const fixtures = [];
        for (const spec of fixtureSpecs) {
            const context = await createTestTenant(`bir_${spec.key}`);
            createdContexts.push(context);
            fixtures.push(await seedFixture({ context, account, spec }));
        }

        await fs.mkdir(evidenceDirectory, { recursive: true });
        const manifest = {
            generated_at: new Date().toISOString(),
            scope: 'local-only',
            label: LOCAL_LABEL,
            synthetic: true,
            warning: 'Disposable local fixtures only. Do not submit as BIR evidence and do not use outside local development.',
            account_email: accountEmail,
            fixtures
        };
        const manifestPath = path.join(evidenceDirectory, 'fixtures.json');
        await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

        console.log(JSON.stringify({
            success: true,
            label: LOCAL_LABEL,
            manifest_path: manifestPath,
            fixtures
        }, null, 2));
    } catch (error) {
        for (const context of createdContexts.reverse()) {
            if (!String(context.dbName || '').startsWith(LOCAL_DB_PREFIX)) continue;
            await destroyTestTenant(context);
        }
        throw error;
    } finally {
        await landlordSequelize.close().catch(() => null);
    }
};

main().catch((error) => {
    console.error(`[BIR local fixtures] ${error.message}`);
    process.exitCode = 1;
});
