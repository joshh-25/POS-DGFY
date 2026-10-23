import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class ExternalRedirectSite extends Model {}

  ExternalRedirectSite.init({
    site_key: { type: DataTypes.STRING(60), primaryKey: true, allowNull: false },
    url_template: { type: DataTypes.STRING(1000), allowNull: false },
    allowed_hostname: { type: DataTypes.STRING(253), allowNull: false },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    show_on_map: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    updated_by_admin_id: { type: DataTypes.UUID, allowNull: true }
  }, {
    sequelize,
    modelName: 'ExternalRedirectSite',
    tableName: 'external_redirect_sites',
    underscored: true,
    timestamps: true
  });

  return ExternalRedirectSite;
};
