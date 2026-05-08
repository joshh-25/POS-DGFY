import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapCsvUseCaseError } from './csvUseCaseError.js';
import {
  isWorkflowMode,
  WORKFLOW_MODE_VALUES
} from '../../shared/constants/workflowModes.js';

const parsePositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  if (!Number.isInteger(normalized) || normalized <= 0) return null;
  return normalized;
};

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const validTemplateTypes = ['items', 'products', 'master'];

const failWithValidation = (message) => fail(new DomainError(
  DomainErrorCode.VALIDATION_FAILED,
  message,
  { statusCode: 400 }
));

const normalizeServiceResult = (serviceResult, fallbackMessage) => {
  if (!serviceResult || typeof serviceResult !== 'object') {
    return ok(serviceResult);
  }

  if (serviceResult.success === false) {
    return fail(new DomainError(
      DomainErrorCode.VALIDATION_FAILED,
      serviceResult.error || fallbackMessage,
      { statusCode: 400, details: serviceResult.details || null }
    ));
  }

  return ok(serviceResult);
};

const withServiceExecution = async (fn, fallbackMessage) => {
  try {
    const result = await fn();
    return normalizeServiceResult(result, fallbackMessage);
  } catch (error) {
    return fail(mapCsvUseCaseError(error, fallbackMessage));
  }
};

export const buildExportByIdsUseCase = ({ csvExportService }) => {
  return async ({ itemIds, workflowMode, templateType }) => {
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return failWithValidation('itemIds must be a non-empty array');
    }

    if (templateType !== undefined && !validTemplateTypes.includes(templateType)) {
      return failWithValidation(`Invalid template type. Must be one of: ${validTemplateTypes.join(', ')}`);
    }

    if (workflowMode !== undefined && !isWorkflowMode(workflowMode)) {
      return failWithValidation(
        `Invalid workflow_mode. Must be one of: ${WORKFLOW_MODE_VALUES.join(', ')}`
      );
    }

    return withServiceExecution(
      () => csvExportService.exportByIds(itemIds, { workflowMode, templateType }),
      'Failed to export selected items'
    );
  };
};

export const buildExportFilteredUseCase = ({ csvExportService }) => {
  return async ({ filters, workflowMode, templateType }) => {
    if (filters !== undefined && !isPlainObject(filters)) {
      return failWithValidation('filters must be an object');
    }

    if (templateType !== undefined && !validTemplateTypes.includes(templateType)) {
      return failWithValidation(`Invalid template type. Must be one of: ${validTemplateTypes.join(', ')}`);
    }

    if (workflowMode !== undefined && !isWorkflowMode(workflowMode)) {
      return failWithValidation(
        `Invalid workflow_mode. Must be one of: ${WORKFLOW_MODE_VALUES.join(', ')}`
      );
    }

    return withServiceExecution(
      () => csvExportService.exportFiltered(filters || {}, { workflowMode, templateType }),
      'Failed to export filtered items'
    );
  };
};

export const buildExportAllItemsUseCase = ({ csvExportService }) => {
  return async ({ workflowMode, templateType } = {}) => {
    if (templateType !== undefined && !validTemplateTypes.includes(templateType)) {
      return failWithValidation(`Invalid template type. Must be one of: ${validTemplateTypes.join(', ')}`);
    }

    if (workflowMode !== undefined && !isWorkflowMode(workflowMode)) {
      return failWithValidation(
        `Invalid workflow_mode. Must be one of: ${WORKFLOW_MODE_VALUES.join(', ')}`
      );
    }

    return withServiceExecution(
      () => csvExportService.exportAll({ workflowMode, templateType }),
      'Failed to export all items'
    );
  };
};

export const buildPreviewItemsImportUseCase = ({ csvImportService }) => {
  return async ({ csvContent }) => {
    if (typeof csvContent !== 'string' || !csvContent.trim()) {
      return failWithValidation('csvContent must be a non-empty string');
    }

    return withServiceExecution(
      () => csvImportService.previewImport(csvContent),
      'Failed to preview item CSV import'
    );
  };
};

export const buildConfirmItemsImportUseCase = ({ csvImportService }) => {
  return async ({ rows, userId }) => {
    const normalizedUserId = parsePositiveInt(userId);
    if (!normalizedUserId) {
      return failWithValidation('userId must be a positive integer');
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return failWithValidation('rows must be a non-empty array');
    }

    return withServiceExecution(
      () => csvImportService.confirmImport(rows, normalizedUserId),
      'Failed to confirm item CSV import'
    );
  };
};

export const buildGetItemsTemplateHeadersUseCase = ({ csvImportService }) => {
  return async ({ templateType, workflowMode }) => {
    if (templateType !== undefined && !validTemplateTypes.includes(templateType)) {
      return failWithValidation(`Invalid template type. Must be one of: ${validTemplateTypes.join(', ')}`);
    }

    if (
      workflowMode !== undefined
      && !isWorkflowMode(workflowMode)
    ) {
      return failWithValidation(
        `Invalid workflow_mode. Must be one of: ${WORKFLOW_MODE_VALUES.join(', ')}`
      );
    }

    return withServiceExecution(
      () => csvImportService.getTemplateDefinition({
        templateType: templateType || 'master',
        workflowMode
      }),
      'Failed to retrieve item template definition'
    );
  };
};

export const buildExportSuppliersUseCase = ({ supplierCSVService }) => {
  return async ({ filters }) => {
    if (filters !== undefined && !isPlainObject(filters)) {
      return failWithValidation('filters must be an object');
    }

    return withServiceExecution(
      () => supplierCSVService.exportSuppliers(filters || {}),
      'Failed to export suppliers'
    );
  };
};

export const buildGetSupplierTemplateHeadersUseCase = ({ supplierCSVService }) => {
  return async () => withServiceExecution(
    () => supplierCSVService.getHeaders(),
    'Failed to retrieve supplier template headers'
  );
};

export const buildPreviewSuppliersImportUseCase = ({ supplierCSVService }) => {
  return async ({ csvContent }) => {
    if (typeof csvContent !== 'string' || !csvContent.trim()) {
      return failWithValidation('csvContent must be a non-empty string');
    }

    return withServiceExecution(
      () => supplierCSVService.previewImport(csvContent),
      'Failed to preview supplier CSV import'
    );
  };
};

export const buildConfirmSuppliersImportUseCase = ({ supplierCSVService }) => {
  return async ({ rows, userId }) => {
    const normalizedUserId = parsePositiveInt(userId);
    if (!normalizedUserId) {
      return failWithValidation('userId must be a positive integer');
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return failWithValidation('rows must be a non-empty array');
    }

    return withServiceExecution(
      () => supplierCSVService.confirmImport(rows, normalizedUserId),
      'Failed to confirm supplier CSV import'
    );
  };
};
