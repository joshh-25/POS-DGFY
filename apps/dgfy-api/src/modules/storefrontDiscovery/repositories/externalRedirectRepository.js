import { Op } from 'sequelize';
import {
  ExternalRedirectSite,
  PlatformAdminAuditLog,
  StorefrontDiscoveryIndex,
  sequelize
} from '../../../models/index.js';
import { buildExternalListingSnapshot } from '../../../services/storefrontDiscoveryIndexService.js';
import { bumpStorefrontDiscoveryCacheVersion } from '../../../services/storefrontDiscoveryCacheState.js';
import { invalidateStorefrontDiscoverySharedSignatureCache } from '../../../services/storefrontDiscoveryFreshnessService.js';
import { clearStorefrontDiscoveryRepositoryCache } from './storefrontDiscoveryRepository.js';
import { EXTERNAL_REDIRECT_SITES, normalizeExternalSiteKey } from '../domain/externalRedirectPolicy.js';

const refreshDiscovery = () => {
  bumpStorefrontDiscoveryCacheVersion();
  invalidateStorefrontDiscoverySharedSignatureCache();
  clearStorefrontDiscoveryRepositoryCache();
};

const audit = (admin, action, before, after, transaction) => PlatformAdminAuditLog.create({
  actor_admin_id: admin?.id || null,
  actor_username_snapshot: admin?.username || null,
  action,
  before_snapshot: before,
  after_snapshot: after
}, { transaction });

const listingSummary = (row) => row ? {
  slug: row.slug,
  external_provider: row.external_provider,
  external_reference_id: row.external_reference_id,
  external_record_origin: row.external_record_origin,
  is_visible: row.is_visible
} : null;

export const getExternalListingEditableFields = (payload = {}) => {
  const fields = [
    'tenant_name', 'external_provider', 'external_reference_id', 'external_record_origin',
    'external_storefront_url', 'workflow_mode'
  ];
  if (typeof payload.is_visible === 'boolean') fields.push('is_visible');
  fields.push(
    'storefront_open',
    'latitude', 'longitude', 'address_line', 'storefront_tagline',
    'supports_delivery', 'supports_pickup', 'supports_dine_in',
    'source_updated_at', 'last_synced_at'
  );
  return fields;
};

export const externalRedirectRepository = {
  async listSites() {
    const rows = await ExternalRedirectSite.findAll({ order: [['site_key', 'ASC']] });
    return rows.map((row) => row.toJSON());
  },

  async getSite(siteKey) {
    return ExternalRedirectSite.findOne({ where: { site_key: siteKey } });
  },

  async saveSite({ siteKey, config, admin }) {
    return sequelize.transaction(async (transaction) => {
      const existing = await ExternalRedirectSite.findOne({
        where: { site_key: siteKey }, transaction, lock: transaction.LOCK.UPDATE
      });
      const before = existing?.toJSON() || null;
      const values = { site_key: siteKey, ...config, updated_by_admin_id: admin?.id || null };
      const row = existing
        ? await existing.update(values, { transaction })
        : await ExternalRedirectSite.create(values, { transaction });
      await audit(admin, 'external_redirect_site_saved', before && {
        site_key: before.site_key, url_template: before.url_template,
        allowed_hostname: before.allowed_hostname, enabled: before.enabled
      }, {
        site_key: siteKey, url_template: config.url_template,
        allowed_hostname: config.allowed_hostname, enabled: config.enabled
      }, transaction);
      return row.toJSON();
    });
  },

  async setSiteVisibility({ siteKey, showOnMap, admin }) {
    const result = await sequelize.transaction(async (transaction) => {
      const row = await ExternalRedirectSite.findOne({
        where: { site_key: siteKey }, transaction, lock: transaction.LOCK.UPDATE
      });
      if (!row) return { status: 'not_found' };
      if (row.show_on_map === showOnMap) return { status: 'unchanged', site: row.toJSON() };
      const before = { site_key: row.site_key, show_on_map: row.show_on_map };
      await row.update({ show_on_map: showOnMap, updated_by_admin_id: admin?.id || null }, { transaction });
      await audit(admin, 'external_redirect_site_visibility_changed', before, {
        site_key: siteKey, show_on_map: showOnMap
      }, transaction);
      return { status: 'updated', site: row.toJSON() };
    });
    if (result.status === 'updated') refreshDiscovery();
    return result;
  },

  async getVisibleListing(slug) {
    return StorefrontDiscoveryIndex.findOne({
      where: { slug, entity_type: 'external_listing', is_visible: true }
    });
  },

  async listListings() {
    const rows = await StorefrontDiscoveryIndex.findAll({
      where: { entity_type: 'external_listing' }, order: [['tenant_name', 'ASC']]
    });
    return rows.map((row) => row.toJSON());
  },

  async saveListing({ slug, payload, admin }) {
    const result = await sequelize.transaction(async (transaction) => {
      const existing = await StorefrontDiscoveryIndex.findOne({
        where: { slug }, transaction, lock: transaction.LOCK.UPDATE
      });
      if (existing && existing.entity_type !== 'external_listing') return { status: 'conflict' };
      const duplicate = await StorefrontDiscoveryIndex.findOne({
        where: {
          entity_type: 'external_listing',
          external_provider: payload.external_provider,
          external_reference_id: payload.external_reference_id,
          slug: { [Op.ne]: slug }
        }, transaction, lock: transaction.LOCK.UPDATE
      });
      if (duplicate) return { status: 'duplicate' };
      const before = listingSummary(existing);
      const snapshot = buildExternalListingSnapshot({ ...payload, slug });
      const editableFields = getExternalListingEditableFields(payload);
      const row = existing
        ? await existing.update(Object.fromEntries(editableFields.map((field) => [field, snapshot[field]])), { transaction })
        : await StorefrontDiscoveryIndex.create(snapshot, { transaction });
      await audit(admin, 'external_discovery_listing_saved', before, listingSummary(row), transaction);
      return { status: existing ? 'updated' : 'created', listing: row.toJSON() };
    });
    if (result.status === 'created' || result.status === 'updated') refreshDiscovery();
    return result;
  },

  async setListingVisibility({ slug, isVisible, admin }) {
    const result = await sequelize.transaction(async (transaction) => {
      const row = await StorefrontDiscoveryIndex.findOne({
        where: { slug, entity_type: 'external_listing' }, transaction, lock: transaction.LOCK.UPDATE
      });
      if (!row || !normalizeExternalSiteKey(row.external_provider)) return { status: 'not_found' };
      if (row.is_visible === isVisible) return { status: 'unchanged', listing: row.toJSON() };
      const before = listingSummary(row);
      await row.update({ is_visible: isVisible }, { transaction });
      await audit(admin, 'external_discovery_listing_visibility_changed', before, listingSummary(row), transaction);
      return { status: 'updated', listing: row.toJSON() };
    });
    if (result.status === 'updated') refreshDiscovery();
    return result;
  },

  async removeListing({ slug, admin }) {
    const result = await sequelize.transaction(async (transaction) => {
      const row = await StorefrontDiscoveryIndex.findOne({
        where: { slug, entity_type: 'external_listing' }, transaction, lock: transaction.LOCK.UPDATE
      });
      if (!row) return { status: 'not_found' };
      const before = listingSummary(row);
      await row.destroy({ transaction });
      await audit(admin, 'external_discovery_listing_removed', before, null, transaction);
      return { status: 'removed' };
    });
    if (result.status === 'removed') refreshDiscovery();
    return result;
  },

  async clearTemporary({ admin }) {
    const result = await sequelize.transaction(async (transaction) => {
      const rows = await StorefrontDiscoveryIndex.findAll({
        where: {
          entity_type: 'external_listing',
          external_record_origin: 'event_seed',
          external_provider: { [Op.in]: Object.keys(EXTERNAL_REDIRECT_SITES) }
        },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      const slugs = rows.map((row) => row.slug);
      if (slugs.length) {
        await StorefrontDiscoveryIndex.destroy({ where: { slug: { [Op.in]: slugs }, entity_type: 'external_listing', external_record_origin: 'event_seed' }, transaction });
      }
      await audit(admin, 'external_discovery_temporary_cleared', { count: slugs.length, slugs }, { count: 0 }, transaction);
      return { removed: slugs.length };
    });
    if (result.removed) refreshDiscovery();
    return result;
  }
};
