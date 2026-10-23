import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const businessAdminPage = fs.readFileSync(
  path.resolve(__dirname, '../../src/features/businessAdmin/BusinessAdminPage.jsx'),
  'utf8'
);
const businessAdminCss = fs.readFileSync(
  path.resolve(__dirname, '../../src/features/businessAdmin/businessAdmin.css'),
  'utf8'
);

describe('Business Admin navigation presentation contract', () => {
  it('animates only route-level workspace changes and keeps loading state inside the shell', () => {
    expect(businessAdminPage).toContain('const workspaceBusy = Boolean(');
    expect(businessAdminPage).toContain('data-testid="business-admin-workspace"');
    expect(businessAdminPage).toContain('aria-busy={workspaceBusy ? \'true\' : \'false\'}');
    expect(businessAdminPage).toContain('const [loadedSection, setLoadedSection] = useState(\'\');');
    expect(businessAdminPage).toContain('if (loadedSection !== activeSection) return <WorkspaceLoading label={`Loading ${meta.title}…`} />;');
    expect(businessAdminPage).toContain('sectionLoading && loadedSection === activeSection && sectionData');
  });

  it('keeps navigation feedback lightweight and keyboard-visible', () => {
    expect(businessAdminCss).toContain('.business-admin-workspace {');
    expect(businessAdminCss).toContain('animation: business-admin-workspace-enter .18s');
    expect(businessAdminCss).toContain('.business-admin-workspace-loading {');
    expect(businessAdminCss).toContain('transition: background-color .16s ease, color .16s ease, box-shadow .16s ease, transform .16s ease;');
    expect(businessAdminCss).toContain('.business-admin-nav-item:focus-visible');
    expect(businessAdminCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(businessAdminCss).toContain('.business-admin-spinner { animation: none; }');
  });

  it('preserves semantic route state and avoids animating filter-driven rerenders', () => {
    expect(businessAdminPage).toContain('const activeNavigationKey = getBusinessAdminSidebarActiveKey({');
    expect(businessAdminPage).toContain("aria-current={isActive ? 'page' : undefined}");
    expect(businessAdminPage).not.toContain('key={location.search}');
    expect(businessAdminPage).toContain('handleSidebarItemNavigate(item)');
  });

  it('renders the domain-grouped sidebar without adding a second navigation path', () => {
    expect(businessAdminPage).toContain("className={`business-admin-nav-group ${group.standalone ? 'is-standalone' : ''}`.trim()}");
    expect(businessAdminPage).toContain('<div className="business-admin-nav-label">{group.label}</div>');
    expect(businessAdminPage).toContain('BUSINESS_ADMIN_SIDEBAR_GROUPS.map');
    expect(businessAdminPage).toContain('handleSidebarItemNavigate(item)');
    expect(businessAdminCss).toContain('.business-admin-nav-group.is-standalone');
    expect(businessAdminCss).toContain('.business-admin-nav-group.is-standalone .business-admin-nav-item');
  });

  it('provides an accessible desktop sidebar collapse without changing the mobile drawer contract', () => {
    const sidebarIndex = businessAdminPage.indexOf('data-testid="business-admin-sidebar"');
    const sidebarToggleIndex = businessAdminPage.indexOf('data-testid="business-admin-sidebar-toggle"');
    const topbarIndex = businessAdminPage.indexOf('<div className="business-admin-topbar">');

    expect(businessAdminPage).toContain("const [sidebarCollapsed, setSidebarCollapsed] = useState(readBusinessAdminSidebarCollapsed);");
    expect(businessAdminPage).toContain('business-admin-sidebar-header');
    expect(businessAdminPage).toContain('data-testid="business-admin-sidebar-toggle"');
    expect(sidebarToggleIndex).toBeGreaterThan(sidebarIndex);
    expect(sidebarToggleIndex).toBeLessThan(topbarIndex);
    expect(businessAdminPage).toContain("aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}");
    expect(businessAdminPage).toContain("aria-controls=\"business-admin-sidebar\"");
    expect(businessAdminPage).toContain("className={`business-admin-shell ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}");
    expect(businessAdminPage).toContain("${sidebarCollapsed ? 'is-collapsed' : ''}`.trim()}");
    expect(businessAdminPage).toContain('BUSINESS_ADMIN_SIDEBAR_COLLAPSED_STORAGE_KEY');
    expect(businessAdminCss).toContain('@media (min-width: 681px)');
    expect(businessAdminCss).toContain('.business-admin-sidebar.is-collapsed {');
    expect(businessAdminCss).toContain('.business-admin-sidebar.is-collapsed .business-admin-nav-item-label');
    expect(businessAdminCss).toContain('.business-admin-sidebar.is-collapsed .business-admin-sidebar-toggle');
    expect(businessAdminCss).toContain('.business-admin-sidebar-toggle:focus-visible');
    expect(businessAdminCss).toContain('.business-admin-sidebar-toggle { display: none; }');
  });

  it('keeps Back Office scrollbars hidden until the user interacts with a scroll surface', () => {
    expect(businessAdminPage).toContain("const pageClass = 'business-admin-page';");
    expect(businessAdminPage).toContain("const activeClass = 'business-admin-scrollbar-active';");
    expect(businessAdminPage).toContain('window.addEventListener(\'scroll\', activateScrollbars, { passive: true });');
    expect(businessAdminPage).toContain('window.addEventListener(\'wheel\', activateScrollbars, { passive: true });');
    expect(businessAdminPage).toContain('window.addEventListener(\'pointermove\', handlePointerMove, { passive: true });');
    expect(businessAdminPage).not.toContain('sidebarAutoHidden');
    expect(businessAdminCss).toContain('html.business-admin-page');
    expect(businessAdminCss).toContain('html.business-admin-page.business-admin-scrollbar-active');
    expect(businessAdminCss).toContain('scrollbar-gutter: stable;');
    expect(businessAdminCss).toContain('html.business-admin-page::-webkit-scrollbar-thumb');
    expect(businessAdminCss).toContain('background: transparent;');
    expect(businessAdminCss).toContain('.business-admin-shell *:focus-within');
    expect(businessAdminCss).toContain('.business-admin-shell *::-webkit-scrollbar');
    expect(businessAdminCss).toContain('.business-admin-shell > .business-admin-sidebar:has(:focus-visible)');
    expect(businessAdminCss).toContain('.business-admin-shell > .business-admin-sidebar *:focus-visible');
    expect(businessAdminCss).toContain('scrollbar-gutter: stable;');
    expect(businessAdminCss).toContain('scrollbar-color: transparent transparent !important;');
    expect(businessAdminCss).toContain('.business-admin-shell > .business-admin-sidebar::-webkit-scrollbar-thumb');
  });
});
