import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { assertOnboardingRepositoryContract } from '../contracts/onboardingRepository.contract.js';
import {
  CORRECTED_ITEM_TAXONOMY_MODES,
  resolveItemPreset
} from '../../shared/constants/modeItemTaxonomy.js';
import {
  DEFAULT_WORKFLOW_MODE,
  normalizeWorkflowMode
} from '../../shared/constants/workflowModes.js';
import { normalizeStorefrontBusinessHours } from '../../shared/utils/storefrontBusinessHours.js';

const ONBOARDING_STATE_KEY = 'tenant_onboarding_state';
const ONBOARDING_STARTED_AT_KEY = 'tenant_onboarding_started_at';
const ONBOARDING_COMPLETED_AT_KEY = 'tenant_onboarding_completed_at';
const ONBOARDING_PROGRESS_KEY = 'tenant_onboarding_progress';
const POS_BUSINESS_NAME_KEY = 'pos_business_name';
const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';
const STOREFRONT_HOURS_KEY = 'storefront_hours';
const STORE_IS_VISIBLE_KEY = 'store_is_visible';
const ONBOARDING_COMPLETION_PRESETS_BY_MODE = Object.freeze({
  food_manufacturing: new Set(['finished_product']),
  msme: new Set(['product']),
  services: new Set(['service', 'physical_add_on']),
  fnb: new Set(['menu_item', 'packaged_beverage']),
  hospitality: new Set(['room_night', 'paid_amenity', 'minibar_retail_product', 'facility_booking'])
});

const ALLOWED_STATES = new Set(['not_started', 'in_progress', 'completed']);
const REQUIRED_CHECK_KEYS = Object.freeze([
  'store_name_ready',
  'has_primary_storefront_location',
  'has_priced_starter_item'
]);
const MAX_STEP_PAYLOAD_BYTES = 16 * 1024;
const MAX_PROGRESS_PAYLOAD_BYTES = 64 * 1024;

const nowIso = () => new Date().toISOString();

const parseJsonLoose = (rawValue, fallback = {}) => {
  if (rawValue == null) return fallback;
  if (typeof rawValue === 'object') return rawValue;
  try {
    const parsed = JSON.parse(String(rawValue));
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // noop
  }
  return fallback;
};

const sanitizeState = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (ALLOWED_STATES.has(normalized)) return normalized;
  return 'not_started';
};

const sanitizeStepKey = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9_-]/g, '_')
  .slice(0, 80);

const toBoolean = (value) => value === true;

const normalizeChecklist = (rawChecklist = {}) => {
  const checklist = {
    store_name_ready: toBoolean(rawChecklist.store_name_ready),
    has_primary_storefront_location: toBoolean(rawChecklist.has_primary_storefront_location),
    has_priced_starter_item: toBoolean(rawChecklist.has_priced_starter_item)
  };
  const requiredTotal = REQUIRED_CHECK_KEYS.length;
  const completedRequiredCount = REQUIRED_CHECK_KEYS.filter((key) => checklist[key] === true).length;

  return {
    checklist,
    required_keys: REQUIRED_CHECK_KEYS,
    required_total: requiredTotal,
    completed_required_count: completedRequiredCount,
    is_ready: completedRequiredCount === requiredTotal,
    missing_requirements: REQUIRED_CHECK_KEYS.filter((key) => checklist[key] !== true)
  };
};

const normalizeProgress = (rawValue = {}) => {
  const normalized = rawValue && typeof rawValue === 'object' ? rawValue : {};
  const stepPayloads = normalized.step_payloads && typeof normalized.step_payloads === 'object'
    ? normalized.step_payloads
    : {};

  const nextProgress = {
    step_payloads: stepPayloads,
    checklist_snapshot: normalizeChecklist(normalized.checklist_snapshot?.checklist || {})
  };
  if (normalized.classification_snapshot && typeof normalized.classification_snapshot === 'object') {
    nextProgress.classification_snapshot = normalized.classification_snapshot;
  }
  return nextProgress;
};

const buildDefaultProgress = () => ({
  step_payloads: {},
  checklist_snapshot: normalizeChecklist({})
});

const modelHasColumn = (Model, columnName) => {
  if (!Model || !Model.rawAttributes || !columnName) return false;
  const attrs = Object.values(Model.rawAttributes);
  return attrs.some((attr) => attr?.fieldName === columnName || attr?.field === columnName);
};

const buildPricedStarterItemWhere = (Item) => {
  const where = {};
  if (modelHasColumn(Item, 'deleted_at')) where.deleted_at = null;
  if (modelHasColumn(Item, 'status')) where.status = 'active';
  if (modelHasColumn(Item, 'is_active')) where.is_active = true;
  if (modelHasColumn(Item, 'default_sale_price')) where.default_sale_price = { [Op.gt]: 0 };
  return where;
};

const toPlain = (value) => (
  value && typeof value.toJSON === 'function'
    ? value.toJSON()
    : value
);

const itemHasModeValidPreset = ({ item, workflowMode }) => {
  const mode = normalizeWorkflowMode(workflowMode);
  if (!CORRECTED_ITEM_TAXONOMY_MODES.includes(mode)) return true;

  const presetKey = String(item?.mode_item_preset || '').trim();
  const completionPresets = ONBOARDING_COMPLETION_PRESETS_BY_MODE[mode];
  if (completionPresets && !completionPresets.has(presetKey)) return false;
  return Boolean(presetKey && resolveItemPreset(mode, presetKey));
};

const countPricedStarterItems = async ({ Item, transaction = null, workflowMode = DEFAULT_WORKFLOW_MODE } = {}) => {
  if (!Item) return 0;
  if (!modelHasColumn(Item, 'default_sale_price')) return 0;
  const batchSize = 500;
  let offset = 0;
  const attributes = [
    'item_id',
    'name',
    'sku_code',
    'category',
    'product_type',
    'mode_item_preset',
    'status',
    'default_sale_price',
    'current_stock'
  ].filter((column) => modelHasColumn(Item, column));

  while (true) {
    const rows = await Item.findAll({
      where: buildPricedStarterItemWhere(Item),
      attributes,
      order: [['item_id', 'ASC']],
      limit: batchSize,
      offset,
      ...(transaction ? { transaction } : {})
    });
    if (!rows.length) return 0;

    if (rows.some((row) => {
      const item = toPlain(row);
      return itemHasModeValidPreset({ item, workflowMode });
    })) {
      return 1;
    }

    if (rows.length < batchSize) return 0;
    offset += batchSize;
  }
};

const countHospitalityStarterRooms = async ({ transaction = null } = {}) => {
  const HospitalityRoomType = dbStore.get('HospitalityRoomType');
  const HospitalityRoom = dbStore.get('HospitalityRoom');
  if (!HospitalityRoomType || !HospitalityRoom) return 0;

  const roomType = await HospitalityRoomType.findOne({
    where: {
      is_active: true,
      default_rate: { [Op.gt]: 0 }
    },
    attributes: ['room_type_id'],
    ...(transaction ? { transaction } : {})
  });
  if (!roomType) return 0;

  return HospitalityRoom.count({
    where: {
      room_type_id: roomType.room_type_id,
      is_active: true
    },
    ...(transaction ? { transaction } : {})
  });
};

const getSettingRows = async (SystemSetting, keys = [], { transaction = null } = {}) => {
  const rows = await SystemSetting.findAll({
    where: {
      setting_key: keys
    },
    ...(transaction ? { transaction } : {})
  });
  const map = new Map();
  rows.forEach((row) => {
    map.set(row.setting_key, row);
  });
  return map;
};

const upsertSetting = async (SystemSetting, rowMap, {
  key,
  value,
  dataType = 'string',
  description = '',
  transaction = null
}) => {
  const existing = rowMap.get(key);
  if (existing) {
    await existing.update({
      setting_value: dataType === 'json' ? JSON.stringify(value) : String(value || ''),
      data_type: dataType,
      description: description || existing.description,
      updated_at: new Date()
    }, {
      ...(transaction ? { transaction } : {})
    });
    return;
  }

  const created = await SystemSetting.create({
    setting_key: key,
    setting_value: dataType === 'json' ? JSON.stringify(value) : String(value || ''),
    data_type: dataType,
    description: description || `Auto-created onboarding setting: ${key}`
  }, {
    ...(transaction ? { transaction } : {})
  });
  rowMap.set(key, created);
};

const readSettingValue = async (SystemSetting, key, { transaction = null, defaultValue = '' } = {}) => {
  if (!SystemSetting) return defaultValue;
  const row = await SystemSetting.findOne({
    where: { setting_key: key },
    ...(transaction ? { transaction } : {})
  });
  const value = String(row?.setting_value || '').trim();
  return value || defaultValue;
};

const computeChecklist = async ({ storeNameBaseline = '', transaction = null } = {}) => {
  const store = dbStore.getStore() || {};
  const contextTenantName = String(store?.tenantName || '').trim();
  const baselineName = String(storeNameBaseline || '').trim();

  const TenantLocation = dbStore.get('TenantLocation');
  const Item = dbStore.get('Item');
  const SystemSetting = dbStore.get('SystemSetting');

  const fallbackBusinessName = await readSettingValue(SystemSetting, POS_BUSINESS_NAME_KEY, { transaction });
  const workflowMode = await readSettingValue(SystemSetting, WORKFLOW_MODE_SETTING_KEY, {
    transaction,
    defaultValue: DEFAULT_WORKFLOW_MODE
  });
  const storeIsVisible = await readSettingValue(SystemSetting, STORE_IS_VISIBLE_KEY, {
    transaction,
    defaultValue: 'false'
  });
  const publicStorefrontEnabled = storeIsVisible === true || String(storeIsVisible || '').trim().toLowerCase() === 'true';
  const normalizedWorkflowMode = normalizeWorkflowMode(workflowMode);

  const [primaryActiveLocationCount, pricedStarterItemCount] = await Promise.all([
    TenantLocation ? TenantLocation.count({
      where: { is_active: true, is_primary_storefront: true },
      ...(transaction ? { transaction } : {})
    }) : 0,
    normalizedWorkflowMode === 'hospitality'
      ? countHospitalityStarterRooms({ transaction })
      : countPricedStarterItems({ Item, transaction, workflowMode: normalizedWorkflowMode })
  ]);

  const resolvedStoreName = baselineName || contextTenantName || fallbackBusinessName;

  return normalizeChecklist({
    store_name_ready: resolvedStoreName.length > 0,
    has_primary_storefront_location: publicStorefrontEnabled ? primaryActiveLocationCount > 0 : true,
    has_priced_starter_item: pricedStarterItemCount > 0
  });
};

const readOnboardingSettings = async ({ transaction = null } = {}) => {
  const SystemSetting = dbStore.get('SystemSetting');
  const rowMap = await getSettingRows(SystemSetting, [
    ONBOARDING_STATE_KEY,
    ONBOARDING_STARTED_AT_KEY,
    ONBOARDING_COMPLETED_AT_KEY,
    ONBOARDING_PROGRESS_KEY
  ], { transaction });

  const state = sanitizeState(rowMap.get(ONBOARDING_STATE_KEY)?.setting_value);
  const startedAt = String(rowMap.get(ONBOARDING_STARTED_AT_KEY)?.setting_value || '').trim() || null;
  const completedAt = String(rowMap.get(ONBOARDING_COMPLETED_AT_KEY)?.setting_value || '').trim() || null;
  const rawProgress = parseJsonLoose(rowMap.get(ONBOARDING_PROGRESS_KEY)?.setting_value, buildDefaultProgress());

  return {
    SystemSetting,
    rowMap,
    state,
    startedAt,
    completedAt,
    progress: normalizeProgress(rawProgress)
  };
};

const toResponsePayload = ({ state, startedAt, completedAt, progress, checklist }) => ({
  tenant_onboarding_state: state,
  tenant_onboarding_started_at: startedAt,
  tenant_onboarding_completed_at: completedAt,
  tenant_onboarding_progress: {
    ...progress,
    checklist_snapshot: checklist
  }
});

const validatePayloadSizes = ({ stepPayload = {}, nextProgress = null } = {}) => {
  const serializedStepPayload = JSON.stringify(stepPayload || {});
  if (Buffer.byteLength(serializedStepPayload, 'utf8') > MAX_STEP_PAYLOAD_BYTES) {
    const error = new Error('Onboarding step payload exceeds size limit');
    error.statusCode = 422;
    error.details = {
      max_bytes: MAX_STEP_PAYLOAD_BYTES
    };
    throw error;
  }

  if (!nextProgress) return;

  const serializedProgress = JSON.stringify(nextProgress);
  if (Buffer.byteLength(serializedProgress, 'utf8') > MAX_PROGRESS_PAYLOAD_BYTES) {
    const error = new Error('Onboarding progress payload exceeds size limit');
    error.statusCode = 422;
    error.details = {
      max_bytes: MAX_PROGRESS_PAYLOAD_BYTES
    };
    throw error;
  }
};

export const onboardingRepository = {
  async getStatus({ storeNameBaseline = '' } = {}) {
    const { state, startedAt, completedAt, progress } = await readOnboardingSettings();
    const checklist = await computeChecklist({ storeNameBaseline });

    return toResponsePayload({
      state,
      startedAt,
      completedAt,
      progress,
      checklist
    });
  },

  async saveStep({ stepKey, payload = {}, storeNameBaseline = '' }) {
    const safeStepKey = sanitizeStepKey(stepKey);
    if (!safeStepKey) {
      const error = new Error('step_key is required');
      error.statusCode = 422;
      throw error;
    }

    const normalizedPayload = payload && typeof payload === 'object' ? payload : {};
    validatePayloadSizes({ stepPayload: normalizedPayload });

    const SystemSetting = dbStore.get('SystemSetting');
    let responsePayload = null;

    await SystemSetting.sequelize.transaction(async (transaction) => {
      const {
        rowMap,
        state,
        startedAt,
        completedAt,
        progress
      } = await readOnboardingSettings({ transaction });

      const checklist = await computeChecklist({ storeNameBaseline, transaction });
      const nextState = state === 'completed' ? 'completed' : (state === 'not_started' ? 'in_progress' : state);
      const nextStartedAt = startedAt || nowIso();
      const nextCompletedAt = completedAt;

      const nextProgress = {
        ...progress,
        step_payloads: {
          ...progress.step_payloads,
          [safeStepKey]: normalizedPayload
        },
        checklist_snapshot: checklist
      };
      validatePayloadSizes({ nextProgress });

      await upsertSetting(SystemSetting, rowMap, {
        key: ONBOARDING_STATE_KEY,
        value: nextState,
        dataType: 'string',
        description: 'Tenant onboarding state (not_started | in_progress | completed)',
        transaction
      });
      await upsertSetting(SystemSetting, rowMap, {
        key: ONBOARDING_STARTED_AT_KEY,
        value: nextStartedAt || '',
        dataType: 'string',
        description: 'ISO timestamp for tenant onboarding start',
        transaction
      });
      await upsertSetting(SystemSetting, rowMap, {
        key: ONBOARDING_COMPLETED_AT_KEY,
        value: nextCompletedAt || '',
        dataType: 'string',
        description: 'ISO timestamp for tenant onboarding completion',
        transaction
      });
      await upsertSetting(SystemSetting, rowMap, {
        key: ONBOARDING_PROGRESS_KEY,
        value: nextProgress,
        dataType: 'json',
        description: 'Tenant onboarding progress and latest checklist snapshot',
        transaction
      });
      if (safeStepKey === 'primary_location' && normalizedPayload.business_hours) {
        const storefrontHoursMap = await getSettingRows(SystemSetting, [STOREFRONT_HOURS_KEY], { transaction });
        await upsertSetting(SystemSetting, storefrontHoursMap, {
          key: STOREFRONT_HOURS_KEY,
          value: normalizeStorefrontBusinessHours(normalizedPayload.business_hours),
          dataType: 'json',
          description: 'Public storefront business hours and checkout availability schedule',
          transaction
        });
      }
      if (
        safeStepKey === 'primary_location'
        && Object.prototype.hasOwnProperty.call(normalizedPayload, 'public_storefront_visible')
      ) {
        const storefrontVisibilityMap = await getSettingRows(SystemSetting, [STORE_IS_VISIBLE_KEY], { transaction });
        await upsertSetting(SystemSetting, storefrontVisibilityMap, {
          key: STORE_IS_VISIBLE_KEY,
          value: normalizedPayload.public_storefront_visible === true,
          dataType: 'boolean',
          description: 'Controls whether the tenant appears in public discovery and public storefront profile reads',
          transaction
        });
      }
      const refreshedChecklist = await computeChecklist({ storeNameBaseline, transaction });
      const refreshedProgress = {
        ...nextProgress,
        checklist_snapshot: refreshedChecklist
      };
      await upsertSetting(SystemSetting, rowMap, {
        key: ONBOARDING_PROGRESS_KEY,
        value: refreshedProgress,
        dataType: 'json',
        description: 'Tenant onboarding progress and latest checklist snapshot',
        transaction
      });
      responsePayload = toResponsePayload({
        state: nextState,
        startedAt: nextStartedAt,
        completedAt: nextCompletedAt,
        progress: refreshedProgress,
        checklist: refreshedChecklist
      });
    });

    return responsePayload;
  },

  async complete({ storeNameBaseline = '' } = {}) {
    const SystemSetting = dbStore.get('SystemSetting');
    let responsePayload = null;

    await SystemSetting.sequelize.transaction(async (transaction) => {
      const {
        rowMap,
        startedAt,
        progress
      } = await readOnboardingSettings({ transaction });

      const checklist = await computeChecklist({ storeNameBaseline, transaction });
      if (!checklist.is_ready) {
        const error = new Error('Onboarding requirements are incomplete');
        error.statusCode = 422;
        error.details = {
          missing_requirements: checklist.missing_requirements,
          checklist
        };
        throw error;
      }

      const nextState = 'completed';
      const nextStartedAt = startedAt || nowIso();
      const nextCompletedAt = nowIso();
      const nextProgress = {
        ...progress,
        checklist_snapshot: checklist
      };
      validatePayloadSizes({ nextProgress });

      await upsertSetting(SystemSetting, rowMap, {
        key: ONBOARDING_STATE_KEY,
        value: nextState,
        dataType: 'string',
        description: 'Tenant onboarding state (not_started | in_progress | completed)',
        transaction
      });
      await upsertSetting(SystemSetting, rowMap, {
        key: ONBOARDING_STARTED_AT_KEY,
        value: nextStartedAt,
        dataType: 'string',
        description: 'ISO timestamp for tenant onboarding start',
        transaction
      });
      await upsertSetting(SystemSetting, rowMap, {
        key: ONBOARDING_COMPLETED_AT_KEY,
        value: nextCompletedAt,
        dataType: 'string',
        description: 'ISO timestamp for tenant onboarding completion',
        transaction
      });
      await upsertSetting(SystemSetting, rowMap, {
        key: ONBOARDING_PROGRESS_KEY,
        value: nextProgress,
        dataType: 'json',
        description: 'Tenant onboarding progress and latest checklist snapshot',
        transaction
      });

      responsePayload = toResponsePayload({
        state: nextState,
        startedAt: nextStartedAt,
        completedAt: nextCompletedAt,
        progress: nextProgress,
        checklist
      });
    });

    return responsePayload;
  }
};

assertOnboardingRepositoryContract(onboardingRepository);

export const onboardingSettingKeys = Object.freeze({
  state: ONBOARDING_STATE_KEY,
  startedAt: ONBOARDING_STARTED_AT_KEY,
  completedAt: ONBOARDING_COMPLETED_AT_KEY,
  progress: ONBOARDING_PROGRESS_KEY
});

export default onboardingRepository;
