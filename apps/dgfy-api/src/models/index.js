import defineEmailOtp from './EmailOtp.js';
import sequelize from '../config/db.js';

let cachedModels = null;

export const registerModels = () => {
    if (cachedModels) return cachedModels;
    cachedModels = { EmailOtp: defineEmailOtp(sequelize) };
    return cachedModels;
};

export default registerModels;
