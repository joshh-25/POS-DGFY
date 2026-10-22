import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import {
  buildGetEffectiveCapabilitiesUseCase,
  buildGetStaffAssignmentsUseCase
} from '../usecases/staffCapabilityUseCases.js';
import { staffRoleRepository, plain } from '../repositories/staffRoleRepository.js';
import { buildListStaffRolesUseCase } from '../usecases/listStaffRolesUseCase.js';
import {
  buildCreateStaffRoleUseCase,
  buildUpdateStaffRoleUseCase,
  buildSetStaffRoleStatusUseCase,
  buildAssignStaffRoleToUserUseCase
} from '../usecases/staffRoleUseCases.js';
import { invalidateUserCache } from '../../../middleware/auth.js';

const listRoles = buildListStaffRolesUseCase({ repository: staffRoleRepository });
const createRole = buildCreateStaffRoleUseCase({ repository: staffRoleRepository });
const updateRole = buildUpdateStaffRoleUseCase({ repository: staffRoleRepository, invalidateUserCache });
const setRoleStatus = buildSetStaffRoleStatusUseCase({ repository: staffRoleRepository, invalidateUserCache });
const assignRole = buildAssignStaffRoleToUserUseCase({ repository: staffRoleRepository, invalidateUserCache });
const capabilities = buildGetEffectiveCapabilitiesUseCase();
const assignments = buildGetStaffAssignmentsUseCase({ repository: staffRoleRepository });

const respond = (req, res, result, message, status = 200) => sendUseCaseResult(res, result, {
  successStatusCodeResolver: () => status,
  successPayloadResolver: () => ({ success: true, data: result.data, message, timestamp: new Date().toISOString() }),
  errorPayloadResolver: (failure) => ({ success: false, data: null, message: failure.message, error_code: failure.code, errors: failure.details, request_id: req.requestId || res.locals?.requestId || null, timestamp: new Date().toISOString() })
});

export const getEffectiveCapabilities = async (req, res, next) => { try { return respond(req, res, await capabilities({ user: req.user, locationId: req.validatedQuery?.location_id }), 'Effective capabilities retrieved successfully'); } catch (error) { return next(error); } };
export const getStaffAssignments = async (req, res, next) => { try { return respond(req, res, await assignments({ user: req.user, locationId: req.validatedQuery?.location_id }), 'Staff assignments retrieved successfully'); } catch (error) { return next(error); } };
export const listStaffRoles = async (req, res, next) => { try { return respond(req, res, await listRoles({ includeInactive: req.validatedQuery?.include_inactive === true }), 'Staff roles retrieved successfully'); } catch (error) { return next(error); } };
export const getStaffRole = async (req, res, next) => { try { const role = await staffRoleRepository.findById(req.validatedParams.staffRoleId); if (!role) return res.status(404).json({ success: false, data: null, message: 'Staff role was not found', error_code: 'RESOURCE_NOT_FOUND', timestamp: new Date().toISOString() }); return res.status(200).json({ success: true, data: { role: plain(role) }, message: 'Staff role retrieved successfully', timestamp: new Date().toISOString() }); } catch (error) { return next(error); } };
export const createStaffRole = async (req, res, next) => { try { return respond(req, res, await createRole({ payload: req.validatedData, actorUserId: req.user.user_id }), 'Staff role created successfully', 201); } catch (error) { return next(error); } };
export const updateStaffRole = async (req, res, next) => { try { return respond(req, res, await updateRole({ staffRoleId: req.validatedParams.staffRoleId, payload: req.validatedData, actorUserId: req.user.user_id }), 'Staff role updated successfully'); } catch (error) { return next(error); } };
export const setStaffRoleStatus = async (req, res, next) => { try { return respond(req, res, await setRoleStatus({ staffRoleId: req.validatedParams.staffRoleId, isActive: req.validatedData.is_active, actorUserId: req.user.user_id }), 'Staff role status updated successfully'); } catch (error) { return next(error); } };
export const assignStaffRole = async (req, res, next) => { try { return respond(req, res, await assignRole({ userId: req.validatedParams.userId, staffRoleId: req.validatedData.staff_role_id, actorUserId: req.user.user_id }), 'Staff role assignment updated successfully'); } catch (error) { return next(error); } };
