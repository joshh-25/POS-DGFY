// money.js — Pure integer-centavo money/tax/discount engine
//
// This module is the server-side authority for all availment totals, VAT decomposition,
// independent discount stacking, SC/PWD VAT-exempt treatment, and cash change.
// All arithmetic is in integer centavos (never floating-point); parsed once from
// DECIMAL-as-string, computed in integers, and formatted back to DECIMAL strings
// only at boundaries (persistence/printing).
//
// Principles:
// - VAT is uniform 12% (D-13), VAT-inclusive decomposition (D-19)
// - SC/PWD sales are VAT-EXEMPT: zero the 12% VAT AND take 20% off the net base (D-20)
// - Discounts stack independently: each computes on the ORIGINAL base subtotal (D-05)
// - Change is computed server-side; client totals are never trusted (D-09)
// - One rounding convention (round-half-up) reused everywhere, no scattered toFixed

const VAT_RATE = 12; // BIR uniform rate (D-13)
const SC_PWD_DISCOUNT_RATE = 20; // BIR VAT-exempt discount (D-20)

/**
 * Round half-up (banker's rounding avoided in favor of standard rounding).
 * Computes: Math.round(numerator / denominator) in integer arithmetic.
 * @param {number} numerator
 * @param {number} denominator
 * @returns {number} rounded integer result
 */
export function roundHalfUp(numerator, denominator) {
	if (denominator === 0) throw new Error('roundHalfUp: division by zero');
	// Round half-up: add 0.5 before truncating
	return Math.floor(numerator / denominator + 0.5);
}

/**
 * Parse a DECIMAL-as-string or number to integer centavos.
 * mysql2 returns DECIMAL(14,4) columns as strings; this function coerces
 * any string/number to centavos in integer form.
 *
 * @param {string|number} value - the amount in decimal form (e.g., '112.0000' or 112.5)
 * @returns {number} integer centavos (e.g., 11250 for '112.50')
 * @throws {Error} if value is not a valid number
 */
export function parseAmountToCentavos(value) {
	const num = Number(value);
	if (!Number.isFinite(num)) {
		throw new Error(`parseAmountToCentavos: invalid amount "${value}"`);
	}
	// Multiply by 100 to convert to centavos; round to nearest integer to avoid float drift
	return Math.round(num * 100);
}

/**
 * Format integer centavos back to a DECIMAL(14,4) string.
 *
 * @param {number} centavos - integer centavos
 * @returns {string} formatted string (e.g., '112.5000' for 11250)
 */
export function formatCentavos(centavos) {
	const dollars = Math.floor(centavos / 100);
	const cents = centavos % 100;
	return `${dollars}.${String(cents).padStart(2, '0')}00`;
}

/**
 * Decompose a VAT-inclusive line total into VAT and net components.
 *
 * In the Philippines, retail prices are VAT-inclusive. To decompose:
 *   vat = round(L − L/1.12) = round(L * 12/112)
 *   net = L − vat
 *
 * The constant 1.12 = (100% + 12% VAT) / 100%.
 *
 * @param {number} lineTotalCentavos - integer centavos, VAT-inclusive line total
 * @returns {{ vat: number, net: number, gross: number }} object with vat, net, and gross (all in centavos)
 */
export function decomposeVatInclusiveLine(lineTotalCentavos) {
	const vat = roundHalfUp(lineTotalCentavos * VAT_RATE, 100 + VAT_RATE);
	const net = lineTotalCentavos - vat;
	return {
		vat,
		net,
		gross: lineTotalCentavos
	};
}

/**
 * Compute the SC/PWD discount on a VAT-exclusive base.
 * BIR rule: 20% off the VAT-exclusive (net) selling price.
 * For VAT-inclusive line total L: base = L/1.12; discount = round(base * 20/100).
 *
 * @param {number} baseNetCentavos - integer centavos, VAT-exclusive base
 * @returns {number} integer centavos, 20% of the net base
 */
export function computeScPwdDiscount(baseNetCentavos) {
	return roundHalfUp(baseNetCentavos * SC_PWD_DISCOUNT_RATE, 100);
}

/**
 * Sum line grosses (VAT-inclusive totals) to produce a subtotal.
 *
 * @param {Array<{quantity: number, unit_price: string|number}>} lines - availment items
 * @returns {number} integer centavos, subtotal of all line grosses
 */
export function sumLineSubtotals(lines) {
	return lines.reduce((sum, line) => {
		const qty = Number(line.quantity);
		const unitPriceCentavos = parseAmountToCentavos(line.unit_price);
		const lineTotal = roundHalfUp(qty * unitPriceCentavos, 1); // qty may be decimal; multiply then round
		return sum + lineTotal;
	}, 0);
}

/**
 * Compute the sum of all discounts applied independently.
 *
 * Each discount (promo code, manual, SC/PWD) is computed against the ORIGINAL
 * base subtotal, never cascaded. The final discount is the sum of all terms.
 *
 * WR-02 (09-REVIEW.md) — IMPORTANT type contract, silent and type-driven:
 * `term.amount` is interpreted DIFFERENTLY depending on its runtime `typeof`:
 *   - `string`  -> parsed as PESOS via parseAmountToCentavos (e.g. '50.00' -> 5000)
 *   - `number`  -> assumed ALREADY IN CENTAVOS, used as-is (e.g. 5000 -> 5000)
 * There is a 100x magnitude difference between these two interpretations and
 * NO runtime guard against a caller passing a plain JS number meaning pesos
 * (e.g. `{ amount: 50 }` intending PHP 50.00 silently becomes a PHP 0.50
 * discount instead — no error, no warning). The two current internal call
 * sites are each individually consistent with this contract:
 *   - availmentUseCases.js's discountRowToTerm() passes `{ amount: row.amount }`
 *     — a DB DECIMAL-as-STRING (pesos) straight from availment_discounts.
 *   - availmentUseCases.js's buildFinalizeAvailmentUseCase's codeDiscounts/
 *     manualDiscount arrays pass `{ amount: amountCentavos }` — a NUMBER
 *     already pre-resolved to centavos by computeDiscountRowAmountCentavos().
 * Any NEW call site must follow one of these two shapes exactly — a number
 * meaning pesos is NOT supported and will silently corrupt the discount by
 * 100x. @throws nothing at runtime for this misuse; verify manually.
 *
 * @param {number} baseSubtotalCentavos - integer centavos, original subtotal
 * @param {Array<{type: string, amount?: number|string, percent?: number}>} discountTerms - array of discount objects
 *        Each term must have EITHER amount (integer centavos OR string dollars) OR percent (0-100).
 * @returns {number} integer centavos, sum of all discounts
 */
export function computeManualAndCodeDiscounts(baseSubtotalCentavos, discountTerms = []) {
	// Handle null/undefined by using empty array
	const terms = discountTerms || [];
	let totalDiscount = 0;
	for (const term of terms) {
		let discountCentavos = 0;
		if (term.amount !== undefined) {
			// Absolute amount: if string, parse as PESOS; if number, assume
			// ALREADY IN CENTAVOS (see the WR-02 type-contract note in this
			// function's JSDoc above — this is a silent, type-driven switch).
			if (typeof term.amount === 'string') {
				discountCentavos = parseAmountToCentavos(term.amount);
			} else {
				discountCentavos = term.amount;
			}
		} else if (term.percent !== undefined) {
			// Percentage discount
			const percent = Number(term.percent);
			if (!Number.isFinite(percent) || percent < 0) {
				throw new Error(`computeManualAndCodeDiscounts: invalid percent "${term.percent}"`);
			}
			// Allow percents > 100; they will be capped by the caller to not exceed subtotal
			discountCentavos = roundHalfUp(baseSubtotalCentavos * percent, 100);
		}
		totalDiscount += discountCentavos;
	}
	return totalDiscount;
}

/**
 * Compute the full availment totals with VAT decomposition, SC/PWD VAT-exempt treatment,
 * and independent discount stacking.
 *
 * @param {Array<{quantity: number, unit_price: string|number}>} lines - availment items
 * @param {Object} options - configuration object
 * @param {boolean} options.scPwd - if true, apply SC/PWD VAT-exempt branch (zero VAT, 20% off net)
 * @param {Array} options.manualDiscount - array of manual discount terms (or empty)
 * @param {Array} options.codeDiscounts - array of promo code discount terms (or empty)
 * @returns {Object} result object with amounts in both centavos and formatted DECIMAL strings
 *   {
 *     subtotal_amount: number (centavos),
 *     subtotal_amount_formatted: string,
 *     vat_amount: number (centavos),
 *     vat_amount_formatted: string,
 *     vat_exempt_amount: number (centavos), // only when scPwd=true
 *     vat_exempt_amount_formatted: string,
 *     discount_amount: number (centavos),
 *     discount_amount_formatted: string,
 *     total_amount: number (centavos),
 *     total_amount_formatted: string
 *   }
 */
export function computeAvailmentTotals(lines, options = {}) {
	const { scPwd = false, manualDiscount = [], codeDiscounts = [] } = options;

	// Sum line subtotals (VAT-inclusive)
	const subtotalCentavos = sumLineSubtotals(lines);

	let totalVat = 0;
	let totalVatExempt = 0;
	const allDiscounts = [...(codeDiscounts || []), ...(manualDiscount || [])];

	if (scPwd) {
		// SC/PWD VAT-exempt branch: zero the VAT, take 20% off the net base
		// For each line: decompose it, zero its VAT, then sum the nets
		// Then take the 20% discount on the total net base
		totalVatExempt = lines.reduce((sum, line) => {
			const qty = Number(line.quantity);
			const unitPriceCentavos = parseAmountToCentavos(line.unit_price);
			const lineTotalCentavos = roundHalfUp(qty * unitPriceCentavos, 1);
			const { net } = decomposeVatInclusiveLine(lineTotalCentavos);
			return sum + net;
		}, 0);

		totalVat = 0; // VAT-exempt: no VAT for SC/PWD sales
	} else {
		// Standard VAT path: decompose each line and sum VAT
		//
		// WR-01 (09-REVIEW.md): vat_amount is computed purely from the
		// undiscounted per-line gross, independent of appliedDiscount below —
		// intentionally. Per Philippine BIR convention, discounts OTHER than
		// the statutory SC/PWD exemption (promo_code, manual) do NOT reduce
		// the VATable base; only SC/PWD sales get the VAT-exempt branch
		// above (zero VAT + 20% off net). This means a large/100% promo_code
		// or manual discount can legitimately produce a receipt where
		// total_amount approaches/equals 0 while vat_amount remains
		// positive (VAT is still owed on the undiscounted gross sale even
		// though the discount reduces what the customer pays) — this is
		// documented, expected BIR behavior, not a bug. Pinned by the
		// "100%-off promo code" golden test in money.test.js.
		totalVat = lines.reduce((sum, line) => {
			const qty = Number(line.quantity);
			const unitPriceCentavos = parseAmountToCentavos(line.unit_price);
			const lineTotalCentavos = roundHalfUp(qty * unitPriceCentavos, 1);
			const { vat } = decomposeVatInclusiveLine(lineTotalCentavos);
			return sum + vat;
		}, 0);
	}

	// Compute discounts independently against the original subtotal
	const totalDiscountCentavos = computeManualAndCodeDiscounts(subtotalCentavos, allDiscounts);

	// If SC/PWD, the discount is applied to the net base (VAT-exclusive)
	// Otherwise, discounts apply to the full VAT-inclusive subtotal
	const discountBase = scPwd ? totalVatExempt : subtotalCentavos;
	// CR-02 fix (09-REVIEW.md): Math.min() alone only bounds the UPPER end —
	// it does nothing to stop a negative totalDiscountCentavos (from an
	// unvalidated negative discount term) from making appliedDiscount
	// negative, which would make totalCentavos EXCEED subtotalCentavos
	// (an undisclosed surcharge). Math.max(0, ...) floors it as
	// defense-in-depth, even though buildApplyDiscountUseCase now also
	// rejects negative amount/percent at the usecase layer.
	const appliedDiscount = Math.max(0, Math.min(totalDiscountCentavos, discountBase));

	// Compute final total
	const totalCentavos = subtotalCentavos - appliedDiscount;

	return {
		subtotal_amount: subtotalCentavos,
		subtotal_amount_formatted: formatCentavos(subtotalCentavos),
		vat_amount: totalVat,
		vat_amount_formatted: formatCentavos(totalVat),
		vat_exempt_amount: totalVatExempt,
		vat_exempt_amount_formatted: formatCentavos(totalVatExempt),
		discount_amount: appliedDiscount,
		discount_amount_formatted: formatCentavos(appliedDiscount),
		total_amount: totalCentavos,
		total_amount_formatted: formatCentavos(totalCentavos)
	};
}

/**
 * Compute cash change due. Server-side authority; client-submitted change is ignored.
 *
 * @param {number} cashReceivedCentavos - integer centavos
 * @param {number} totalCentavos - integer centavos, the final total from computeAvailmentTotals
 * @param {string} paymentMethod - 'cash' | 'gcash' | 'credit_card'
 * @returns {{ change_due_amount: number|null, change_due_formatted: string|null, error: string|null }}
 *   For cash: { change_due_amount: integer, change_due_formatted: string, error: null } if cash >= total
 *            { change_due_amount: null, change_due_formatted: null, error: 'cash_insufficient' } if cash < total
 *   For GCash/Credit Card: { change_due_amount: null, change_due_formatted: null, error: null }
 */
export function computeChange(cashReceivedCentavos, totalCentavos, paymentMethod = 'cash') {
	if (paymentMethod === 'cash') {
		if (cashReceivedCentavos < totalCentavos) {
			return {
				change_due_amount: null,
				change_due_formatted: null,
				error: 'cash_insufficient'
			};
		}
		const changeCentavos = cashReceivedCentavos - totalCentavos;
		return {
			change_due_amount: changeCentavos,
			change_due_formatted: formatCentavos(changeCentavos),
			error: null
		};
	}

	// GCash, Credit Card, or other non-cash methods: no change
	return {
		change_due_amount: null,
		change_due_formatted: null,
		error: null
	};
}
