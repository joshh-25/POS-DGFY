import { Router } from 'express';
import bcrypt from 'bcryptjs';
import healthRoutes from './health.js';
import dgfyAuthRoutes from '../modules/dgfyAuth/routes/dgfyAuthRoutes.js';
import sequelize from '../config/db.js';
import defineAccountModel from '../models/Landlord/Account.js';
import {
    buildAccountsModule,
    createAccountRoutes,
    buildAccountAuthMiddleware
} from '../modules/accounts/index.js';
import { createBusinessRoutes } from '../modules/businesses/index.js';

// Composition root for the accounts module (Wave 2, 04-02-PLAN.md): builds
// the Account Sequelize model against this service's own dgfy_core-pointed
// connection (config/db.js), then wires the repository/use-case/controller/
// auth-middleware layers via buildAccountsModule()/createAccountRoutes()/
// buildAccountAuthMiddleware() — the exact composition point named in
// modules/accounts/index.js's own doc comment ("supplied by the caller —
// Wave 2's routes/index.js or app.js"). Mirrors dgfyAuth's own module-level
// singleton-composition pattern (modules/dgfyAuth/index.js).
const AccountModel = defineAccountModel(sequelize);
const { useCases: accountUseCases } = buildAccountsModule({
    accountModel: AccountModel,
    hashPassword: (password) => bcrypt.hash(password, 10),
    bcrypt
});
const authenticateAccount = buildAccountAuthMiddleware({ getAccount: accountUseCases.getAccount });

const router = Router();

router.use('/', healthRoutes);
router.use('/dgfy', dgfyAuthRoutes);
router.use('/accounts', createAccountRoutes(accountUseCases, { authenticateAccount }));
router.use('/businesses', createBusinessRoutes());

export default router;
