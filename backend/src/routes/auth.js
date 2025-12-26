import express from 'express';
import * as authController from '../controllers/authController.js';
import { validateRegister, validateLogin, validateRefreshToken } from '../validators/authValidator.js';

const router = express.Router();

router.post('/register', validateRegister, authController.register);
router.post('/login', validateLogin, authController.login);
router.post('/refresh-token', validateRefreshToken, authController.refreshToken);
router.post('/logout', authController.logout);

export default router;

