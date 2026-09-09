import { describe, expect, it } from 'vitest';
import {
    buildCompliancePolicyBlockerMessage,
    buildMissingFieldsMessage,
    buildOfflineCheckoutHistoryRow,
    calculateGovernedDiscount,
    formatQuantity,
    formatSplitPaymentMethod,
    getCartLineSubtotal,
    getPriceOverrideReasonValidationMessage,
    inferReceiptContract,
    isPaymentAmountSufficient,
    isSeniorPwdDiscountEligible,
    money,
    normalizeDiscountProfiles,
    normalizePromoCode,
    resolveEmployeeDiscountCreditPreference,
    resolvePosCatalogImageSources,
    resolvePosCatalogPreviewGallery,
    rowMatchesHistoryFilters,
    round4,
    sanitizeQuantityInput,
    toValidPercentage,
    VAT_RATE
} from '../posCheckoutTerminalUtils.js';
import {
    buildDiscountItemSelection,
    getSelectableDiscountLines,
    isStatutoryDiscountType
} from '../posDiscountSelection.js';

describe('POS checkout terminal pure utilities', () => {
    it('keeps money, quantity, percentage, and payment labels deterministic', () => {
        expect(money(12.5)).toBe('12.50');
        expect(round4(1.23456)).toBe(1.2346);
        expect(getCartLineSubtotal({ quantity: 2, sale_price: 150 })).toBe(300);
        expect(getCartLineSubtotal({ quantity: 1.25, sale_price: 90 })).toBe(112.5);
        expect(formatQuantity(2.5)).toBe('2.5');
        expect(formatQuantity('invalid')).toBe('0');
        expect(sanitizeQuantityInput('1a.2.3', true)).toBe('1.23');
        expect(sanitizeQuantityInput('1a.2', false)).toBe('12');
        expect(toValidPercentage(-4)).toBe(0);
        expect(toValidPercentage(140)).toBe(100);
        expect(formatSplitPaymentMethod('bank_transfer')).toBe('Bank Transfer');
        expect(formatSplitPaymentMethod('new_method')).toBe('New Method');
        expect(normalizePromoCode('  spring-2026-extra-long-code  ')).toBe('SPRING-2026-EXTRA-LONG-CODE');
        expect(isSeniorPwdDiscountEligible('1')).toBe(true);
        expect(isSeniorPwdDiscountEligible('true')).toBe(false);
    });

    it('compares checkout payments at the centavo precision shown to the cashier', () => {
        expect(isPaymentAmountSufficient(51.01, 51.0101)).toBe(true);
        expect(isPaymentAmountSufficient(51.00, 51.0101)).toBe(false);
        expect(isPaymentAmountSufficient(51.02, 51.0101)).toBe(true);
    });

    it('requires a reason only when a line price differs from its effective default', () => {
        expect(getPriceOverrideReasonValidationMessage({
            line: { item_id: 7, item_name: 'Coffee', sale_price: 125, price_override_reason: '' },
            effectiveDefaultSalePrice: 100
        })).toBe('Enter a price override reason of at least 3 characters for Coffee before checkout.');
        expect(getPriceOverrideReasonValidationMessage({
            line: { item_id: 7, item_name: 'Coffee', sale_price: 125, price_override_reason: 'Customer request' },
            effectiveDefaultSalePrice: 100
        })).toBeNull();
        expect(getPriceOverrideReasonValidationMessage({
            line: { item_id: 7, item_name: 'Coffee', sale_price: 100, price_override_reason: '' },
            effectiveDefaultSalePrice: 100
        })).toBeNull();
    });

    it('calculates no discount, selected percentage, fixed allocation, and statutory VAT removal', () => {
        const cart = [
            { line_key: 'a', item_id: 1, quantity: 1, sale_price: 112, vat_type: 'vatable' },
            { line_key: 'b', item_id: 2, quantity: 2, sale_price: 50, vat_type: 'zero_rated' }
        ];

        expect(calculateGovernedDiscount(cart, null)).toMatchObject({
            discountAmount: 0,
            total: 212
        });

        const percentage = calculateGovernedDiscount(cart, {
            type: 'promo',
            method: 'percentage',
            rate: 10,
            eligible_item_ids: [1]
        });
        expect(percentage.discountAmount).toBe(11.2);
        expect(percentage.lines.map((line) => line.discount_amount)).toEqual([11.2, 0]);
        expect(percentage.total).toBe(200.8);

        const fixed = calculateGovernedDiscount([
            { line_key: 'a', item_id: 1, quantity: 1, sale_price: 10 },
            { line_key: 'b', item_id: 2, quantity: 1, sale_price: 10 },
            { line_key: 'c', item_id: 3, quantity: 1, sale_price: 10 }
        ], { type: 'manual', method: 'fixed', amount: 1 });
        expect(fixed.discountAmount).toBe(1);
        expect(fixed.lines.map((line) => line.discount_amount)).toEqual([0.3333, 0.3333, 0.3334]);

        const statutory = calculateGovernedDiscount([
            { line_key: 'a', item_id: 1, quantity: 1, sale_price: 112, vat_type: 'vatable' }
        ], {
            type: 'senior',
            eligible_item_ids: [1]
        });
        expect(statutory.vatRemoved).toBe(12);
        expect(statutory.vatExemptAmount).toBe(100);
        expect(statutory.discountAmount).toBe(20);
        expect(statutory.total).toBe(80);
        expect(VAT_RATE).toBe(0.12);

        const partialEmployee = calculateGovernedDiscount([
            { line_key: 'a', item_id: 1, quantity: 2, sale_price: 100 }
        ], {
            type: 'employee',
            method: 'percentage',
            rate: 15,
            eligible_item_ids: [1],
            eligible_items: [{ item_id: 1, eligible_quantity: 0.5 }]
        });
        expect(partialEmployee.discountAmount).toBe(7.5);
        expect(partialEmployee.lines[0].eligible_quantity).toBe(0.5);
        expect(partialEmployee.total).toBe(192.5);
    });

    it('selects all discount items by default and preserves unchecked exclusions', () => {
        const cart = [
            { item_id: 1, quantity: 2, senior_pwd_discount_eligible: true },
            { item_id: 2, quantity: 1, senior_pwd_discount_eligible: true },
            { item_id: 3, quantity: 1, senior_pwd_discount_eligible: false }
        ];

        expect(isStatutoryDiscountType('pwd')).toBe(true);
        expect(getSelectableDiscountLines(cart, 'pwd')).toHaveLength(2);
        expect(getSelectableDiscountLines(cart, 'employee')).toHaveLength(3);

        const allItems = buildDiscountItemSelection({ cart, type: 'employee' });
        expect(allItems.eligible_item_ids).toEqual([1, 2, 3]);
        expect(allItems.eligible_items).toEqual([
            { line_ref: 'item-1-0', item_id: 1, eligible_quantity: 2 },
            { line_ref: 'item-2-1', item_id: 2, eligible_quantity: 1 },
            { line_ref: 'item-3-2', item_id: 3, eligible_quantity: 1 }
        ]);

        const excluded = buildDiscountItemSelection({
            cart,
            type: 'employee',
            draft: { eligible_item_ids: [1, 3] }
        });
        expect(excluded.eligible_item_ids).toEqual([1, 3]);

        const noneSelected = buildDiscountItemSelection({
            cart,
            type: 'employee',
            draft: { eligible_item_ids: [] },
            selectAllWhenEmpty: false
        });
        expect(noneSelected.eligible_item_ids).toEqual([]);
        expect(noneSelected.eligible_items).toEqual([]);
    });

    it('discounts only the selected cart line when duplicate lines share an item ID', () => {
        const duplicateLines = [
            { line_key: 'coffee-hot', item_id: 1, quantity: 1, sale_price: 100 },
            { line_key: 'coffee-cold', item_id: 1, quantity: 1, sale_price: 150 }
        ];
        const selection = buildDiscountItemSelection({
            cart: duplicateLines,
            type: 'employee',
            selectedLineRefs: ['coffee-hot']
        });

        expect(selection.eligible_items).toEqual([
            { line_ref: 'coffee-hot', item_id: 1, eligible_quantity: 1 }
        ]);
        const calculation = calculateGovernedDiscount(duplicateLines, {
            type: 'employee',
            method: 'percentage',
            rate: 10,
            ...selection
        });
        expect(calculation.discountAmount).toBe(10);
        expect(calculation.lines.map((line) => line.discount_amount)).toEqual([10, 0]);
    });

    it('normalizes setup and compliance messages without throwing on malformed input', () => {
        expect(normalizeDiscountProfiles('[{"name":" Staff ","percentage":140},{"name":"","percentage":5}]')).toEqual([
            { name: 'Staff', percentage: 100, active: true }
        ]);
        expect(normalizeDiscountProfiles('{bad json}')).toEqual([]);
        expect(buildMissingFieldsMessage({ response: { data: { errors: { missing_fields: ['terminal_id', 'location_id'] } } } }))
            .toBe('Missing POS setup fields: terminal_id, location_id');
        expect(buildMissingFieldsMessage({})).toBeNull();
        expect(buildCompliancePolicyBlockerMessage({ response: { data: { errors: { compliance: {
            reason_code: ' bsp_ops_registration_required ',
            obligations: ['Register the business']
        } } } } })).toMatchObject({
            reasonCode: 'BSP_OPS_REGISTRATION_REQUIRED',
            actionTarget: '/settings?tab=compliance#section-profile'
        });
        expect(buildCompliancePolicyBlockerMessage({})).toBeNull();
    });

    it('resolves one employee across global and item discounts without guessing across conflicts', () => {
        expect(resolveEmployeeDiscountCreditPreference(null, [{
            item_discount: { discount_type: 'employee', employee_directory_id: 44 }
        }])).toEqual({ preferredEmployeeId: 44, hasConflict: false });

        expect(resolveEmployeeDiscountCreditPreference(
            { type: 'employee', employee_directory_id: 44 },
            [{ item_discount: { discount_type: 'employee', employee_directory_id: '44' } }]
        )).toEqual({ preferredEmployeeId: 44, hasConflict: false });

        expect(resolveEmployeeDiscountCreditPreference(null, [
            { item_discount: { discount_type: 'employee', employee_directory_id: 44 } },
            { item_discount: { discount_type: 'employee', employee_directory_id: 45 } }
        ])).toEqual({ preferredEmployeeId: null, hasConflict: true });
    });

    it('builds searchable pending history rows and applies date/status filters', () => {
        const row = buildOfflineCheckoutHistoryRow({
            payload: {
                idempotency_key: 'abc123',
                payment_type: 'cash',
                offline_line_items_snapshot: [{ item_id: 9, item_name: 'Coffee', quantity: 2, sale_price: 45 }]
            },
            queuedAt: '2026-08-18T10:00:00.000Z',
            cartSubtotal: 90,
            calculatedDiscountAmount: 0,
            serviceFeeAmount: 0,
            restaurantServiceChargeAmount: 0,
            vatBreakdown: { vatableSales: 80.36, vatAmount: 9.64, vatExemptSales: 0, zeroRatedSales: 0 },
            cartTotal: 90,
            manualDiscountRate: 0,
            manualDiscountMode: 'percentage'
        });

        expect(row).toMatchObject({
            pos_transaction_id: 'offline-checkout-abc123',
            invoice_number: 'PENDING-ABC123',
            offline_sync_state: 'pending_sync',
            cashier: { username: 'Offline cashier' }
        });
        expect(row.lines[0]).toMatchObject({ item_id: 9, line_subtotal: 90 });
        expect(rowMatchesHistoryFilters(row, {
            historySearch: 'pending',
            historyPaymentType: 'cash',
            historyDateFrom: '2026-08-18',
            historyDateTo: '2026-08-18',
            historyStatus: 'pending_sync'
        })).toBe(true);
        const splitRow = {
            ...row,
            payment_type: 'cash',
            payment_breakdown: [
                { payment_type: 'gcash', amount: 365 },
                { payment_type: 'cash', amount: 100 }
            ]
        };
        expect(rowMatchesHistoryFilters(splitRow, { historyPaymentType: 'gcash' })).toBe(true);
        expect(rowMatchesHistoryFilters(splitRow, { historyPaymentType: 'cash' })).toBe(true);
        expect(rowMatchesHistoryFilters(splitRow, { historyPaymentType: 'card' })).toBe(false);
        expect(rowMatchesHistoryFilters(row, { historyStatus: 'completed' })).toBe(false);
        expect(buildOfflineCheckoutHistoryRow({ payload: {} })).toBeNull();
    });

    it('resolves image variants and receipt contracts predictably', () => {
        const imageSources = resolvePosCatalogImageSources({
            storefront_image_url: 'https://cdn.example.test/large.jpg',
            storefront_image_variants: {
                pos_thumbnail_url: 'https://cdn.example.test/pos-thumb.jpg',
                thumbnail_url: 'https://cdn.example.test/thumb.jpg',
                medium_url: 'https://cdn.example.test/medium.jpg',
                large_url: 'https://cdn.example.test/large.jpg'
            }
        });
        expect(imageSources.src).toBe('https://cdn.example.test/pos-thumb.jpg');
        expect(imageSources.srcSet).toBeUndefined();
        expect(imageSources.thumbnailFallbackSrc).toBe('https://cdn.example.test/thumb.jpg');
        expect(imageSources.configuredLargeSrc).toBe('https://cdn.example.test/large.jpg');
        expect(inferReceiptContract({ invoice_number: 'NFS-000001' })).toEqual({
            document_type: 'non_fiscal_slip',
            label: 'NON-FISCAL SLIP'
        });
        expect(inferReceiptContract({}, { document_type: 'fiscal_invoice', label: 'Custom' })).toEqual({
            document_type: 'fiscal_invoice',
            label: 'Custom'
        });
        expect(inferReceiptContract({})).toBeNull();
    });

    it('prefers a POS-specific override image over the Storefront fallback (#1635)', () => {
        // (a) both POS and Storefront images present -- POS-specific override
        // must win, matching posRepository.js's resolvePosDisplayImage() contract.
        const bothPresent = resolvePosCatalogImageSources({
            pos_image_url: 'https://cdn.example.test/pos/large.jpg',
            pos_image_variants: {
                thumbnail_url: 'https://cdn.example.test/pos/thumb.jpg',
                medium_url: 'https://cdn.example.test/pos/medium.jpg',
                large_url: 'https://cdn.example.test/pos/large.jpg'
            },
            storefront_image_url: 'https://cdn.example.test/storefront/large.jpg',
            storefront_image_variants: {
                thumbnail_url: 'https://cdn.example.test/storefront/thumb.jpg',
                medium_url: 'https://cdn.example.test/storefront/medium.jpg',
                large_url: 'https://cdn.example.test/storefront/large.jpg'
            }
        });
        expect(bothPresent.src).toBe('https://cdn.example.test/pos/thumb.jpg');
        expect(bothPresent.configuredLargeSrc).toBe('https://cdn.example.test/pos/large.jpg');
        expect(bothPresent.srcSet).toContain('pos/thumb.jpg');
        expect(bothPresent.srcSet).not.toContain('storefront');

        // (b) only the Storefront image exists -- the number-218 case, Storefront wins.
        const storefrontOnly = resolvePosCatalogImageSources({
            storefront_image_url: 'https://cdn.example.test/storefront/large.jpg',
            storefront_image_variants: {
                thumbnail_url: 'https://cdn.example.test/storefront/thumb.jpg',
                medium_url: 'https://cdn.example.test/storefront/medium.jpg',
                large_url: 'https://cdn.example.test/storefront/large.jpg'
            }
        });
        expect(storefrontOnly.src).toBe('https://cdn.example.test/storefront/thumb.jpg');
        expect(storefrontOnly.configuredLargeSrc).toBe('https://cdn.example.test/storefront/large.jpg');

        // (c) a flat pos_image_url with no derived variants object at all -- still
        // resolves to a plain src, without leaking the (unrelated) Storefront
        // srcSet/avif/webp sources. Uses a path that doesn't end in "/large.ext" so
        // resolveAssetVariantUrl's sibling-file rewrite heuristic is a no-op here,
        // isolating the "no variants object" behavior from that unrelated rewrite.
        const flatPosUrlOnly = resolvePosCatalogImageSources({
            pos_image_url: 'https://cdn.example.test/pos/raw-photo.jpg',
            storefront_image_url: 'https://cdn.example.test/storefront/large.jpg',
            storefront_image_variants: {
                thumbnail_url: 'https://cdn.example.test/storefront/thumb.jpg',
                medium_url: 'https://cdn.example.test/storefront/medium.jpg',
                large_url: 'https://cdn.example.test/storefront/large.jpg'
            }
        });
        expect(flatPosUrlOnly.src).toBe('https://cdn.example.test/pos/raw-photo.jpg');
        expect(flatPosUrlOnly.configuredLargeSrc).toBe('https://cdn.example.test/pos/raw-photo.jpg');
        expect(flatPosUrlOnly.srcSet).toBeUndefined();
        expect(flatPosUrlOnly.avifSrcSet).toBeUndefined();
        expect(flatPosUrlOnly.webpSrcSet).toBeUndefined();
        expect(flatPosUrlOnly.fallbackSrcs).toEqual([
            'https://cdn.example.test/storefront/large.jpg',
            'https://cdn.example.test/storefront/medium.jpg',
            'https://cdn.example.test/storefront/thumb.jpg'
        ]);

        const stalePosOverride = resolvePosCatalogImageSources({
            pos_image_url: '/uploads/pos/missing-large.webp',
            pos_image_variants: {
                thumbnail_url: '/uploads/pos/missing-thumb.webp'
            },
            storefront_image_url: '/uploads/storefront/primary-large.webp',
            storefront_image_variants: {
                large_url: '/uploads/storefront/primary-large.webp',
                thumbnail_url: '/uploads/storefront/primary-thumb.webp'
            },
            storefront_image_gallery: [{
                url: '/uploads/storefront/secondary-large.webp',
                variants: {
                    medium_url: '/uploads/storefront/secondary-medium.webp'
                }
            }]
        });
        expect(stalePosOverride.fallbackSrcs).toEqual([
            '/uploads/storefront/primary-large.webp',
            '/uploads/storefront/primary-thumb.webp',
            '/uploads/storefront/secondary-medium.webp',
            '/uploads/storefront/secondary-large.webp'
        ]);
    });

    it('resolves an ordered on-demand POS item preview gallery without duplicate images', () => {
        const sources = resolvePosCatalogPreviewGallery({
            storefront_image_url: '/uploads/items/primary/large.jpg',
            storefront_image_variants: {
                pos_thumbnail_url: '/uploads/items/primary/pos-thumbnail.jpg',
                medium_url: '/uploads/items/primary/medium.jpg',
                large_url: '/uploads/items/primary/large.jpg'
            },
            storefront_image_gallery: JSON.stringify([
                {
                    url: '/uploads/items/primary/large.jpg',
                    variants: {
                        pos_thumbnail_url: '/uploads/items/primary/pos-thumbnail.jpg',
                        large_url: '/uploads/items/primary/large.jpg'
                    }
                },
                {
                    path: 'items/second/original.jpg',
                    variants: {
                        thumbnail_url: 'items/second/thumbnail.jpg',
                        medium_url: 'items/second/medium.jpg',
                        large_url: 'items/second/large.jpg'
                    }
                }
            ])
        });

        expect(sources.gallery).toHaveLength(2);
        expect(sources.thumbnailSrc).toContain('/uploads/items/primary/pos-thumbnail.jpg');
        expect(sources.previewSrc).toContain('/uploads/items/primary/large.jpg');
        expect(sources.gallery[1]).toMatchObject({
            isPrimary: false
        });
        expect(sources.gallery[1].thumbnailSrc).toContain('/uploads/items/second/thumbnail.jpg');
        expect(sources.gallery[1].previewSrc).toContain('/uploads/items/second/large.jpg');
        expect(sources.gallery[1].previewFallbacks[0]).toContain('/uploads/items/second/original.jpg');
    });

    it('keeps a POS image override isolated and handles missing preview images', () => {
        const overridden = resolvePosCatalogPreviewGallery({
            pos_image_url: 'https://cdn.example.test/pos/original.jpg',
            pos_image_variants: {
                thumbnail_url: 'https://cdn.example.test/pos/thumb.jpg',
                medium_url: 'https://cdn.example.test/pos/medium.jpg',
                large_url: 'https://cdn.example.test/pos/large.jpg'
            },
            storefront_image_gallery: [{ url: 'https://cdn.example.test/storefront/image.jpg' }]
        });

        expect(overridden.gallery).toHaveLength(1);
        expect(overridden.thumbnailSrc).toBe('https://cdn.example.test/pos/thumb.jpg');
        expect(overridden.previewSrc).toBe('https://cdn.example.test/pos/large.jpg');
        expect(overridden.previewFallbacks).toEqual([
            'https://cdn.example.test/pos/original.jpg',
            'https://cdn.example.test/pos/medium.jpg',
            'https://cdn.example.test/pos/thumb.jpg'
        ]);
        expect(resolvePosCatalogPreviewGallery({})).toEqual({
            thumbnailSrc: '',
            previewSrc: '',
            previewFallbacks: [],
            gallery: []
        });
    });

    it('uses the Storefront HD gallery when POS display fields contain a Storefront fallback', () => {
        const sources = resolvePosCatalogPreviewGallery({
            pos_image_source: 'storefront',
            pos_image_url: '/uploads/items/meal/pos-thumb.webp',
            pos_image_variants: {
                pos_thumbnail_url: '/uploads/items/meal/pos-thumb.webp',
                thumbnail_url: '/uploads/items/meal/pos-thumb.webp',
                medium_url: '/uploads/items/meal/pos-thumb.webp',
                large_url: '/uploads/items/meal/pos-thumb.webp'
            },
            storefront_image_url: '/uploads/items/meal/large.webp',
            storefront_image_variants: {
                thumbnail_url: '/uploads/items/meal/thumbnail.webp',
                medium_url: '/uploads/items/meal/medium.webp',
                large_url: '/uploads/items/meal/large.webp'
            },
            storefront_image_gallery: [{
                url: '/uploads/items/meal/large.webp',
                variants: {
                    thumbnail_url: '/uploads/items/meal/thumbnail.webp',
                    medium_url: '/uploads/items/meal/medium.webp',
                    large_url: '/uploads/items/meal/large.webp'
                }
            }]
        });

        expect(sources.thumbnailSrc).toContain('/uploads/items/meal/thumbnail.webp');
        expect(sources.previewSrc).toContain('/uploads/items/meal/large.webp');
        expect(sources.previewSrc).not.toContain('pos-thumb');
    });

    it('merges duplicate primary gallery metadata and supports a legacy POS path', () => {
        const storefront = resolvePosCatalogPreviewGallery({
            storefront_image_url: '/uploads/items/meal/original.jpg',
            storefront_image_gallery: [{
                url: '/uploads/items/meal/original.jpg',
                variants: {
                    thumbnail_url: '/uploads/items/meal/thumbnail.webp',
                    large_url: '/uploads/items/meal/large.webp'
                }
            }]
        });
        expect(storefront.gallery).toHaveLength(1);
        expect(storefront.thumbnailSrc).toContain('/uploads/items/meal/thumbnail.webp');
        expect(storefront.previewSrc).toContain('/uploads/items/meal/large.webp');

        const pathOnly = resolvePosCatalogPreviewGallery({ pos_image_path: 'pos/legacy-photo.jpg' });
        expect(pathOnly.gallery).toHaveLength(1);
        expect(pathOnly.previewSrc).toContain('/uploads/pos/legacy-photo.jpg');
        expect(pathOnly.thumbnailSrc).toBe('');
    });
});
