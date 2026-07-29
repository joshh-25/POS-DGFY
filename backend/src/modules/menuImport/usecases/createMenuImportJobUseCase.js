import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { isFnbWorkflowMode } from '../../shared/constants/workflowModes.js';
import {
    MENU_IMPORT_MAX_FILES_PER_BATCH,
    MENU_IMPORT_DAILY_USD_BUDGET
} from '../../../config/menuImportFeature.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// businessCode goes into details.code — the DomainErrorCode enum itself is a
// small, frozen, cross-cutting set (VALIDATION_FAILED, etc.) that isn't meant
// to carry feature-specific reasons. Controllers surface details.code as the
// client-facing `error_code` when present, falling back to the generic
// DomainErrorCode otherwise — see menuImportBatchHandlers.js.
const failWithCode = (message, { statusCode = 400, code = DomainErrorCode.VALIDATION_FAILED, businessCode = null, details = null } = {}) => (
    fail(new DomainError(code, message, {
        statusCode,
        details: { ...(details || {}), ...(businessCode ? { code: businessCode } : {}) }
    }))
);

/**
 * Creates a batch menu import job: validates the file count, confirms the
 * tenant is in Food & Beverage workflow mode (the only mode the 'menu_item'
 * preset supports), enforces the daily AI-spend budget, then persists the job
 * and enqueues one extraction task per file.
 *
 * All tenant-scoped checks happen here, in request context — the worker that
 * later drains the queue touches no tenant database (see this module's
 * README and the menu batch import ADR).
 *
 * @param {Object} deps
 * @param {Object} deps.menuImportJobRepository
 * @param {Object} deps.menuImportBudgetRepository
 * @param {Object} deps.menuExtractionService - must expose resolveTenantWorkflowMode()
 */
export const buildCreateMenuImportJobUseCase = ({ menuImportJobRepository, menuImportBudgetRepository, menuExtractionService }) => {
    return async ({ tenantId, userId, files }) => {
        if (!Array.isArray(files) || files.length === 0) {
            return failWithCode('At least one file is required.', { businessCode: 'NO_FILES_PROVIDED' });
        }

        if (files.length > MENU_IMPORT_MAX_FILES_PER_BATCH) {
            return failWithCode(
                `A batch may contain at most ${MENU_IMPORT_MAX_FILES_PER_BATCH} files.`,
                {
                    businessCode: 'TOO_MANY_FILES',
                    details: { max_files: MENU_IMPORT_MAX_FILES_PER_BATCH, submitted: files.length }
                }
            );
        }

        if (!menuImportJobRepository.isMenuImportQueueAvailable()) {
            return failWithCode(
                'Menu import queue is temporarily unavailable.',
                { statusCode: 503, code: DomainErrorCode.SERVICE_UNAVAILABLE, businessCode: 'QUEUE_UNAVAILABLE' }
            );
        }

        let tenantWorkflowMode;
        try {
            tenantWorkflowMode = await menuExtractionService.resolveTenantWorkflowMode();
        } catch {
            return failWithCode(
                'Failed to resolve this store\'s workflow mode.',
                { statusCode: 500, code: DomainErrorCode.INTERNAL_ERROR, businessCode: 'WORKFLOW_MODE_LOOKUP_FAILED' }
            );
        }

        if (!isFnbWorkflowMode(tenantWorkflowMode)) {
            return failWithCode(
                'Menu import is only available for Food & Beverage workflow mode businesses.',
                {
                    statusCode: 422,
                    businessCode: 'WORKFLOW_MODE_NOT_FNB',
                    details: { tenant_workflow_mode: tenantWorkflowMode }
                }
            );
        }

        const since = new Date(Date.now() - ONE_DAY_MS);
        const spentToday = await menuImportBudgetRepository.getTenantAiSpendSince(tenantId, since);
        if (spentToday >= MENU_IMPORT_DAILY_USD_BUDGET) {
            return failWithCode(
                'This store has reached its daily AI menu-import budget. Try again tomorrow.',
                {
                    statusCode: 429,
                    businessCode: 'MENU_IMPORT_BUDGET_EXCEEDED',
                    details: { spent_usd: spentToday, budget_usd: MENU_IMPORT_DAILY_USD_BUDGET }
                }
            );
        }

        try {
            const { jobId } = await menuImportJobRepository.createJob({ tenantId, userId, files });
            return ok({ job_id: jobId, total_files: files.length });
        } catch (error) {
            return failWithCode(
                'Failed to create menu import job.',
                { statusCode: 500, code: DomainErrorCode.INTERNAL_ERROR, businessCode: 'JOB_CREATE_FAILED', details: { message: error.message } }
            );
        }
    };
};

export default buildCreateMenuImportJobUseCase;
