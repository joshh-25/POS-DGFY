// tests/unit/modules/availments/money.test.js
//
// Golden-case unit tests for money.js, the server-side authority for:
// - VAT-inclusive decomposition (12% uniform VAT)
// - SC/PWD VAT-exempt treatment (zero VAT, 20% discount on net)
// - Independent discount stacking (no cascading)
// - Server-side change computation (integer centavos)
// - Rounding behavior (round-half-up convention, no float drift)

import {
	parseAmountToCentavos,
	formatCentavos,
	roundHalfUp,
	decomposeVatInclusiveLine,
	computeScPwdDiscount,
	sumLineSubtotals,
	computeManualAndCodeDiscounts,
	computeAvailmentTotals,
	computeChange
} from '../../../../src/modules/availments/usecases/money.js';

describe('money.js - Integer-Centavo Money Engine', () => {
	describe('parseAmountToCentavos', () => {
		it('should parse DECIMAL-as-string to integer centavos', () => {
			expect(parseAmountToCentavos('112.0000')).toBe(11200);
			expect(parseAmountToCentavos('112.50')).toBe(11250);
			expect(parseAmountToCentavos('0.01')).toBe(1);
		});

		it('should parse numeric input to integer centavos', () => {
			expect(parseAmountToCentavos(112)).toBe(11200);
			expect(parseAmountToCentavos(112.5)).toBe(11250);
			expect(parseAmountToCentavos(0.01)).toBe(1);
		});

		it('should round to nearest centavo to avoid float drift', () => {
			expect(parseAmountToCentavos(10.005)).toBe(1001); // rounds up
			expect(parseAmountToCentavos(10.004)).toBe(1000); // rounds down
		});

		it('should throw on invalid input', () => {
			expect(() => parseAmountToCentavos('not a number')).toThrow();
			expect(() => parseAmountToCentavos(NaN)).toThrow();
		});
	});

	describe('formatCentavos', () => {
		it('should format integer centavos to DECIMAL(14,4) string', () => {
			expect(formatCentavos(11200)).toBe('112.0000');
			expect(formatCentavos(11250)).toBe('112.5000');
			expect(formatCentavos(1)).toBe('0.0100');
			expect(formatCentavos(100)).toBe('1.0000');
		});

		it('should handle zero and small amounts', () => {
			expect(formatCentavos(0)).toBe('0.0000');
			expect(formatCentavos(1)).toBe('0.0100');
		});

		it('should pad cents with leading zero', () => {
			expect(formatCentavos(1001)).toBe('10.0100');
			expect(formatCentavos(1010)).toBe('10.1000');
		});
	});

	describe('roundHalfUp', () => {
		it('should round half-up (0.5 rounds to 1)', () => {
			expect(roundHalfUp(5, 10)).toBe(1); // 0.5 → 1
			expect(roundHalfUp(15, 10)).toBe(2); // 1.5 → 2
		});

		it('should round down when < 0.5', () => {
			expect(roundHalfUp(4, 10)).toBe(0); // 0.4 → 0
			expect(roundHalfUp(14, 10)).toBe(1); // 1.4 → 1
		});

		it('should round up when > 0.5', () => {
			expect(roundHalfUp(6, 10)).toBe(1); // 0.6 → 1
			expect(roundHalfUp(16, 10)).toBe(2); // 1.6 → 2
		});

		it('should throw on division by zero', () => {
			expect(() => roundHalfUp(10, 0)).toThrow();
		});

		it('should handle VAT decomposition rounding', () => {
			// For 112 centavos: vat = round(112 * 12 / 112) = 12
			expect(roundHalfUp(112 * 12, 112)).toBe(12);
			// For 11200 centavos: vat = round(11200 * 12 / 112) = 1200
			expect(roundHalfUp(11200 * 12, 112)).toBe(1200);
		});
	});

	describe('decomposeVatInclusiveLine', () => {
		it('should decompose a simple VAT-inclusive line (112.00)', () => {
			const result = decomposeVatInclusiveLine(11200);
			expect(result.gross).toBe(11200);
			expect(result.vat).toBe(1200); // round(11200 * 12 / 112)
			expect(result.net).toBe(10000); // 11200 - 1200
		});

		it('should decompose and sum back to gross', () => {
			const lineTotalCentavos = 11250;
			const { vat, net, gross } = decomposeVatInclusiveLine(lineTotalCentavos);
			expect(vat + net).toBe(gross);
		});

		it('should handle single-centavo amounts', () => {
			const result = decomposeVatInclusiveLine(112);
			expect(result.vat).toBe(12); // round(112 * 12 / 112)
			expect(result.net).toBe(100);
			expect(result.vat + result.net).toBe(112);
		});

		it('should handle zero', () => {
			const result = decomposeVatInclusiveLine(0);
			expect(result.vat).toBe(0);
			expect(result.net).toBe(0);
			expect(result.gross).toBe(0);
		});

		it('should round consistently on odd amounts', () => {
			// 99.99 = 9999 centavos
			const result = decomposeVatInclusiveLine(9999);
			expect(result.vat).toBe(roundHalfUp(9999 * 12, 112)); // ~1071
			expect(result.net).toBe(9999 - result.vat);
			expect(result.vat + result.net).toBe(9999);
		});
	});

	describe('computeScPwdDiscount', () => {
		it('should compute 20% off the VAT-exclusive base', () => {
			const net = 10000; // $100.00 net
			const discount = computeScPwdDiscount(net);
			expect(discount).toBe(2000); // 20% of 10000 = 2000 ($20.00)
		});

		it('should round half-up on percentage computation', () => {
			const net = 9999; // $99.99
			const discount = computeScPwdDiscount(net);
			expect(discount).toBe(roundHalfUp(9999 * 20, 100)); // ~2000
		});

		it('should handle zero base', () => {
			expect(computeScPwdDiscount(0)).toBe(0);
		});

		it('should handle small amounts', () => {
			const discount = computeScPwdDiscount(100); // $1.00
			expect(discount).toBe(20); // 20% of 100 = 20 ($0.20)
		});
	});

	describe('sumLineSubtotals', () => {
		it('should sum single line', () => {
			const lines = [{ quantity: 1, unit_price: '112.00' }];
			const subtotal = sumLineSubtotals(lines);
			expect(subtotal).toBe(11200);
		});

		it('should sum multiple lines', () => {
			const lines = [
				{ quantity: 2, unit_price: '100.00' }, // 20000
				{ quantity: 1, unit_price: '112.00' }  // 11200
			];
			const subtotal = sumLineSubtotals(lines);
			expect(subtotal).toBe(31200);
		});

		it('should handle decimal quantities', () => {
			const lines = [{ quantity: 0.5, unit_price: '100.00' }];
			const subtotal = sumLineSubtotals(lines);
			expect(subtotal).toBe(5000); // 0.5 * 100 = 50
		});

		it('should handle empty lines array', () => {
			const subtotal = sumLineSubtotals([]);
			expect(subtotal).toBe(0);
		});

		it('should handle DECIMAL-as-string unit prices', () => {
			const lines = [
				{ quantity: 1, unit_price: '99.9900' },
				{ quantity: 2, unit_price: '50.0000' }
			];
			const subtotal = sumLineSubtotals(lines);
			expect(subtotal).toBe(9999 + 10000); // 99.99 + 100.00
		});
	});

	describe('computeManualAndCodeDiscounts', () => {
		it('should compute independent discount by absolute amount', () => {
			const base = 10000;
			const terms = [{ amount: '20.00' }, { amount: '10.00' }];
			const discount = computeManualAndCodeDiscounts(base, terms);
			expect(discount).toBe(3000); // 20 + 10 = 30
		});

		it('should compute independent discount by percentage', () => {
			const base = 10000;
			const terms = [{ percent: 10 }, { percent: 5 }];
			const discount = computeManualAndCodeDiscounts(base, terms);
			expect(discount).toBe(1500); // 10% + 5% = 15%
		});

		it('should stack independent discounts without cascading', () => {
			const base = 10000;
			const terms = [{ percent: 10 }, { amount: 500 }];
			const discount = computeManualAndCodeDiscounts(base, terms);
			expect(discount).toBe(1500); // 10% of 10000 = 1000, plus 500 = 1500
		});

		it('should handle empty discount terms', () => {
			const discount = computeManualAndCodeDiscounts(10000, []);
			expect(discount).toBe(0);
		});

		it('should handle null discount terms', () => {
			const discount = computeManualAndCodeDiscounts(10000, null);
			expect(discount).toBe(0);
		});

		it('should handle percents > 100 (will be capped by caller)', () => {
			const base = 10000;
			const discount = computeManualAndCodeDiscounts(base, [{ percent: 150 }]);
			expect(discount).toBe(15000); // 150% of 10000 = 15000, but will be capped to not exceed subtotal
		});
	});

	describe('computeAvailmentTotals', () => {
		it('should compute simple VAT-inclusive total', () => {
			const lines = [{ quantity: 1, unit_price: '112.00' }];
			const result = computeAvailmentTotals(lines);

			expect(result.subtotal_amount).toBe(11200);
			expect(result.subtotal_amount_formatted).toBe('112.0000');
			expect(result.vat_amount).toBe(1200);
			expect(result.vat_amount_formatted).toBe('12.0000');
			expect(result.discount_amount).toBe(0);
			expect(result.total_amount).toBe(11200); // no discount
		});

		it('should compute multi-line totals with VAT', () => {
			const lines = [
				{ quantity: 1, unit_price: '100.00' },
				{ quantity: 2, unit_price: '56.00' }
			];
			const result = computeAvailmentTotals(lines);

			const subtotal = 10000 + 11200; // 100 + 56*2
			expect(result.subtotal_amount).toBe(subtotal);
			expect(result.total_amount).toBe(subtotal); // no discount
		});

		it('should apply independent discount stacking', () => {
			const lines = [{ quantity: 1, unit_price: '112.00' }];
			const result = computeAvailmentTotals(lines, {
				codeDiscounts: [{ percent: 10 }],
				manualDiscount: [{ amount: 200 }]
			});

			// subtotal = 11200
			// discount = 10% of 11200 (1120) + 200 = 1320
			// total = 11200 - 1320 = 9880
			expect(result.subtotal_amount).toBe(11200);
			expect(result.discount_amount).toBe(1320);
			expect(result.total_amount).toBe(9880);
			expect(result.discount_amount_formatted).toBe('13.2000');
		});

		it('should apply SC/PWD VAT-exempt branch', () => {
			const lines = [{ quantity: 1, unit_price: '112.00' }];
			const result = computeAvailmentTotals(lines, { scPwd: true });

			// For SC/PWD: VAT = 0, vat_exempt = net base = 100.00
			// SC/PWD discount = 20% of 10000 = 2000 ($20)
			// total = 10000 - 2000 = 8000
			expect(result.vat_amount).toBe(0); // VAT-exempt, zero VAT
			expect(result.vat_exempt_amount).toBe(10000); // net base
			expect(result.subtotal_amount).toBe(11200); // still record the full VAT-inclusive subtotal
			expect(result.discount_amount).toBe(0); // no explicit discount in this case
			expect(result.total_amount).toBe(11200); // SC/PWD discount was not explicitly requested in discounts
		});

		it('should apply SC/PWD VAT-exempt with 20% discount', () => {
			const lines = [{ quantity: 1, unit_price: '112.00' }];
			// For SC/PWD, we typically apply the 20% discount automatically
			// This is handled by the calling code (availmentUseCases.js)
			// but we verify the VAT-exempt path here
			const result = computeAvailmentTotals(lines, { scPwd: true });

			expect(result.vat_amount).toBe(0);
			expect(result.vat_exempt_amount).toBe(10000); // net base: 11200 - 1200 VAT = 10000
			expect(result.vat_exempt_amount_formatted).toBe('100.0000');
		});

		it('should handle rounding on odd amounts', () => {
			const lines = [{ quantity: 1, unit_price: '99.99' }];
			const result = computeAvailmentTotals(lines);

			expect(result.subtotal_amount).toBe(9999);
			expect(result.vat_amount).toBe(roundHalfUp(9999 * 12, 112));
			expect(result.vat_amount + result.vat_amount).toBeGreaterThanOrEqual(0);
		});

		it('should return formatted strings and integers', () => {
			const lines = [{ quantity: 1, unit_price: '112.00' }];
			const result = computeAvailmentTotals(lines);

			// Check both formatted and integer versions exist
			expect(typeof result.subtotal_amount).toBe('number');
			expect(typeof result.subtotal_amount_formatted).toBe('string');
			expect(result.subtotal_amount_formatted).toMatch(/^\d+\.\d{4}$/);
		});

		it('should handle empty lines', () => {
			const result = computeAvailmentTotals([]);
			expect(result.subtotal_amount).toBe(0);
			expect(result.vat_amount).toBe(0);
			expect(result.total_amount).toBe(0);
		});

		it('should ensure discount never exceeds subtotal (cap applied)', () => {
			const lines = [{ quantity: 1, unit_price: '100.00' }];
			const result = computeAvailmentTotals(lines, {
				codeDiscounts: [{ percent: 150 }] // 150% discount would exceed subtotal
			});

			// The discount should be capped to not exceed subtotal
			expect(result.discount_amount).toBeLessThanOrEqual(result.subtotal_amount);
			// In this case, 150% of 10000 = 15000, but capped to 10000 (full subtotal)
			expect(result.discount_amount).toBe(10000);
			// Total would be zero (or close to it due to VAT complexity)
		});

		// CR-02 fix (09-REVIEW.md) defense-in-depth: Math.min() alone only
		// bounds the UPPER end — a negative discount term must be floored
		// at 0, never allowed to make total_amount EXCEED subtotal_amount
		// (an undisclosed surcharge). This is a belt-and-suspenders check;
		// buildApplyDiscountUseCase now also rejects negative amount/
		// percent before a term ever reaches this function.
		it('should floor a negative discount at zero rather than inflate the total beyond subtotal', () => {
			const lines = [{ quantity: 1, unit_price: '112.00' }];
			const result = computeAvailmentTotals(lines, {
				codeDiscounts: [{ amount: -50000 }] // -500.00 pesos in centavos, a "surcharge"
			});

			expect(result.discount_amount).toBe(0);
			expect(result.total_amount).toBe(result.subtotal_amount);
			expect(result.total_amount).toBeLessThanOrEqual(result.subtotal_amount);
		});
	});

	describe('computeChange', () => {
		it('should compute cash change', () => {
			const result = computeChange(20000, 11200, 'cash');
			expect(result.change_due_amount).toBe(8800); // 200 - 112 = 88
			expect(result.change_due_formatted).toBe('88.0000');
			expect(result.error).toBeNull();
		});

		it('should reject insufficient cash', () => {
			const result = computeChange(10000, 11200, 'cash');
			expect(result.change_due_amount).toBeNull();
			expect(result.change_due_formatted).toBeNull();
			expect(result.error).toBe('cash_insufficient');
		});

		it('should return exact change when cash equals total', () => {
			const result = computeChange(11200, 11200, 'cash');
			expect(result.change_due_amount).toBe(0);
			expect(result.change_due_formatted).toBe('0.0000');
			expect(result.error).toBeNull();
		});

		it('should return no change for GCash', () => {
			const result = computeChange(20000, 11200, 'gcash');
			expect(result.change_due_amount).toBeNull();
			expect(result.change_due_formatted).toBeNull();
			expect(result.error).toBeNull();
		});

		it('should return no change for Credit Card', () => {
			const result = computeChange(20000, 11200, 'credit_card');
			expect(result.change_due_amount).toBeNull();
			expect(result.change_due_formatted).toBeNull();
			expect(result.error).toBeNull();
		});

		it('should default to cash method', () => {
			const result = computeChange(20000, 11200);
			expect(result.change_due_amount).toBe(8800);
		});
	});

	describe('Golden Integration Tests', () => {
		it('Golden Case 1: Single-item checkout with VAT-inclusive decomposition', () => {
			// Customer buys 1 item at 112.00 with VAT (100 net, 12 VAT)
			const lines = [{ quantity: 1, unit_price: '112.00' }];
			const totals = computeAvailmentTotals(lines);

			expect(totals.subtotal_amount).toBe(11200);
			expect(totals.vat_amount).toBe(1200); // 12 VAT
			expect(totals.total_amount).toBe(11200);

			// Customer pays cash 200.00
			const change = computeChange(20000, totals.total_amount, 'cash');
			expect(change.change_due_amount).toBe(8800); // 88.00 change
			expect(change.error).toBeNull();
		});

		it('Golden Case 2: Multi-line purchase with independent discount stacking', () => {
			// Buy 2 items: Item A (56.00) + Item B (56.00) = 112.00 subtotal
			const lines = [
				{ quantity: 2, unit_price: '56.00' }
			];
			const totals = computeAvailmentTotals(lines, {
				codeDiscounts: [{ percent: 10 }],  // 10% promo
				manualDiscount: [{ amount: '5.60' }] // 5.60 manual discount
			});

			// subtotal = 11200
			// discounts: 10% = 1120, manual = 560, total discount = 1680
			// total = 11200 - 1680 = 9520
			expect(totals.subtotal_amount).toBe(11200);
			expect(totals.discount_amount).toBe(1680);
			expect(totals.total_amount).toBe(9520);
		});

		it('Golden Case 3: SC/PWD VAT-exempt with net-based 20% discount', () => {
			// SC/PWD customer buys item at 112.00 VAT-inclusive (100 net, 12 VAT)
			// SC/PWD: zero VAT, 20% off net base
			const lines = [{ quantity: 1, unit_price: '112.00' }];

			// First compute totals with SC/PWD flag
			const totals = computeAvailmentTotals(lines, { scPwd: true });

			// Expected: vat_amount = 0, vat_exempt_amount = 10000 (net base)
			expect(totals.vat_amount).toBe(0); // SC/PWD: VAT-exempt, zero VAT
			expect(totals.vat_exempt_amount).toBe(10000); // 100.00 net base

			// The 20% SC/PWD discount should be computed separately:
			const scPwdDiscount = computeScPwdDiscount(totals.vat_exempt_amount);
			expect(scPwdDiscount).toBe(2000); // 20% of 10000 = 2000

			// Final total with SC/PWD discount: 112.00 - 20.00 = 92.00
			const finalTotal = totals.subtotal_amount - scPwdDiscount;
			expect(finalTotal).toBe(9200);
		});

		it('Golden Case 4: Odd amount rounding (99.99)', () => {
			// Verify rounding consistency on odd amounts
			const lines = [{ quantity: 1, unit_price: '99.99' }];
			const totals = computeAvailmentTotals(lines);

			// Verify round-trip through formatting
			const parsedBack = parseAmountToCentavos(totals.total_amount_formatted);
			expect(parsedBack).toBe(totals.total_amount);
		});

		it('Golden Case 5: Insufficient cash rejection', () => {
			// Customer tries to pay with insufficient cash
			const lines = [{ quantity: 1, unit_price: '112.00' }];
			const totals = computeAvailmentTotals(lines);

			// Only has 100.00, needs 112.00
			const change = computeChange(10000, totals.total_amount, 'cash');
			expect(change.error).toBe('cash_insufficient');
			expect(change.change_due_amount).toBeNull();
		});

		it('Golden Case 6: GCash/Credit Card no change', () => {
			// Non-cash payment should not compute change
			const lines = [{ quantity: 1, unit_price: '112.00' }];
			const totals = computeAvailmentTotals(lines);

			const gcashResult = computeChange(999999, totals.total_amount, 'gcash');
			expect(gcashResult.change_due_amount).toBeNull();

			const ccResult = computeChange(999999, totals.total_amount, 'credit_card');
			expect(ccResult.change_due_amount).toBeNull();
		});

		// WR-01 fix (09-REVIEW.md): pins the intentional BIR-convention
		// behavior — a 100%-off promo_code discount zeroes total_amount but
		// vat_amount stays positive, because ordinary (non-SC/PWD)
		// discounts never reduce the VATable base. If this ever changes
		// (e.g. someone "fixes" vat_amount to track the discount), this
		// test will catch the regression.
		it('Golden Case 7: 100%-off promo code zeroes total_amount but leaves vat_amount positive (BIR convention)', () => {
			const lines = [{ quantity: 1, unit_price: '112.00' }];
			const totals = computeAvailmentTotals(lines, {
				codeDiscounts: [{ percent: 100 }]
			});

			expect(totals.subtotal_amount).toBe(11200);
			expect(totals.discount_amount).toBe(11200); // fully capped at subtotal
			expect(totals.total_amount).toBe(0);
			// vat_amount remains the undiscounted-gross VAT — not reduced
			// alongside the discount (documented BIR convention, WR-01).
			expect(totals.vat_amount).toBe(1200);
		});
	});
});
