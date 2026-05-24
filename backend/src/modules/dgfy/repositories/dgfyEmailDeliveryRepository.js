import * as emailService from '../../../services/emailService.js';

export const dgfyEmailDeliveryRepository = {
    sendEmail(payload) {
        return emailService.sendEmail(payload);
    }
};

export default dgfyEmailDeliveryRepository;
