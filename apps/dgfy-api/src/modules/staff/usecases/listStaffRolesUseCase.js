import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { plain } from '../repositories/staffRoleRepository.js';

const map = (error) => error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Failed to load staff roles', { statusCode: 500 });
export const buildListStaffRolesUseCase = ({ repository }) => async ({ includeInactive = false } = {}) => {
  try { return ok({ roles: (await repository.list({ includeInactive })).map(plain) }); } catch (error) { return fail(map(error)); }
};
