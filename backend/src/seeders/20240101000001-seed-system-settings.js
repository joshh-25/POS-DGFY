export default {
  async up(queryInterface, Sequelize) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'20240101000001-seed-system-settings.js:2',message:'Seeder up() entry',data:{action:'bulkInsert',table:'system_settings'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // Check if data already exists (Hypothesis A: Unique constraint violation)
    let existingSettings = [];
    try {
      // #region agent log
      const result = await queryInterface.sequelize.query(
        `SELECT setting_key FROM system_settings WHERE setting_key IN ('min_stock_threshold_percent', 'purchase_allowance_percent', 'low_stock_alert_threshold', 'forecast_days_ahead', 'currency', 'system_timezone')`
      );
      existingSettings = result[0] || [];
      fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'20240101000001-seed-system-settings.js:check',message:'Existing settings check result',data:{existingCount:existingSettings.length,existingKeys:existingSettings.map(s=>s.setting_key)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'20240101000001-seed-system-settings.js:check',message:'Error checking existing settings (table may not exist yet)',data:{error:err.message,errorCode:err.original?.code},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
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
      }
    ];
    
    // Skip insertion if all settings already exist (idempotent seeder)
    const existingKeys = existingSettings.map(s => s.setting_key);
    const requiredKeys = settingsData.map(s => s.setting_key);
    const allExist = requiredKeys.every(key => existingKeys.includes(key));
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'20240101000001-seed-system-settings.js:beforeInsert',message:'Before bulkInsert check',data:{dataCount:settingsData.length,existingCount:existingSettings.length,allExist,requiredKeys,existingKeys},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    if (allExist) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'20240101000001-seed-system-settings.js:skip',message:'Skipping insertion - all settings already exist',data:{existingCount:existingSettings.length},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return; // Skip insertion
    }
    
    // Filter out settings that already exist
    const settingsToInsert = settingsData.filter(s => !existingKeys.includes(s.setting_key));
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'20240101000001-seed-system-settings.js:beforeInsert',message:'Before bulkInsert',data:{dataCount:settingsData.length,toInsertCount:settingsToInsert.length,dataTypes:settingsData.map(s=>s.data_type)},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    if (settingsToInsert.length === 0) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'20240101000001-seed-system-settings.js:skip',message:'No new settings to insert',data:{existingCount:existingSettings.length},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return;
    }
    
    try {
      await queryInterface.bulkInsert('system_settings', settingsToInsert);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'20240101000001-seed-system-settings.js:afterInsert',message:'bulkInsert succeeded',data:{insertedCount:settingsToInsert.length},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/fcbbdf73-8390-47c4-a877-2a6264efb314',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'20240101000001-seed-system-settings.js:catch',message:'bulkInsert error caught',data:{errorName:error.name,errorMessage:error.message,errorCode:error.original?.code,errorSqlState:error.original?.sqlState,errorSqlMessage:error.original?.sqlMessage,errorStack:error.stack,errorOriginal:JSON.stringify(error.original)},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('system_settings', null, {});
  }
};

