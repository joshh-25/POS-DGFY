import { raiseOperationalAlert } from '../../../services/operationalAlertService.js';

export const raiseSmsOperationalAlert = (alert) => raiseOperationalAlert(alert);

export default raiseSmsOperationalAlert;
