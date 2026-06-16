import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { unwrapApplicationResultOrThrow } from '../../shared/contracts/applicationResultHelpers.js';
import {
  DEFAULT_WORKFLOW_MODE,
  normalizeWorkflowMode
} from '../../shared/constants/workflowModes.js';
import {
  resolveItemPreset,
  resolveModeItemTaxonomy
} from '../../shared/constants/modeItemTaxonomy.js';

const WORKFLOW_MODE_SETTING_KEY = 'ops_workflow_mode';
const toMoneyOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const slugName = (value) => {
  const slug = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return slug || 'ITEM';
};

const buildSku = ({ name, rowNumber, attempt }) => {
  const suffix = attempt === 0 ? rowNumber : `${rowNumber}-${attempt + 1}`;
  return `ONB-${slugName(name)}-${suffix}`.slice(0, 50);
};

const isSkuConflict = (error) => (
  Number(error?.statusCode || error?.status || 0) === 409
  || /sku code already exists/i.test(String(error?.message || ''))
);

const mapErrorMessage = (error) => (
  error?.message || 'Failed to create onboarding item'
);

const toPositiveIntOrNull = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
};

const getWorkflowMode = async (getAllSettingsUseCase) => {
  const settings = unwrapApplicationResultOrThrow(
    await getAllSettingsUseCase(),
    'Failed to retrieve settings'
  );
  return normalizeWorkflowMode(settings?.[WORKFLOW_MODE_SETTING_KEY]?.value ?? DEFAULT_WORKFLOW_MODE);
};

const resolvePresetForMode = ({ workflowMode, presetKey }) => {
  const taxonomy = resolveModeItemTaxonomy(workflowMode);
  if (!taxonomy) {
    return {
      key: String(presetKey || 'default').trim() || 'default',
      category: 'product',
      product_type: 'finished_goods',
      default_unit: 'pcs',
      max_capacity: 100,
      fifo_enabled: true,
      stock_behavior: 'stock_bearing'
    };
  }

  return resolveItemPreset(workflowMode, presetKey);
};

const normalizeOnboardingPresetKey = ({ workflowMode, presetKey }) => {
  const normalizedPreset = String(presetKey || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

  if (normalizeWorkflowMode(workflowMode) === 'fnb' && ['ingredient', 'raw_material'].includes(normalizedPreset)) {
    return 'ingredient';
  }

  return normalizedPreset;
};

const validateRow = ({ row, workflowMode }) => {
  const errors = [];
  const name = String(row?.name || '').trim();
  const rawPresetKey = String(row?.mode_item_preset || '').trim();
  const presetKey = normalizeOnboardingPresetKey({ workflowMode, presetKey: rawPresetKey });
  const defaultSalePrice = toMoneyOrNull(row?.default_sale_price);

  if (!rawPresetKey) errors.push('Item type is required.');
  if (!name) errors.push('Item name is required.');
  if (defaultSalePrice === null || defaultSalePrice <= 0) {
    errors.push('Selling price must be greater than 0.');
  }

  const preset = rawPresetKey ? resolvePresetForMode({ workflowMode, presetKey }) : null;
  if (rawPresetKey && !preset) {
    errors.push(`Item type "${rawPresetKey}" is not valid for ${workflowMode} mode.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    normalized: {
      name,
      presetKey,
      preset,
      defaultSalePrice,
      costPerUnit: toMoneyOrNull(row?.cost_per_unit) ?? 0,
      currentStock: toMoneyOrNull(row?.current_stock) ?? 0,
      locationId: toPositiveIntOrNull(row?.location_id)
    }
  };
};

const buildItemPayload = ({ normalized, rowNumber, attempt }) => {
  const preset = normalized.preset;
  return {
    sku_code: buildSku({ name: normalized.name, rowNumber, attempt }),
    name: normalized.name,
    category: preset.category,
    product_type: preset.category === 'product' ? preset.product_type : null,
    mode_item_preset: normalized.presetKey,
    description: '',
    unit_of_measure: preset.default_unit || 'pcs',
    cost_per_unit: normalized.costPerUnit,
    default_sale_price: normalized.defaultSalePrice,
    vat_type: 'vatable',
    max_capacity: Number(preset.max_capacity || 100),
    current_stock: normalized.currentStock,
    fifo_enabled: preset.fifo_enabled !== false,
    status: 'active',
    ...(normalized.locationId ? { location_id: normalized.locationId } : {})
  };
};

const toPlain = (value) => (
  value && typeof value.toJSON === 'function'
    ? value.toJSON()
    : value
);

const findExistingBySku = async ({ findItemsBySkuCodes, skuCode }) => {
  if (typeof findItemsBySkuCodes !== 'function' || !skuCode) return null;
  const rows = await findItemsBySkuCodes([skuCode]);
  return toPlain(Array.isArray(rows) ? rows[0] : null) || null;
};

const isSameOnboardingItem = ({ existing, payload }) => {
  if (!existing || !payload) return false;
  return String(existing.sku_code || '').trim() === String(payload.sku_code || '').trim()
    && String(existing.name || '').trim() === String(payload.name || '').trim()
    && String(existing.mode_item_preset || '').trim() === String(payload.mode_item_preset || '').trim()
    && Number(existing.default_sale_price) === Number(payload.default_sale_price);
};

export const buildBulkCreateOnboardingItemsUseCase = ({
  createItemUseCase,
  getAllSettingsUseCase,
  findItemsBySkuCodes = null
}) => {
  return async ({ rows = [], userId = null } = {}) => {
    if (!Array.isArray(rows) || rows.length === 0) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'rows must contain at least one onboarding item',
        { statusCode: 422 }
      ));
    }

    try {
      const workflowMode = await getWorkflowMode(getAllSettingsUseCase);
      const results = [];
      const seenClientRowIds = new Set();

      for (const [index, row] of rows.entries()) {
        const rowNumber = index + 1;
        const clientRowId = String(row?.client_row_id || `row-${rowNumber}`).trim();
        if (seenClientRowIds.has(clientRowId)) {
          results.push({
            client_row_id: clientRowId,
            row_number: rowNumber,
            status: 'failed',
            item: null,
            errors: ['Duplicate onboarding row key in request. Refresh the row before saving again.']
          });
          continue;
        }
        seenClientRowIds.add(clientRowId);

        const validation = validateRow({ row, workflowMode });

        if (!validation.ok) {
          results.push({
            client_row_id: clientRowId,
            row_number: rowNumber,
            status: 'failed',
            item: null,
            errors: validation.errors
          });
          continue;
        }

        const itemPayload = buildItemPayload({
          normalized: validation.normalized,
          rowNumber,
          attempt: 0
        });
        let created = null;
        let finalError = null;
        try {
          created = await createItemUseCase({
            itemData: itemPayload,
            userId
          });
        } catch (error) {
          finalError = error;
        }

        if (created) {
          results.push({
            client_row_id: clientRowId,
            row_number: rowNumber,
            status: 'created',
            item: created,
            errors: []
          });
        } else {
          const existing = isSkuConflict(finalError)
            ? await findExistingBySku({ findItemsBySkuCodes, skuCode: itemPayload.sku_code })
            : null;
          if (isSameOnboardingItem({ existing, payload: itemPayload })) {
            results.push({
              client_row_id: clientRowId,
              row_number: rowNumber,
              status: 'created',
              item: existing,
              idempotent_replay: true,
              errors: []
            });
            continue;
          }

          results.push({
            client_row_id: clientRowId,
            row_number: rowNumber,
            status: 'failed',
            item: null,
            errors: [
              isSkuConflict(finalError)
                ? 'An onboarding item for this row already exists or the generated SKU is already in use.'
                : mapErrorMessage(finalError)
            ]
          });
        }
      }

      const createdCount = results.filter((row) => row.status === 'created').length;
      return ok({
        workflow_mode: workflowMode,
        summary: {
          total: results.length,
          created: createdCount,
          failed: results.length - createdCount
        },
        results
      });
    } catch (error) {
      return fail(new DomainError(
        DomainErrorCode.INTERNAL_ERROR,
        error?.message || 'Failed to create onboarding items',
        { statusCode: error?.statusCode || 500, details: error?.details || null }
      ));
    }
  };
};

export default buildBulkCreateOnboardingItemsUseCase;
