import SystemSetting from '../models/SystemSetting.js';

/**
 * Get all system settings
 */
export const getAllSettings = async () => {
  const settings = await SystemSetting.findAll({
    attributes: ['setting_id', 'setting_key', 'setting_value', 'data_type', 'description', 'updated_at']
  });

  // Convert settings array to key-value object for easier frontend consumption
  const settingsObject = {};
  settings.forEach(setting => {
    let value = setting.setting_value;

    // Parse value based on data type
    if (setting.data_type === 'number') {
      value = parseFloat(value);
    } else if (setting.data_type === 'boolean') {
      value = value === 'true' || value === '1';
    } else if (setting.data_type === 'json') {
      try {
        value = JSON.parse(value);
      } catch (err) {
        value = null;
      }
    }

    settingsObject[setting.setting_key] = {
      value,
      data_type: setting.data_type,
      description: setting.description,
      updated_at: setting.updated_at
    };
  });

  return settingsObject;
};

/**
 * Get a single setting by key
 */
export const getSettingByKey = async (key) => {
  const setting = await SystemSetting.findOne({
    where: { setting_key: key }
  });

  if (!setting) {
    throw new Error(`Setting '${key}' not found`);
  }

  let value = setting.setting_value;

  // Parse value based on data type
  if (setting.data_type === 'number') {
    value = parseFloat(value);
  } else if (setting.data_type === 'boolean') {
    value = value === 'true' || value === '1';
  } else if (setting.data_type === 'json') {
    try {
      value = JSON.parse(value);
    } catch (err) {
      value = null;
    }
  }

  return {
    setting_id: setting.setting_id,
    setting_key: setting.setting_key,
    value,
    data_type: setting.data_type,
    description: setting.description,
    updated_at: setting.updated_at
  };
};

/**
 * Update multiple settings at once
 */
export const updateSettings = async (settingsData) => {
  const updatePromises = [];
  const errors = [];

  for (const [key, value] of Object.entries(settingsData)) {
    try {
      const setting = await SystemSetting.findOne({
        where: { setting_key: key }
      });

      if (!setting) {
        errors.push(`Setting '${key}' not found`);
        continue;
      }

      // Convert value to string based on data type
      let stringValue;
      if (setting.data_type === 'json') {
        stringValue = JSON.stringify(value);
      } else if (setting.data_type === 'boolean') {
        stringValue = value ? 'true' : 'false';
      } else if (setting.data_type === 'number') {
        stringValue = String(value);
      } else {
        stringValue = String(value);
      }

      updatePromises.push(
        setting.update({ setting_value: stringValue })
      );
    } catch (err) {
      errors.push(`Failed to update '${key}': ${err.message}`);
    }
  }

  await Promise.all(updatePromises);

  if (errors.length > 0) {
    throw new Error(`Some settings failed to update: ${errors.join(', ')}`);
  }

  return { message: 'Settings updated successfully', updated: Object.keys(settingsData).length };
};

/**
 * Update a single setting by key
 */
export const updateSettingByKey = async (key, value) => {
  const setting = await SystemSetting.findOne({
    where: { setting_key: key }
  });

  if (!setting) {
    throw new Error(`Setting '${key}' not found`);
  }

  // Convert value to string based on data type
  let stringValue;
  if (setting.data_type === 'json') {
    stringValue = JSON.stringify(value);
  } else if (setting.data_type === 'boolean') {
    stringValue = value ? 'true' : 'false';
  } else if (setting.data_type === 'number') {
    stringValue = String(value);
  } else {
    stringValue = String(value);
  }

  await setting.update({ setting_value: stringValue });

  return {
    setting_id: setting.setting_id,
    setting_key: setting.setting_key,
    value,
    data_type: setting.data_type,
    description: setting.description,
    updated_at: setting.updated_at
  };
};

/**
 * Reset all settings to default values (requires admin)
 */
export const resetSettingsToDefault = async () => {
  const defaultSettings = {
    'low_stock_threshold': '20',
    'critical_stock_threshold': '10',
    'enable_email_alerts': 'true',
    'enable_low_stock_alerts': 'true',
    'enable_expiry_alerts': 'true',
    'alert_frequency_hours': '24',
    'quality_check_frequency_days': '30',
    'supplier_rating_threshold': '3.0',
    'enable_auto_reorder': 'false',
    'reorder_safety_margin': '1.2'
  };

  const updatePromises = Object.entries(defaultSettings).map(async ([key, value]) => {
    const setting = await SystemSetting.findOne({
      where: { setting_key: key }
    });

    if (setting) {
      return setting.update({ setting_value: value });
    }
  });

  await Promise.all(updatePromises);

  return { message: 'Settings reset to default values' };
};
