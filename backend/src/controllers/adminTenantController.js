import { provisionTenant } from '../services/tenantProvisioningService.js';
import dbStore from '../utils/dbStore.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import * as emailService from '../services/emailService.js';

/**
 * PUBLIC: Register a new company (creates a "pending" request)
 * No authentication required
 */
export const registerCompanyRequest = async (req, res) => {
    try {
        const { name, adminEmail, adminPassword } = req.body;

        if (!name || !adminEmail || !adminPassword) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, adminEmail, adminPassword'
            });
        }

        const Tenant = dbStore.get('Tenant');

        // Check if company name or email already exists
        const existing = await Tenant.findOne({
            where: { name }
        });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'A company with this name already exists'
            });
        }

        // Prepare tenant data (but don't create DB yet)
        const uuid = uuidv4();
        const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const dbName = `sku_tenant_${safeName}_${uuid.split('-')[0]}`;
        const subdomain = `${safeName}-${uuid.split('-')[0]}`;
        const companyToken = `token-${safeName}-${uuid.split('-')[0]}`;
        const passwordHash = await bcrypt.hash(adminPassword, 10);

        // Create pending request
        const tenant = await Tenant.create({
            id: uuid,
            name,
            domain: subdomain,
            db_name: dbName,
            company_token: companyToken,
            status: 'pending',
            admin_email: adminEmail,
            admin_password_hash: passwordHash
        });

        res.status(201).json({
            success: true,
            message: 'Your company registration has been submitted for review. You will be notified once approved.',
            data: {
                id: tenant.id,
                name: tenant.name,
                status: 'pending'
            }
        });

    } catch (error) {
        console.error('Registration request error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Registration failed'
        });
    }
};

/**
 * ADMIN: List all tenants with optional status filter
 */
export const listTenants = async (req, res) => {
    try {
        const { status } = req.query;
        const Tenant = dbStore.get('Tenant');

        const where = {};
        if (status && status !== 'all') {
            where.status = status;
        }

        const tenants = await Tenant.findAll({
            where,
            order: [['createdAt', 'DESC']],
            attributes: ['id', 'name', 'domain', 'company_token', 'status', 'admin_email', 'plan', 'createdAt']
        });

        res.json({
            success: true,
            data: tenants
        });

    } catch (error) {
        console.error('List tenants error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * ADMIN: Approve a pending tenant request
 * This triggers the actual database creation
 */
export const approveTenant = async (req, res) => {
    try {
        const { id } = req.params;
        const Tenant = dbStore.get('Tenant');

        const tenant = await Tenant.findByPk(id);
        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'Tenant not found'
            });
        }

        if (tenant.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Cannot approve tenant with status: ${tenant.status}`
            });
        }

        // Use the provisioning service to create DB, run migrations, seed admin
        const result = await provisionTenant({
            tenantId: tenant.id,
            name: tenant.name,
            dbName: tenant.db_name,
            companyToken: tenant.company_token,
            adminEmail: tenant.admin_email,
            adminPasswordHash: tenant.admin_password_hash
        });

        // Send approval notification email
        let emailSent = false;
        if (emailService.isEmailConfigured()) {
            try {
                await emailService.sendCompanyApprovedEmail({
                    email: tenant.admin_email,
                    companyName: tenant.name,
                    companyToken: tenant.company_token
                });
                emailSent = true;
                console.log(`[TenantApproval] Approval email sent to ${tenant.admin_email}`);
            } catch (emailError) {
                console.warn(`[TenantApproval] Failed to send approval email to ${tenant.admin_email}:`, emailError.message);
                // Don't fail the approval - email is non-critical
            }
        }

        res.json({
            success: true,
            message: 'Tenant approved and provisioned successfully',
            data: { ...result, email_sent: emailSent }
        });

    } catch (error) {
        console.error('Approve tenant error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * ADMIN: Reject a pending tenant request
 */
export const rejectTenant = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const Tenant = dbStore.get('Tenant');

        const tenant = await Tenant.findByPk(id);
        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'Tenant not found'
            });
        }

        if (tenant.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Cannot reject tenant with status: ${tenant.status}`
            });
        }

        await tenant.update({
            status: 'rejected',
            settings: { ...tenant.settings, rejection_reason: reason }
        });

        // Send rejection notification email
        let emailSent = false;
        if (emailService.isEmailConfigured()) {
            try {
                await emailService.sendCompanyRejectedEmail({
                    email: tenant.admin_email,
                    companyName: tenant.name,
                    rejectionReason: reason
                });
                emailSent = true;
                console.log(`[TenantRejection] Rejection email sent to ${tenant.admin_email}`);
            } catch (emailError) {
                console.warn(`[TenantRejection] Failed to send rejection email to ${tenant.admin_email}:`, emailError.message);
                // Don't fail the rejection - email is non-critical
            }
        }

        res.json({
            success: true,
            message: 'Tenant registration rejected',
            data: { id: tenant.id, status: 'rejected', email_sent: emailSent }
        });

    } catch (error) {
        console.error('Reject tenant error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

/**
 * Legacy: Direct provisioning (kept for backward compatibility)
 * Requires admin auth
 */
export const provisionNewTenant = async (req, res) => {
    try {
        const { name, adminEmail, adminPassword } = req.body;

        if (!name || !adminEmail || !adminPassword) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, adminEmail, adminPassword'
            });
        }

        const result = await provisionTenant({ name, adminEmail, adminPassword });

        res.status(201).json({
            success: true,
            data: result,
            message: 'Tenant provisioned successfully'
        });

    } catch (error) {
        console.error('Provisioning error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Provisioning failed'
        });
    }
};
