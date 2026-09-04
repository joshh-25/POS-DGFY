// Phase 285 (#1318, C1) -- static regression guard for ADR 0080 Decision 1 [binding].
//
// Decision 1 names an exhaustive list of money-adjacent readers that must resolve
// items.folder_id (the primary category) alone, permanently: affiliate commission rate,
// voucher folder scope, F&B folder-inherited modifier group inheritance, and POS report
// category grouping/filtering. Widening any of them to read the {primary} ∪ {memberships}
// union requires a superseding ADR, not a routine PR.
//
// This phase adds a `secondary_categories` projection to exactly one surface -- the
// storefront catalog listing (storeRepository.js's listStoreCatalog / storeUseCases.js's
// serializeStoreCatalogItem). This test reads the six primary-only files' source directly
// (no mocking, no module graph -- a plain fs.readFileSync) and fails if a future change lets
// that projection, or the underlying membership lookup, leak into any of them.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

const PRIMARY_ONLY_FILES = [
    // Affiliate category commission rate resolution (resolveCategoryRateBps and its
    // storefront/POS folder_id_snapshot callers).
    'src/modules/dgfy/utils/affiliateCommissionAccrual.js',
    // Voucher folder scope resolution.
    'src/modules/vouchers/domain/voucherFolderScope.js',
    'src/modules/vouchers/repositories/voucherRepository.js',
    // F&B folder-inherited modifier group inheritance.
    'src/modules/fnb/repositories/fnbRepository.js',
    'src/modules/shared/utils/effectiveFnbModifierGroups.js',
    // POS report category grouping and filtering (buildReportInclude,
    // normalizeReportLineRows, resolveReportItemCategory, filters.category_id) -- a
    // DIFFERENT surface from the catalog-listing filter chips in the same file.
    'src/modules/pos/repositories/posRepository.js'
];

const FORBIDDEN_TOKENS = ['secondary_categories', 'attachSecondaryCategories', 'listItemFolderMemberships'];

describe('ADR 0080 Decision 1 [binding] -- primary-only readers stay untouched by the Phase 285 (#1318) storefront secondary-category projection', () => {
    PRIMARY_ONLY_FILES.forEach((relativePath) => {
        it(`${relativePath} does not reference the storefront secondary-category projection or its membership lookup`, () => {
            const absolutePath = path.join(backendRoot, relativePath);
            const source = fs.readFileSync(absolutePath, 'utf8');
            FORBIDDEN_TOKENS.forEach((token) => {
                expect(source).not.toContain(token);
            });
        });
    });
});
