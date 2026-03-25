export default {
  async up(queryInterface) {
    // Check if data already exists (idempotent seeder)
    let existingSettings = [];
    try {
      const result = await queryInterface.sequelize.query(
        'SELECT setting_key FROM system_settings'
      );
      existingSettings = result[0] || [];
    } catch {
      // Table might not exist yet, continue with insert
    }

    const settingsData = [
      {
        setting_key: 'min_stock_threshold_percent',
        setting_value: '40',
        data_type: 'number',
        description: 'Minimum stock as percentage of capacity',
        updated_at: new Date()
      },
      {
        setting_key: 'purchase_allowance_percent',
        setting_value: '20',
        data_type: 'number',
        description: 'Purchase allowance as percentage of capacity',
        updated_at: new Date()
      },
      {
        setting_key: 'low_stock_alert_threshold',
        setting_value: '30',
        data_type: 'number',
        description: 'Days before low stock alert',
        updated_at: new Date()
      },
      {
        setting_key: 'forecast_days_ahead',
        setting_value: '30',
        data_type: 'number',
        description: 'Number of days for forecasting',
        updated_at: new Date()
      },
      {
        setting_key: 'currency',
        setting_value: 'PHP',
        data_type: 'string',
        description: 'Default currency for financial tracking',
        updated_at: new Date()
      },
      {
        setting_key: 'system_timezone',
        setting_value: 'Asia/Manila',
        data_type: 'string',
        description: 'System timezone',
        updated_at: new Date()
      },
      {
        setting_key: 'enable_auto_reorder',
        setting_value: 'true',
        data_type: 'boolean',
        description: 'Enable automatic threshold calculation based on max capacity',
        updated_at: new Date()
      },
      {
        setting_key: 'expiry_critical_days',
        setting_value: '7',
        data_type: 'number',
        description: 'Days before expiry to trigger critical alerts (red)',
        updated_at: new Date()
      },
      {
        setting_key: 'expiry_warning_days',
        setting_value: '30',
        data_type: 'number',
        description: 'Days before expiry to trigger warning alerts (amber)',
        updated_at: new Date()
      }
    ];

    // Skip insertion if all settings already exist
    const existingKeys = existingSettings.map(s => s.setting_key);
    const requiredKeys = settingsData.map(s => s.setting_key);
    const allExist = requiredKeys.every(key => existingKeys.includes(key));

    if (allExist) {
      return; // Skip insertion
    }

    // Filter out settings that already exist
    const settingsToInsert = settingsData.filter(s => !existingKeys.includes(s.setting_key));

    if (settingsToInsert.length === 0) {
      return;
    }

    await queryInterface.bulkInsert('system_settings', settingsToInsert);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('system_settings', null, {});
  }
};
