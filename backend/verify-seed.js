import sequelize from './src/config/database.js';

async function verifySeed() {
  try {
    console.log('\n=== Verifying Database Seed ===\n');

    // Check items by category
    const [items] = await sequelize.query(
      'SELECT category, product_type, COUNT(*) as count FROM items GROUP BY category, product_type ORDER BY category'
    );

    console.log('Item Categories:');
    items.forEach(row => {
      const type = row.product_type ? ` (${row.product_type})` : '';
      console.log(`  ${row.category}${type}: ${row.count}`);
    });

    // Check other entities
    const [users] = await sequelize.query('SELECT COUNT(*) as count FROM users WHERE role = "admin"');
    const [suppliers] = await sequelize.query('SELECT COUNT(*) as count FROM suppliers');
    const [pos] = await sequelize.query('SELECT COUNT(*) as count FROM purchase_orders');
    const [jos] = await sequelize.query('SELECT COUNT(*) as count FROM job_orders');

    console.log('\nOther Entities:');
    console.log(`  Admin users: ${users[0].count}`);
    console.log(`  Suppliers: ${suppliers[0].count}`);
    console.log(`  Purchase Orders: ${pos[0].count}`);
    console.log(`  Job Orders: ${jos[0].count}`);

    console.log('\n✅ Database verification complete!\n');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

verifySeed();
