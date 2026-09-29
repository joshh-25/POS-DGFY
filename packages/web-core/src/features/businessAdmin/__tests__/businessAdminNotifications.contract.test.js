import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const businessAdminPage = fs.readFileSync(
  path.resolve(__dirname, '../BusinessAdminPage.jsx'),
  'utf8'
);
const businessAdminCss = fs.readFileSync(
  path.resolve(__dirname, '../businessAdmin.css'),
  'utf8'
);

describe('Business Admin notifications presentation contract', () => {
  it('renders modern summary metrics and severity filters without changing action ownership', () => {
    expect(businessAdminPage).toContain('business-admin-notifications-workspace');
    expect(businessAdminPage).toContain('data-testid={`business-admin-notification-filter-${filter.key}`}');
    expect(businessAdminPage).toContain("{ key: 'all', label: 'All open' }");
    expect(businessAdminPage).toContain("{ key: 'unread', label: 'Unread' }");
    expect(businessAdminPage).toContain("{ key: 'critical', label: 'Critical' }");
    expect(businessAdminPage).toContain("{ key: 'warning', label: 'Warnings' }");
    expect(businessAdminPage).toContain("notification?.type || notification?.alert_type");
    expect(businessAdminPage).toContain("onAction('read', id)");
    expect(businessAdminPage).toContain("onAction('dismiss', id)");
    expect(businessAdminPage).toContain("onAction('acknowledge', id)");
  });

  it('keeps the notification workspace mounted while actions refresh the inbox', () => {
    expect(businessAdminPage).toContain("refreshing = false, refreshError = ''");
    expect(businessAdminPage).toContain('notificationWorkspaceHasData');
    expect(businessAdminPage).toContain('refreshing={sectionLoading}');
    expect(businessAdminPage).toContain('refreshError={sectionError}');
    expect(businessAdminPage).toContain('business-admin-notifications-list-panel');
    expect(businessAdminPage).toContain('aria-busy={refreshing}');
    expect(businessAdminPage).toContain('Refreshing notifications...');
    expect(businessAdminCss).toContain('.business-admin-notifications-loading { position: absolute; inset: 0;');
    expect(businessAdminCss).toContain('.business-admin-notifications-list-panel.is-refreshing .business-admin-notifications-list-content');
    expect(businessAdminPage.indexOf('if (notificationWorkspaceHasData)')).toBeLessThan(businessAdminPage.indexOf('if (sectionLoading) return <WorkspaceLoading label={`Refreshing ${meta.title}…`} />;'));
  });

  it('keeps notification cards readable and responsive', () => {
    expect(businessAdminCss).toContain('.business-admin-notifications-summary { display: grid;');
    expect(businessAdminCss).toContain('.business-admin-notification-card { display: grid;');
    expect(businessAdminCss).toContain('.business-admin-notification-card.severity-critical');
    expect(businessAdminCss).toContain('.business-admin-notification-actions');
    expect(businessAdminCss).toContain('.business-admin-notifications-list { display: grid;');
    expect(businessAdminCss).toContain('.business-admin-notifications-summary { grid-template-columns: minmax(0, 1fr);');
    expect(businessAdminCss).toContain('.business-admin-notification-footer { align-items: stretch; flex-direction: column; }');
  });

  it('prioritizes five-second comprehension and keeps mobile navigation out of the first view', () => {
    expect(businessAdminPage).toContain('Notifications needing attention');
    expect(businessAdminPage).toContain('Needs attention');
    expect(businessAdminPage).toContain('What needs your attention');
    expect(businessAdminPage).toContain('Review unread');
    expect(businessAdminPage).toContain("useState('unread')");
    expect(businessAdminPage).toContain('notificationPriority');
    expect(businessAdminPage).toContain('business-admin-mobile-nav-toggle');
    expect(businessAdminPage).toContain('business-admin-mobile-nav-backdrop');
    expect(businessAdminPage).toContain('aria-controls="business-admin-sidebar"');
    expect(businessAdminCss).toContain('.business-admin-mobile-bar,');
    expect(businessAdminCss).toContain('.business-admin-sidebar.is-open');
    expect(businessAdminCss).toContain('.business-admin-notifications-attention');
    expect(businessAdminCss).toContain('.business-admin-notifications-primary-action');
  });

  it('does not introduce a bulk destructive notification action', () => {
    expect(businessAdminPage).not.toContain('Dismiss all');
    expect(businessAdminPage).not.toContain('Delete all');
  });

  it('caps Overview record-backed chart inputs at ten records and removes nonessential subtitles', () => {
    expect(businessAdminPage).toContain('const BUSINESS_ADMIN_OVERVIEW_PAGE_SIZE = 10;');
    expect(businessAdminPage).toContain('data.branches.slice(0, BUSINESS_ADMIN_OVERVIEW_PAGE_SIZE)');
    expect(businessAdminPage).toContain('data.registers.slice(0, BUSINESS_ADMIN_OVERVIEW_PAGE_SIZE)');
    expect(businessAdminPage).toContain('data.recent_transactions.slice(0, BUSINESS_ADMIN_OVERVIEW_PAGE_SIZE)');
    expect(businessAdminPage).not.toContain('Canonical POS transaction totals');
    expect(businessAdminPage).not.toContain('Canonical actionable conditions requiring attention');
    expect(businessAdminPage).not.toContain('Terminal registry and optional heartbeat state');
    expect(businessAdminPage).not.toContain('Click an order to inspect its receipt-safe timeline');
  });

  it('keeps notifications in the dedicated workspace and Audit on immutable history', () => {
    expect(businessAdminPage).toContain('business-admin-notifications-workspace');
    expect(businessAdminPage).toContain('data-testid={`business-admin-notification-filter-${filter.key}`}');
    expect(businessAdminPage).toContain('Immutable historical events with sensitive values redacted at the API boundary');
    expect(businessAdminPage).not.toContain('scheduled_alerts');
    expect(businessAdminPage).not.toContain('activity = false');
  });

  it('maps the legacy activity route to the canonical Audit workspace', () => {
    const settingsModel = fs.readFileSync(
      path.resolve(__dirname, '../businessAdminSettingsModel.js'),
      'utf8'
    );

    expect(settingsModel).toContain("const legacyActivity = requestedSection === 'activity';");
    expect(settingsModel).toContain("(legacyActivity ? 'audit' : requestedSection)");
  });
});
