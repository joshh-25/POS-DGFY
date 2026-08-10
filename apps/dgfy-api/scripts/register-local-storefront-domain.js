import crypto from 'node:crypto';
import {
    sequelize,
    StorefrontCustomDomain,
    StorefrontCustomDomainAuditLog,
    StorefrontCustomDomainOperation,
    StorefrontDiscoveryIndex,
    Tenant
} from '../src/models/index.js';
import { Op } from 'sequelize';
import { normalizeStorefrontHostname } from '../src/modules/storefrontDomains/utils/hostnamePolicy.js';

const args = new Map(process.argv.slice(2).map((argument) => {
    const [key, ...valueParts] = argument.replace(/^--/, '').split('=');
    return [key, valueParts.join('=')];
}));

const tenantId = String(args.get('tenant-id') || '').trim();
const hostname = normalizeStorefrontHostname(args.get('hostname'));
const role = String(args.get('role') || 'canonical').trim().toLowerCase();
const canonicalHostname = args.get('canonical-hostname')
    ? normalizeStorefrontHostname(args.get('canonical-hostname'))
    : null;
const actor = 'local_preview_script';

if (process.env.NODE_ENV === 'production') {
    throw new Error('Local storefront preview domains cannot be registered in production.');
}
if (!tenantId) throw new Error('--tenant-id is required.');
if (!['canonical', 'alias'].includes(role)) {
    throw new Error('--role must be canonical or alias.');
}
if (!hostname.endsWith('.localhost')) {
    throw new Error('Local storefront preview hostname must end in .localhost.');
}
if (role === 'alias' && (!canonicalHostname || !canonicalHostname.endsWith('.localhost'))) {
    throw new Error('Aliases require --canonical-hostname ending in .localhost.');
}

try {
    const [tenant, discovery] = await Promise.all([
        Tenant.findByPk(tenantId),
        StorefrontDiscoveryIndex.findOne({ where: { tenant_id: tenantId, is_visible: true } })
    ]);

    if (!tenant) throw new Error('Tenant was not found.');
    if (tenant.status !== 'active' || tenant.plan !== 'premium') {
        throw new Error('Local custom-domain previews require an active Premium tenant.');
    }
    if (!discovery?.slug) throw new Error('Tenant does not have a visible storefront discovery record.');

    const result = await sequelize.transaction(async (transaction) => {
        const canonicalDomain = role === 'alias'
            ? await StorefrontCustomDomain.findOne({
                where: {
                    tenant_id: tenantId,
                    hostname: canonicalHostname,
                    role: 'canonical',
                    status: 'active'
                },
                transaction,
                lock: transaction.LOCK.UPDATE
            })
            : null;
        if (role === 'alias' && !canonicalDomain) {
            throw new Error('The active local canonical preview domain was not found.');
        }

        const existing = await StorefrontCustomDomain.findOne({
            where: { hostname },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (existing && String(existing.tenant_id) !== tenantId) {
            throw new Error('The preview hostname is already assigned to another tenant.');
        }

        const before = existing?.toJSON() || null;
        const now = new Date();
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const values = {
            tenant_id: tenantId,
            hostname,
            role,
            canonical_tenant_id: role === 'canonical' ? tenantId : null,
            canonical_domain_id: canonicalDomain?.id || null,
            status: 'active',
            verification_token_hash: crypto.createHash('sha256').update(verificationToken).digest('hex'),
            verification_token_hint: 'local-preview',
            dns_observation: { mode: 'local_preview', hostname, role },
            dns_error: null,
            verified_at: now,
            activated_at: now,
            eligibility_grace_ends_at: null,
            last_dns_checked_at: now,
            last_health_checked_at: now,
            tls_expires_at: null,
            failure_code: null,
            failure_message: null,
            suspended_at: null,
            removed_at: null,
            provisioning_reference: 'local-development-preview',
            version: Number(existing?.version || 0) + 1,
            created_by: existing?.created_by || actor,
            updated_by: actor
        };

        const domain = existing
            ? await existing.update(values, { transaction })
            : await StorefrontCustomDomain.create(values, { transaction });

        await StorefrontCustomDomainOperation.update({
            status: 'cancelled',
            lease_owner: null,
            lease_expires_at: null,
            error_code: 'LOCAL_PREVIEW_RESTORED',
            error_message: 'Superseded by the local preview registration script.',
            completed_at: now
        }, {
            where: {
                domain_id: domain.id,
                status: { [Op.in]: ['queued', 'retry', 'leased'] }
            },
            transaction
        });

        await StorefrontCustomDomainAuditLog.create({
            domain_id: domain.id,
            tenant_id: tenantId,
            action: 'local_preview_activated',
            actor_username: actor,
            reason: 'Enable an isolated local custom-domain storefront preview.',
            request_id: null,
            before_snapshot: before,
            after_snapshot: domain.toJSON(),
            metadata: {
                storefront_slug: discovery.slug,
                local_only: true,
                role,
                canonical_hostname: canonicalDomain?.hostname || hostname
            }
        }, { transaction });

        return { domain: domain.toJSON(), slug: discovery.slug };
    });

    process.stdout.write(`${JSON.stringify({
        success: true,
        tenant_id: tenantId,
        hostname: result.domain.hostname,
        role: result.domain.role,
        slug: result.slug,
        url: `http://${result.domain.hostname}:5175/`
    }, null, 2)}\n`);
} finally {
    await sequelize.close();
}
