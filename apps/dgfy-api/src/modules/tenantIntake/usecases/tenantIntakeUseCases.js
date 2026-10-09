import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { assertDemoProvisioningAllowed, demoProvisioningCapabilities } from '../../../config/demoProvisioningGuard.js';
import { validateProvisioningProposal, hashProposal } from './proposalValidation.js';

const error = (code, message) => { throw new DomainError(code, message); };
const visible = (proposal, now) => proposal?.status === 'pending' && new Date(proposal.expires_at) <= now
    ? { ...proposal, status: 'expired' } : proposal;
const assertPending = (proposal, now) => {
    if (!proposal) error(DomainErrorCode.RESOURCE_NOT_FOUND, 'Proposal not found.');
    if (proposal.status !== 'pending') error(DomainErrorCode.CONFLICT, 'Proposal is no longer pending.');
    if (new Date(proposal.expires_at) <= now) error(DomainErrorCode.CONFLICT, 'Proposal has expired. Create a new proposal.');
};
const validated = (payload, target) => {
    const result = validateProvisioningProposal(payload, target);
    if (result.errors.length) error(DomainErrorCode.VALIDATION_FAILED, result.errors.join(' '));
    if (target === 'DEMO') assertDemoProvisioningAllowed();
    return result;
};

export const buildTenantIntakeUseCases = ({ repository, provision, extract, now = () => new Date(), env = process.env }) => {
    const wrap = (fn) => async (input = {}) => {
        try {
            // Authorization is repeated here to keep in-process entry points fail-closed.
            const actor = input.actor;
            if (!actor?.id) error(DomainErrorCode.AUTHENTICATION_FAILED, 'Platform Admin authentication required.');
            if (!actor.is_master && !['admin.tenants', 'admin.dgfy_accounts'].every((permission) => actor.permissions?.includes(permission))) {
                error(DomainErrorCode.AUTHORIZATION_FAILED, 'Tenant and DGFY account permissions are required.');
            }
            return await fn(input);
        } catch (cause) {
            // Provider/SQL errors may contain document bodies or PII. Do not serialize/capture them.
            return fail(cause instanceof DomainError ? cause : new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Tenant intake failed. No automatic retry was performed.'));
        }
    };
    const response = (data, statusCode = 200) => ok({ statusCode, payload: { success: true, data } });
    const audit = (action, proposal, actor, transaction) => repository.audit({
        actor_admin_id: actor.id, actor_username_snapshot: actor.username,
        action: `tenant_intake_${action}`,
        // Audit only identifiers and provenance, never raw documents or credential fields.
        after_snapshot: { proposal_id: proposal.id, target: proposal.target, source: proposal.source,
            payload_hash: proposal.payload_hash, provenance: proposal.provenance,
            tenant_id: proposal.tenant_id || null, approved_via: proposal.approved_via || null }
    }, transaction);
    const create = async ({ body, actor, source, provenance = null }) => {
        const target = body.target || 'OFFICIAL';
        const checked = validated(body.payload || body, target);
        const proposal = await repository.transaction(async (transaction) => {
            const row = await repository.create({ target, source, status: 'pending',
                requested_by_admin_id: actor.id, payload_json: checked.payload, payload_hash: checked.payload_hash,
                warnings: checked.warnings, provenance, expires_at: new Date(now().getTime() + 3600000) }, transaction);
            await audit('proposed', row, actor, transaction);
            return row;
        });
        return response(proposal, 201);
    };
    return {
        capabilities: wrap(async () => response({ demo: demoProvisioningCapabilities(), extraction_enabled: Boolean(env.OPENAI_API_KEY) })),
        propose: wrap(async ({ body = {}, actor }) => {
            const source = body.source || 'admin_form';
            if (!['mcp', 'admin_form'].includes(source)) error(DomainErrorCode.VALIDATION_FAILED, 'Source must be mcp or admin_form.');
            return create({ body, actor, source });
        }),
        extract: wrap(async ({ body = {}, file, actor }) => {
            if ((body.target || 'OFFICIAL') === 'DEMO') assertDemoProvisioningAllowed();
            const extracted = await extract({ body, file });
            return create({ body: { target: body.target || 'OFFICIAL', payload: { ...extracted.payload, reason: body.reason } },
                actor, source: 'admin_upload', provenance: extracted.provenance });
        }),
        get: wrap(async ({ id }) => {
            const row = await repository.get(id);
            if (!row) error(DomainErrorCode.RESOURCE_NOT_FOUND, 'Proposal not found.');
            return response(visible(row, now()));
        }),
        list: wrap(async ({ query = {} }) => {
            if (query.status && !['pending', 'approved', 'executing', 'executed', 'rejected', 'expired', 'failed'].includes(query.status)) {
                error(DomainErrorCode.VALIDATION_FAILED, 'Unknown proposal status.');
            }
            const limit = query.limit === undefined ? 50 : Number(query.limit);
            if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
                error(DomainErrorCode.VALIDATION_FAILED, 'Limit must be an integer from 1 to 100.');
            }
            return response((await repository.list({ status: query.status, limit }))
                .map((row) => visible(row, now())));
        }),
        edit: wrap(async ({ id, body = {}, actor }) => repository.mutate(id, async (row, update, transaction) => {
            assertPending(row, now());
            const target = body.target || row.target;
            // PATCH replaces the complete payload; the UI submits the reviewed field table.
            const checked = validated(body.payload || row.payload_json, target);
            const changed = await update({ target, payload_json: checked.payload, payload_hash: checked.payload_hash,
                warnings: checked.warnings, status: 'pending', approved_at: null, approved_by_admin_id: null, approved_via: null });
            await audit('edited', changed, actor, transaction);
            return response(changed);
        })),
        reject: wrap(async ({ id, actor }) => repository.mutate(id, async (row, update, transaction) => {
            assertPending(row, now());
            const changed = await update({ status: 'rejected' });
            await audit('rejected', changed, actor, transaction);
            return response(changed);
        })),
        confirm: wrap(async ({ id, body = {}, actor }) => {
            if (body.human_confirmed !== true) error(DomainErrorCode.VALIDATION_FAILED, 'Explicit human confirmation is required.');
            const claimed = await repository.mutate(id, async (row, update, transaction) => {
                assertPending(row, now());
                if (!body.payload_hash || body.payload_hash !== row.payload_hash || hashProposal(row.target, row.payload_json) !== row.payload_hash) {
                    error(DomainErrorCode.CONFLICT, 'Proposal changed. Review the current payload before confirming.');
                }
                validated(row.payload_json, row.target); // Revalidate and recheck environment immediately before mutation.
                const changed = await update({ status: 'executing', approved_by_admin_id: actor.id,
                    approved_at: now(), approved_via: 'admin_http' });
                await audit('approved', changed, actor, transaction);
                return changed;
            });
            // DDL/network work occurs AFTER committing the claim, never inside the proposal transaction.
            let result;
            try {
                result = await provision({ body: { ...claimed.payload_json, is_demo: claimed.target === 'DEMO' },
                    actor: { ...actor, is_platform_admin: true },
                    metadata: { extra: { intake_proposal_id: id, payload_hash: claimed.payload_hash, approved_via: 'admin_http' } } });
            } catch {
                result = fail(new DomainError(DomainErrorCode.INTERNAL_ERROR, 'Provisioning failed. Inspect retained records before retrying.'));
            }
            const tenantId = result.success ? result.data?.payload?.data?.tenant?.id : result.error?.details?.tenant_id;
            const finished = await repository.mutate(id, async (row, update, transaction) => {
                if (row?.status !== 'executing') error(DomainErrorCode.CONFLICT, 'Proposal execution state changed; reconcile manually.');
                const changed = await update({ status: result.success ? 'executed' : 'failed', tenant_id: tenantId || null,
                    failure_detail: result.success ? null : { code: result.error?.code || 'INTERNAL_ERROR',
                        partial_state: Boolean(result.error?.details?.partial_state), retryable: Boolean(result.error?.details?.retryable) } });
                await audit(result.success ? 'executed' : 'failed', changed, actor, transaction);
                return changed;
            });
            if (!result.success) return fail(new DomainError(result.error?.code || DomainErrorCode.INTERNAL_ERROR,
                'Provisioning failed. Inspect the proposal and retained tenant records before creating a new proposal.',
                { statusCode: result.error?.statusCode || 500, details: { proposal_id: id, tenant_id: tenantId || null } }));
            // The existing use case's one-time password is returned ONLY here, never stored or audited.
            return response({ proposal: finished, provisioning: result.data.payload.data }, 201);
        })
    };
};
