import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class FeedbackSubmission extends Model {}

  FeedbackSubmission.init({
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    type: { type: DataTypes.STRING(32), allowNull: false, validate: { isIn: [['bug', 'idea', 'question', 'other']] } },
    description: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.ENUM('new', 'triaged', 'accepted', 'rejected', 'resolved'), allowNull: false, defaultValue: 'new' },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    reviewed_by_admin_id: { type: DataTypes.INTEGER, allowNull: true },
    review_note: { type: DataTypes.TEXT, allowNull: true },
    linked_issue_url: { type: DataTypes.STRING(2048), allowNull: true },
    surface: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'unknown', validate: { isIn: [['storefront', 'pos', 'ims', 'opis', 'admin', 'unknown']] } },
    client_platform: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'unknown', validate: { isIn: [['web', 'android', 'ios', 'unknown']] } },
    app_version: { type: DataTypes.STRING(64), allowNull: true },
    page_url: { type: DataTypes.STRING(2048), allowNull: true },
    context_json: { type: DataTypes.JSON, allowNull: true },
    tenant_id: { type: DataTypes.UUID, allowNull: true },
    tenant_name: { type: DataTypes.STRING(255), allowNull: true },
    submitter_type: { type: DataTypes.STRING(32), allowNull: false, validate: { isIn: [['tenant_user', 'dgfy_account', 'store_customer', 'guest', 'legacy']] } },
    tenant_user_id: { type: DataTypes.INTEGER, allowNull: true },
    dgfy_account_id: { type: DataTypes.UUID, allowNull: true },
    submitter_name: { type: DataTypes.STRING(255), allowNull: true },
    submitter_email: { type: DataTypes.STRING(320), allowNull: true },
    contact_verified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    subject_type: { type: DataTypes.STRING(32), allowNull: true },
    subject_ref: { type: DataTypes.STRING(128), allowNull: true },
    subject_label: { type: DataTypes.STRING(255), allowNull: true },
    correlation_id: { type: DataTypes.STRING(128), allowNull: true },
    legacy_source_hash: { type: DataTypes.CHAR(64), allowNull: true },
    submitted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize, modelName: 'FeedbackSubmission', tableName: 'feedback_submissions', underscored: true, timestamps: true,
    indexes: [{ name: 'idx_feedback_submissions_legacy_hash', unique: true, fields: ['legacy_source_hash'] }]
  });

  return FeedbackSubmission;
};
