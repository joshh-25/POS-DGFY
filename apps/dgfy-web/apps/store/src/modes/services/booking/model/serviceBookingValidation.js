import { normalizeServiceFormFields } from './serviceBookingFields.js';
import { resolveServiceBookingScheduleAt } from '../../../../shared/model/serviceBookingScheduleResolver.js';

export function buildServiceCartValidationIssues(serviceCartLines = [], fallbackScheduleAt = '') {
  return [
    ...serviceCartLines.flatMap((line) => {
      const lineName = line?.variantName || line?.name || 'Service';
      const lineIssues = [];
      if (!resolveServiceBookingScheduleAt(line, fallbackScheduleAt)) {
        lineIssues.push({
          cart_line_id: line?.cart_line_id || '',
          item_id: line?.item_id,
          serviceName: lineName,
          field: 'Preferred schedule',
          message: `${lineName}: choose a preferred appointment date and time.`
        });
      }
      const lineIntakeFields = normalizeServiceFormFields(line?.service_detail?.intake_form_schema);
      lineIntakeFields.forEach((field) => {
        if (!field.required) return;
        const value = line?.intake_responses?.[field.id];
        const missingValue = field.type === 'checkbox' ? value !== true : !String(value || '').trim();
        if (missingValue) {
          lineIssues.push({
            cart_line_id: line?.cart_line_id || '',
            item_id: line?.item_id,
            serviceName: lineName,
            field: field.label,
            message: `${lineName}: complete "${field.label}".`
          });
        }
      });
      return lineIssues;
    })
  ];
}
