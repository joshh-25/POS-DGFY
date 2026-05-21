import bcrypt from 'bcryptjs';

export default {
  async up(queryInterface) {
    // Check if admin user already exists
    let existingAdmin = [];
    try {
      const result = await queryInterface.sequelize.query(
        `SELECT email FROM users WHERE email = 'admin@test.com' OR role = 'admin'`
      );
      existingAdmin = result[0] || [];
    } catch {
      // Table might not exist yet, continue with insert
    }

    // Only seed if no admin exists
    if (existingAdmin.length === 0) {
      // Hash the default password
      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash('Admin123!', salt);

      await queryInterface.bulkInsert('users', [
        {
          username: 'admin',
          email: 'admin@test.com',
          password_hash: password_hash,
          role: 'admin',
          is_active: true,
          last_login: null,
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);

      console.log('✅ Default admin user created');
      console.log('   Email: admin@test.com');
      console.log('   Password: Admin123!');
      console.log('   ⚠️  IMPORTANT: Change this password immediately in production!');
    } else {
      console.log('ℹ️  Admin user already exists, skipping seed');
    }
  },

  async down(queryInterface) {
    // Remove the seeded admin user
    await queryInterface.bulkDelete('users', {
      email: 'admin@test.com'
    }, {});
  }
};
