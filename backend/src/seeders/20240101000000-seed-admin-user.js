import bcrypt from 'bcryptjs';

const E2E_TENANT_ID = '11111111-1111-4111-8111-111111111111';
const E2E_TENANT_TOKEN = 'token-tenant-a';
const E2E_TENANT_DB = 'pos_dgfy_test';
const E2E_EMAILS = ['admin@test.com', 'admin@tenant-a.com'];

export default {
  async up(queryInterface) {
    const now = new Date();

    // Check if admin user already exists
    let existingAdmin = [];
    try {
      const result = await queryInterface.sequelize.query(
        `SELECT email FROM users WHERE email IN ('admin@test.com', 'admin@tenant-a.com') OR role = 'admin'`
      );
      existingAdmin = result[0] || [];
    } catch {
      // Table might not exist yet, continue with insert
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash('Admin123!', salt);

    // Keep the default local admin available for manual/dev login.
    if (!existingAdmin.some((user) => user.email === 'admin@test.com')) {
      await queryInterface.bulkInsert('users', [
        {
          username: 'admin',
          email: 'admin@test.com',
          password_hash: password_hash,
          role: 'admin',
          is_active: true,
          last_login: null,
          created_at: now,
          updated_at: now
        }
      ]);

      console.log('✅ Default admin user created');
      console.log('   Email: admin@test.com');
      console.log('   Password: Admin123!');
      console.log('   ⚠️  IMPORTANT: Change this password immediately in production!');
    }

    // Playwright QA uses this legacy tenant credential pair.
    if (!existingAdmin.some((user) => user.email === 'admin@tenant-a.com')) {
      await queryInterface.bulkInsert('users', [
        {
          username: 'tenantadmin',
          email: 'admin@tenant-a.com',
          password_hash,
          role: 'admin',
          is_active: true,
          last_login: null,
          created_at: now,
          updated_at: now
        }
      ]);

      console.log('✅ E2E tenant admin user created');
      console.log('   Email: admin@tenant-a.com');
      console.log('   Password: Admin123!');
    }

    try {
      await queryInterface.bulkInsert('tenants', [
        {
          id: E2E_TENANT_ID,
          name: 'Tenant A',
          domain: null,
          subdomain: null,
          db_name: E2E_TENANT_DB,
          company_token: E2E_TENANT_TOKEN,
          db_host: process.env.DB_HOST || 'localhost',
          db_username: process.env.DB_USER || null,
          db_password: process.env.DB_PASSWORD || null,
          status: 'active',
          plan: 'premium',
          settings: JSON.stringify({ seeded_for: 'playwright_qa' }),
          created_at: now,
          updated_at: now
        }
      ], {
        ignoreDuplicates: true
      });

      await queryInterface.bulkInsert('user_tenant_mappings', E2E_EMAILS.map((email) => ({
        email,
        tenant_id: E2E_TENANT_ID,
        created_at: now,
        updated_at: now
      })), {
        ignoreDuplicates: true
      });

      console.log('✅ E2E tenant and email mappings are ready');
    } catch (error) {
      console.warn(`⚠️  E2E tenant seed skipped: ${error.message}`);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('user_tenant_mappings', {
      tenant_id: E2E_TENANT_ID
    }, {});

    await queryInterface.bulkDelete('tenants', {
      id: E2E_TENANT_ID
    }, {});

    await queryInterface.bulkDelete('users', {
      email: E2E_EMAILS
    }, {});
  }
};
