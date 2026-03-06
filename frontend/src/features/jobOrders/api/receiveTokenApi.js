import { generateReceiveToken } from '../../../services/receiveTokenService.js';

export const generateFeatureReceiveToken = (orderType, orderId) => {
  return generateReceiveToken(orderType, orderId);
};

export default generateFeatureReceiveToken;
