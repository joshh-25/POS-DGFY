import { calculatePosDiscount } from './posDiscountCalculator.js';

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const calculateLineItemDiscount = (line, application) => {
    const grossAmount = round4(Number(line.quantity || 0) * Number(line.sale_price || 0));
    if (!application) {
        return {
            item_discount_amount: 0,
            global_discount_base_amount: grossAmount,
            item_discount_snapshot: null
        };
    }

    const calculation = calculatePosDiscount({
        lines: [{ ...line, global_discount_base_amount: grossAmount }],
        application: {
            ...application,
            type: application.discount_type || application.type || 'manual',
            lines: [{ item_id: line.item_id, eligible_quantity: line.quantity }]
        }
    });
    const calculatedLine = calculation.lines[0] || {};
    const method = String(application.method || 'percentage').toLowerCase() === 'fixed' ? 'fixed' : 'percentage';
    const discountAmount = round4(Number(calculatedLine.vat_removed || 0) + Number(calculatedLine.discount_amount || 0));
    const netAmount = round4(calculatedLine.final_line_amount ?? (grossAmount - discountAmount));

    return {
        item_discount_amount: discountAmount,
        global_discount_base_amount: netAmount,
        item_discount_snapshot: {
            type: 'item',
            label: application.label || 'Item Discount',
            discount_type: application.discount_type || application.type || 'manual',
            method,
            rate: method === 'percentage' ? (application.rate == null ? null : Number(application.rate)) : null,
            amount: method === 'fixed' ? (application.amount == null ? null : Number(application.amount)) : null,
            discount_amount: discountAmount,
            vat_removed: Number(calculatedLine.vat_removed || 0),
            vat_exempt_amount: Number(calculatedLine.vat_exempt_amount || 0),
            customer_name: application.customer_name || null,
            id_number: application.id_number || null,
            employee_name: application.employee_name || null,
            employee_id: application.employee_id || null,
            employee_directory_id: application.employee_directory_id || null,
            promo_code: application.promo_code || null,
            reason: application.reason || null,
            rule_id: application.rule_id || null,
            approver_user_id: application.manager_approval_id || null,
            approver_name: application.manager_approval_name || null,
            approved_at: application.manager_approved_at || null,
            self_approved: application.self_approved === true
        }
    };
};

export const calculatePosItemDiscounts = ({ lines = [], applications = [] } = {}) => {
    const applicationByItemId = new Map(
        applications
            .filter((application) => application && Number(application.item_id) > 0)
            .map((application) => [Number(application.item_id), application])
    );
    const calculatedLines = lines.map((line) => {
        const application = applicationByItemId.get(Number(line.item_id));
        const grossAmount = round4(Number(line.quantity || 0) * Number(line.sale_price || 0));
        const calculation = calculateLineItemDiscount(line, application);
        return {
            ...line,
            gross_amount: grossAmount,
            item_discount_amount: calculation.item_discount_amount,
            global_discount_base_amount: calculation.global_discount_base_amount,
            item_discount_snapshot: calculation.item_discount_snapshot,
            final_line_amount: calculation.global_discount_base_amount
        };
    });

    const discountAmount = round4(calculatedLines.reduce((sum, line) => sum + line.item_discount_amount, 0));
    const totalAmount = round4(calculatedLines.reduce((sum, line) => sum + line.global_discount_base_amount, 0));
    return {
        discount_amount: discountAmount,
        subtotal_amount: round4(calculatedLines.reduce((sum, line) => sum + line.gross_amount, 0)),
        total_amount: totalAmount,
        lines: calculatedLines
    };
};

export default calculatePosItemDiscounts;
