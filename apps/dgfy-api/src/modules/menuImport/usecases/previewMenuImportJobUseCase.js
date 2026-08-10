import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mergeMenuImportItems } from '../support/mergeMenuImportItems.js';
import { MENU_IMPORT_MAX_MERGED_ITEMS } from '../../../config/menuImportFeature.js';
import { normalizeCategoryName, categoryMatchKey } from '../../../utils/menuCategoryName.js';

const TERMINAL_STATUSES = new Set(['completed', 'completed_with_errors', 'failed']);

// Same businessCode convention as createMenuImportJobUseCase.js — see that
// file's comment for why feature-specific reasons live in details.code
// rather than DomainErrorCode.
const failWithCode = (message, { statusCode = 400, code = DomainErrorCode.VALIDATION_FAILED, businessCode = null, details = null } = {}) => (
    fail(new DomainError(code, message, {
        statusCode,
        details: { ...(details || {}), ...(businessCode ? { code: businessCode } : {}) }
    }))
);

const buildBatchToken = (jobId) => jobId.replace(/-/g, '').slice(0, 8).toUpperCase();

/**
 * Distinct menu categories across the merged items, with how many items each
 * covers and whether the model inferred it. Lets the wizard tell the user what
 * confirming will create before they confirm it, rather than discovering new
 * categories after the fact.
 *
 * Deliberately does NOT check which categories already exist as ItemFolders —
 * that is a tenant DB read, and this use case runs off Redis job state only.
 * services/menuImportCategoryService.js resolves existing-vs-new at confirm
 * time, where it holds the tenant context.
 *
 * @param {Array<{section: string|null, section_inferred: boolean}>} mergedItems
 * @returns {Array<{name: string, item_count: number, inferred: boolean}>}
 */
const summarizeCategories = (mergedItems) => {
    const byKey = new Map();
    for (const item of mergedItems) {
        const name = normalizeCategoryName(item?.section);
        if (!name) continue;
        const key = categoryMatchKey(name);
        const entry = byKey.get(key) || { name, item_count: 0, inferred: true };
        entry.item_count += 1;
        // A category counts as printed as soon as any one of its items had it
        // printed on the menu.
        if (!item.section_inferred) entry.inferred = false;
        byKey.set(key, entry);
    }
    return [...byKey.values()];
};

/**
 * Merges a completed batch job's per-file extracted items (D4: dedup by
 * normalized name, price conflicts surfaced not resolved, near-duplicates
 * flagged for review only — see mergeMenuImportItems.js), then hands the
 * result through the same signed-CSV preview pipeline
 * (previewItemsImportUseCase) the single-file PDF path already uses, so
 * batch rows get identical validation.
 *
 * @param {Object} deps
 * @param {Object} deps.menuImportJobRepository
 * @param {Function} deps.previewItemsImportUseCase - ({csvContent}) => ApplicationResult
 * @param {Function} deps.buildSignedCsv - (items, {skuPrefix, batchToken}) => string
 */
export const buildPreviewMenuImportJobUseCase = ({ menuImportJobRepository, previewItemsImportUseCase, buildSignedCsv }) => {
    return async ({ tenantId, jobId }) => {
        if (typeof jobId !== 'string' || !jobId.trim()) {
            return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'jobId is required.', { statusCode: 400 }));
        }

        const job = await menuImportJobRepository.readJob({ tenantId, jobId });
        if (!job) {
            return fail(new DomainError(
                DomainErrorCode.RESOURCE_NOT_FOUND,
                "This import job wasn't found — it may have expired (jobs are kept for 1 hour). Start a new import.",
                { statusCode: 404, details: { code: 'JOB_EXPIRED_OR_NOT_FOUND' } }
            ));
        }

        if (!TERMINAL_STATUSES.has(job.status)) {
            return failWithCode(
                'This import job is still processing. Poll GET /import/menu/jobs/:jobId until it reaches a terminal status before previewing.',
                { statusCode: 409, code: DomainErrorCode.CONFLICT, businessCode: 'JOB_NOT_READY', details: { status: job.status } }
            );
        }

        const completedFiles = job.files.filter((file) => file.status === 'completed');
        const items = completedFiles.flatMap((file) => (Array.isArray(file.items) ? file.items : []));
        if (items.length === 0) {
            return failWithCode(
                'No extracted items are available to preview for this job.',
                { businessCode: 'NO_ITEMS_TO_PREVIEW' }
            );
        }

        const { mergedItems, conflicts, nearDuplicates, itemsBeforeDedup, itemsAfterDedup } = mergeMenuImportItems(items);

        if (mergedItems.length > MENU_IMPORT_MAX_MERGED_ITEMS) {
            return failWithCode(
                `A batch may contain at most ${MENU_IMPORT_MAX_MERGED_ITEMS} items after merging duplicates.`,
                {
                    businessCode: 'MERGED_ITEM_LIMIT_EXCEEDED',
                    details: { max_items: MENU_IMPORT_MAX_MERGED_ITEMS, submitted: mergedItems.length }
                }
            );
        }

        const csvContent = buildSignedCsv(mergedItems, { batchToken: buildBatchToken(jobId) });
        const previewResult = await previewItemsImportUseCase({ csvContent });
        if (!previewResult.success) {
            return previewResult;
        }

        // buildSignedCsv/previewImport both preserve row order, so row i
        // corresponds to mergedItems[i] — used to carry price_conflict
        // metadata onto the standard preview row shape without previewImport
        // needing to know anything about merge/dedup.
        const rows = (previewResult.data.rows || []).map((row, index) => {
            const mergedItem = mergedItems[index];
            if (!mergedItem) return row;
            const decorated = mergedItem.price_conflict
                ? { ...row, price_conflict: true, observed_prices: mergedItem.observed_prices }
                : { ...row };
            // Flag categories the model guessed rather than read off the menu, so
            // the wizard can mark them for review instead of presenting a guess
            // with the same confidence as a printed heading.
            if (mergedItem.section_inferred) decorated.category_inferred = true;
            return decorated;
        });

        return ok({
            ...previewResult.data,
            rows,
            categories: summarizeCategories(mergedItems),
            merge: {
                files_considered: completedFiles.length,
                files_excluded: job.files.length - completedFiles.length,
                items_before_dedup: itemsBeforeDedup,
                items_after_dedup: itemsAfterDedup,
                conflicts,
                near_duplicates: nearDuplicates
            }
        });
    };
};

export default buildPreviewMenuImportJobUseCase;
