import { buildPlatformAdminUsersUseCase } from '../usecases/platformAdminUsersUseCase.js';
import { createPlatformAdminRepository } from '../repositories/platformAdminRepository.js';

const users = buildPlatformAdminUsersUseCase({ repository: createPlatformAdminRepository() });
const send = async (res, action) => {
  try {
    const result = await action();
    return res.status(result.status || (result.success ? 200 : 400)).json(result);
  } catch {
    return res.status(500).json({ success: false, message: 'Platform Admin operation failed.' });
  }
};

export const listPlatformAdmins = (_req, res) => send(res, () => users.list());
export const platformAdminReadiness = (_req, res) => send(res, () => users.readiness());
export const createPlatformAdmin = (req, res) => send(res, () => users.create({ actor: req.admin, body: req.body }));
export const updatePlatformAdminPermissions = (req, res) => send(res, () => users.permissions({ actor: req.admin, adminId: req.params.adminId, permissions: req.body?.permissions }));
export const suspendPlatformAdmin = (req, res) => send(res, () => users.suspend({ actor: req.admin, adminId: req.params.adminId, reason: req.body?.reason }));
export const reactivatePlatformAdmin = (req, res) => send(res, () => users.reactivate({ actor: req.admin, adminId: req.params.adminId }));
export const resetPlatformAdminPassword = (req, res) => send(res, () => users.resetPassword({ actor: req.admin, adminId: req.params.adminId }));
export const deletePlatformAdmin = (req, res) => send(res, () => users.remove({ actor: req.admin, adminId: req.params.adminId, reason: req.body?.reason }));
export const changeOwnPlatformAdminPassword = (req, res) => send(res, () => users.changeOwnPassword({
  actor: req.admin,
  currentPassword: req.body?.current_password,
  newPassword: req.body?.new_password,
  confirmation: req.body?.confirmation
}));
