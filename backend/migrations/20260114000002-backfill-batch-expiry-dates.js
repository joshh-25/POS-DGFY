/**
 * Migration: Backfill missing expiry_date values for FIFO batches
 * 
 * This migration fixes batches that were created before shelf_life_days was set
 * on their parent items, or where expiry_date was not provided during PO receiving.
 * 
 * It calculates: expiry_date = received_date + shelf_life_days
 */
export default {
    async up(queryInterface, Sequelize) {
        // First, log how many batches will be affected
        const [affectedBatches] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count
      FROM fifo_batches fb
      INNER JOIN items i ON fb.item_id = i.item_id
      WHERE fb.expiry_date IS NULL 
        AND i.shelf_life_days IS NOT NULL
        AND i.fifo_enabled = 1
    `);

        console.log(`[Migration] Found ${affectedBatches[0]?.count || 0} batches with missing expiry_date that can be backfilled`);

        // Update batches to calculate expiry_date from received_date + shelf_life_days
        const [result] = await queryInterface.sequelize.query(`
      UPDATE fifo_batches fb
      INNER JOIN items i ON fb.item_id = i.item_id
      SET fb.expiry_date = DATE_ADD(fb.received_date, INTERVAL i.shelf_life_days DAY)
      WHERE fb.expiry_date IS NULL 
        AND i.shelf_life_days IS NOT NULL
        AND i.fifo_enabled = 1
    `);

        console.log(`[Migration] Updated ${result?.affectedRows || 0} batches with calculated expiry dates`);

        // Also log batches that still have NULL expiry_date (items without shelf_life_days)
        const [remainingNulls] = await queryInterface.sequelize.query(`
      SELECT fb.batch_id, fb.item_id, i.name, fb.received_date
      FROM fifo_batches fb
      INNER JOIN items i ON fb.item_id = i.item_id
      WHERE fb.expiry_date IS NULL AND i.fifo_enabled = 1
      LIMIT 10
    `);

        if (remainingNulls.length > 0) {
            console.log(`[Migration] Warning: ${remainingNulls.length} batches still have NULL expiry_date (items missing shelf_life_days):`);
            remainingNulls.forEach(b => {
                console.log(`  - Batch ${b.batch_id}: ${b.name} (received: ${b.received_date})`);
            });
        }
    },

    async down(queryInterface, Sequelize) {
        // This is a data fix migration - we cannot reliably roll back
        // because we don't know which expiry_dates were originally NULL
        console.log('[Migration] Rollback not supported for data backfill migration');
    }
};
