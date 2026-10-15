import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceSource = [
  fs.readFileSync(path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '../settings/PosSettingsWorkspace.jsx'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '../settings/PosSetupSettingsPane.jsx'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '../settings/PosOperationsAccessSection.jsx'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '../settings/PosOperationsDefaultsSection.jsx'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '../settings/PosCashierCloseoutDefaultsModal.jsx'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '../settings/PosSettingsAccessPinModal.jsx'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '../settings/PosAccountPermissionsSection.jsx'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '../settings/usePosOperationsAccessController.js'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '../settings/PosTerminalSettingsSection.jsx'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '../settings/PosTerminalCashierAccessTable.jsx'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '../settings/PosBusinessReceiptsSection.jsx'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '../settings/PosDiscountAutomationSection.jsx'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '../settings/PosAddTerminalModal.jsx'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '../settings/PosTerminalAdvancedSettingsModal.jsx'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '../settings/PosSettingsTabNavigation.jsx'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '../components/PosLineTabNavigation.jsx'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '../settings/PosStorefrontSettingsPane.jsx'), 'utf8'),
  fs.readFileSync(path.resolve(__dirname, '../settings/useStorefrontSettingsController.js'), 'utf8')
].join('\n');
const storefrontPaneSource = fs.readFileSync(path.resolve(__dirname, '../settings/PosStorefrontSettingsPane.jsx'), 'utf8');
const subtabNavigationSource = fs.readFileSync(path.resolve(__dirname, '../components/PosSubtabNavigation.jsx'), 'utf8');
const storefrontHoursSchedulerSource = fs.readFileSync(path.resolve(__dirname, '../../settings/StorefrontBusinessHoursScheduler.jsx'), 'utf8');
const storefrontCategoriesSource = fs.readFileSync(path.resolve(__dirname, '../settings/StorefrontCategoriesSettings.jsx'), 'utf8');
const storefrontWhyChooseUsSource = fs.readFileSync(path.resolve(__dirname, '../settings/StorefrontWhyChooseUsSettings.jsx'), 'utf8');
const storefrontDeliveryPartnersSource = fs.readFileSync(path.resolve(__dirname, '../settings/StorefrontDeliveryPartnersSettings.jsx'), 'utf8');
const storefrontSocialLinksSource = fs.readFileSync(path.resolve(__dirname, '../settings/StorefrontSocialLinksSettings.jsx'), 'utf8');
const operationsAccessSource = fs.readFileSync(path.resolve(__dirname, '../settings/PosOperationsAccessSection.jsx'), 'utf8');
const operationsDefaultsSource = fs.readFileSync(path.resolve(__dirname, '../settings/PosOperationsDefaultsSection.jsx'), 'utf8');
const directToggleSource = operationsDefaultsSource.slice(
  operationsDefaultsSource.indexOf('function DirectToggle'),
  operationsDefaultsSource.indexOf('export default')
);
const operationsSource = fs.readFileSync(path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx'), 'utf8');
const itemsWorkspaceSource = fs.readFileSync(path.resolve(__dirname, '../components/PosItemsWorkspace.jsx'), 'utf8');
const terminalPageSource = fs.readFileSync(path.resolve(__dirname, '../pages/TerminalPage.jsx'), 'utf8');
const sidebarSource = fs.readFileSync(path.resolve(__dirname, '../components/TerminalWorkspaceSidebar.jsx'), 'utf8');
const tenantSetupModalSource = fs.readFileSync(path.resolve(__dirname, '../components/PosTenantSetupModal.jsx'), 'utf8');
const terminalSectionSource = fs.readFileSync(path.resolve(__dirname, '../settings/PosTerminalSettingsSection.jsx'), 'utf8');
const cashierTableSource = fs.readFileSync(path.resolve(__dirname, '../settings/PosTerminalCashierAccessTable.jsx'), 'utf8');
const employeeTableSource = fs.readFileSync(path.resolve(__dirname, '../components/EmployeeManagementPanel.jsx'), 'utf8');
const deliveryTableSource = fs.readFileSync(path.resolve(__dirname, '../components/DeliveryPersonnelManagementPanel.jsx'), 'utf8');
const employeeCreditTableSource = fs.readFileSync(path.resolve(__dirname, '../components/EmployeeCreditManagementPanel.jsx'), 'utf8');
const profilePaneSource = fs.readFileSync(path.resolve(__dirname, '../settings/PosProfileSettingsPane.jsx'), 'utf8');
const setupPaneSource = fs.readFileSync(path.resolve(__dirname, '../settings/PosSetupSettingsPane.jsx'), 'utf8');
const employeesPaneSource = fs.readFileSync(path.resolve(__dirname, '../settings/PosEmployeesSettingsPane.jsx'), 'utf8');
const businessReceiptsSource = fs.readFileSync(path.resolve(__dirname, '../settings/PosBusinessReceiptsSection.jsx'), 'utf8');
const terminalModalSource = fs.readFileSync(path.resolve(__dirname, '../settings/PosAddTerminalModal.jsx'), 'utf8');
const closeoutModalSource = fs.readFileSync(path.resolve(__dirname, '../settings/PosCashierCloseoutDefaultsModal.jsx'), 'utf8');
const terminalIdentitySource = fs.readFileSync(path.resolve(__dirname, '../utils/terminalIdentity.js'), 'utf8');
const setupSubTabsSource = fs.readFileSync(path.resolve(__dirname, '../settings/PosSetupSubTabs.jsx'), 'utf8');
const toasterSource = fs.readFileSync(path.resolve(__dirname, '../../../../Components/ui/sonner.jsx'), 'utf8');
const invitationModalSource = fs.readFileSync(path.resolve(__dirname, '../../../../Components/users/UserInvitationModal.jsx'), 'utf8');
const confirmActionDialogSource = fs.readFileSync(path.resolve(__dirname, '../../../../Components/ui/ConfirmActionDialog.jsx'), 'utf8');
const attendanceCardSource = fs.readFileSync(path.resolve(__dirname, '../components/PosCashierAttendanceSettingsCard.jsx'), 'utf8');

describe('regular POS Setup cashier management contract', () => {
  it('refreshes canonical permissions after OPIS changes the shared account', () => {
    expect(terminalPageSource).toContain('subscribeToBusinessAdminSettingsUpdates');
    expect(terminalPageSource).toContain('shouldRefreshBusinessAdminSettingsUpdate');
    expect(terminalPageSource).toContain('installCrossAppSettingsRefresh');
    expect(terminalPageSource).toContain('setSettingsRefreshKey((previous) => previous + 1)');
    expect(workspaceSource).toContain('}, [loadCashierAccounts, settingsRefreshKey]);');
    expect(workspaceSource).toContain('}, [loadDayCloseOperators, settingsRefreshKey]);');
  });

  it('renders DGFY cashier invitation management inside terminal settings', () => {
    expect(workspaceSource).toContain('Invite DGFY accounts and assign one or more store locations first.');
    expect(workspaceSource).toContain('getCashiersForLocation(selectedTerminal.location_id)');
    expect(workspaceSource).toContain('fixedRole="cashier"');
    expect(workspaceSource).toContain('locationOptions={locations}');
    expect(workspaceSource).toContain('Invite DGFY Cashier');
    expect(workspaceSource).not.toContain('createPosSetupCashier');
  });

  it('explains the location-scoped cashier contract beside the terminal table', () => {
    expect(workspaceSource).toContain('Cashiers shown here are assigned to this terminal.');
    expect(workspaceSource).toContain('Permission changes update the cashier account wherever they sign in.');
    expect(workspaceSource).toContain('Store location · {resolvedLocationName}');
    expect(workspaceSource).toContain('locationName={locations.find');
    expect(workspaceSource).toContain('description="Controls this cashier account&apos;s permission to authorize POS discounts."');
  });

  it('keeps the store location scope badge in the cashier heading row', () => {
    expect(cashierTableSource).toContain('className="flex flex-wrap items-center gap-1.5"');
    expect(cashierTableSource).toContain('title={`Store location · ${resolvedLocationName}`}');
    expect(cashierTableSource).toContain('<span className="min-w-0 truncate">Store location · {resolvedLocationName}</span>');
    expect(cashierTableSource).not.toContain('className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-blue-50');
  });

  it('keeps the cashier table heading free of an extra divider line', () => {
    expect(cashierTableSource).toContain('className="relative flex flex-col gap-4 px-0 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8"');
    expect(cashierTableSource).not.toContain('className="relative flex flex-col gap-3 border-b border-slate-100 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"');
  });

  it('separates cashier settings from terminal pagination with responsive spacing', () => {
    expect(cashierTableSource).toContain('className="mt-8 min-w-0 sm:mt-10"');
    expect(cashierTableSource).toContain('className="flex w-full min-w-0 items-center gap-2 sm:w-auto lg:gap-3"');
  });

  it('renders cashier permissions as a compact horizontally scrollable table on mobile', () => {
    expect(cashierTableSource).toContain('function MobileCashierTable({');
    expect(cashierTableSource).toContain('className="min-w-0 md:hidden"');
    expect(cashierTableSource).toContain('Swipe horizontally to view all permissions.');
    expect(cashierTableSource).toContain('className={`${POS_TABLE_SURFACE_CLASS} min-w-0 overflow-x-auto overscroll-x-contain`}');
    expect(cashierTableSource).toContain('role="region"');
    expect(cashierTableSource).toContain('aria-label="Cashier permissions table on mobile"');
    expect(cashierTableSource).toContain('tabIndex={0}');
    expect(cashierTableSource).toContain('<table className="w-full min-w-[720px] table-fixed text-left text-[12px]">');
    expect(cashierTableSource).not.toContain('sticky left-0');
    expect(cashierTableSource).not.toContain('sticky right-0');
    expect(cashierTableSource).toContain('className="px-2 py-2.5 align-middle"');
    expect(cashierTableSource).toContain('className="px-2 py-2.5 text-right align-middle"');
    expect(cashierTableSource).toContain('aria-label="POS Discount Authorization"');
    expect(cashierTableSource).toContain('aria-label="Cashier Void and Cash Authorization"');
    expect(cashierTableSource).toContain('className={`${POS_TABLE_SURFACE_CLASS} hidden md:block`}');
    expect(cashierTableSource).toContain('testId={`mobile-pos-cashier-discount-toggle-${cashier.user_id}`}');
    expect(cashierTableSource).toContain('testId={`mobile-pos-cashier-drawer-toggle-${cashier.user_id}`}');
  });

  it('switches Settings data tables at tablet width without removing cashier permission controls', () => {
    [employeeTableSource, deliveryTableSource, employeeCreditTableSource].forEach((source) => {
      expect(source).toContain('hidden min-[768px]:block');
      expect(source).toContain('min-[768px]:hidden');
    });
    expect(cashierTableSource).toContain('data-pos-cashier-permissions-header="true">Permissions</span>');
    expect(cashierTableSource).toContain('data-pos-cashier-permission="discount"');
    expect(cashierTableSource).toContain('data-pos-cashier-permission="day-close"');
    expect(cashierTableSource).toContain('data-pos-cashier-permission="cashier-void"');
    expect(cashierTableSource).toContain('data-pos-cashier-terminals-cell="true"');
    expect(cashierTableSource).toContain('pos-cashier-permissions-data-row');
  });

  it('uses compact mobile gutters across Settings data tables', () => {
    [employeeTableSource, deliveryTableSource, employeeCreditTableSource].forEach((source) => {
      expect(source).toContain('px-2 py-2.5 sm:px-2.5');
      expect(source).toContain('border-t border-slate-100 px-5 py-3.5 sm:flex-row');
      expect(source).toContain('sm:px-3');
    });
    expect(cashierTableSource).toContain('className="px-2 py-2.5"');
  });

  it('gives cashier actions a readable search width and solid invite treatment', () => {
    expect(cashierTableSource).toContain('className="min-w-0 flex-1 sm:w-64 sm:flex-none"');
    expect(cashierTableSource).toContain('className="h-9 w-10 shrink-0 justify-center gap-1.5 rounded-lg border border-[#1A4E8D] bg-[#1A4E8D] p-0 text-[13px] font-semibold text-white shadow-sm hover:bg-[#143F73] sm:w-auto sm:px-3 sm:text-[14px]"');
    expect(cashierTableSource).toContain('<UserRoundPlus className="h-4 w-4 shrink-0" aria-hidden="true" />');
    expect(cashierTableSource).toContain('<span className="sr-only sm:not-sr-only">Invite Cashier</span>');
    expect(cashierTableSource).not.toContain('font-extrabold text-[#1A4E8D] hover:bg-blue-50 sm:text-[14px]');
  });

  it('keeps location invitations while assigning eligible cashiers per terminal', () => {
    expect(workspaceSource).toContain('cashier_user_ids');
    expect(workspaceSource).toContain('getCashiersForTerminal(selectedTerminal)');
    expect(workspaceSource).toContain('locationCashiers={getCashiersForLocation(selectedTerminal.location_id)}');
    expect(workspaceSource).not.toContain('onToggleCashierAssignment');
    expect(cashierTableSource).toContain('onSave={(terminalIndexes) => onAssignCashier(cashier, terminalIndexes)}');
    expect(cashierTableSource).toContain('aria-label={`Assign ${cashierLabel} to terminals`}');
    expect(terminalSectionSource).toContain('nextRegistry[index].cashier_user_ids = normalizeTerminalCashierIds(Array.from(assignedIds));');
    expect(terminalSectionSource).toContain('cashier_user_ids: []');
    expect(terminalSectionSource).toContain("key === 'location_id' && toPositiveInt(current.location_id) !== toPositiveInt(value)");
    expect(terminalIdentitySource).toContain('normalizeTerminalCashierIds');
    expect(terminalIdentitySource).toContain('cashier_user_ids: cashierUserIds');
  });

  it('loads active cashier authorization profiles after invitation acceptance', () => {
    expect(workspaceSource).toContain('const rows = await fetchPosSetupCashiers();');
    expect(workspaceSource).toContain("resolveUserPermissionList(terminalUser).includes('users:manage')");
    expect(workspaceSource).toContain("resolveUserPermissionList(terminalUser).includes('users:delete')");
    expect(workspaceSource).toContain('removeUserFromCompany(userId)');
    expect(workspaceSource).toContain('data-testid={`remove-cashier-${cashier.user_id}`}');
    expect(workspaceSource).toContain('Remove cashier access');
  });

  it('supports explicit per-terminal cashier assignments with legacy location fallback', () => {
    expect(workspaceSource).toContain('normalizeTerminalCashierIds');
    expect(workspaceSource).toContain('const getAssignedCashierIds = (terminal) =>');
    expect(workspaceSource).toContain('getCashiersForTerminal');
    expect(workspaceSource).toContain('const updateCashierTerminalAssignments = async');
    expect(workspaceSource).toContain('cashier_user_ids');
    expect(cashierTableSource).toContain('aria-label="Cashier assignment scope"');
    expect(cashierTableSource).toContain('onAssignCashier={onAssignCashier}');
  });

  it('presents terminal settings as a selected terminal detail view', () => {
    expect(workspaceSource).toContain('role="list"');
    expect(workspaceSource).toContain('aria-label="Registered POS terminals"');
    expect(workspaceSource).toContain('selectedTerminalIndex');
    expect(workspaceSource).toContain('setSelectedTerminalIndex(index)');
    expect(workspaceSource).toContain('getCashiersForLocation(selectedTerminal.location_id)');
    expect(workspaceSource).toContain('role="table"');
    expect(workspaceSource).toContain('aria-label="Cashier permissions for selected terminal"');
    expect(workspaceSource).toContain('Assigned terminals');
    expect(workspaceSource).toContain('role="checkbox"');
    expect(workspaceSource).toContain('onAssignCashier={updateCashierTerminalAssignments}');
  });

  it('keeps cashier assignment in the per-cashier terminal column', () => {
    expect(cashierTableSource).not.toContain('Assign cashiers');
    expect(cashierTableSource).not.toContain('Assign cashiers</Button>');
    expect(cashierTableSource).not.toContain('id="pos-terminal-cashier-assignment-panel"');
    expect(cashierTableSource).toContain('aria-label={`Assign ${cashierLabel} to terminals`}');
    expect(cashierTableSource).toContain('{assignedCount > 0 ? `${assignedCount} assigned` : \'Assign\'}');
  });

  it('uses compact terminal switches and a shared modal for terminal edits', () => {
    expect(terminalSectionSource).toContain("enabled ? 'border-[#1A4E8D] bg-[#1A4E8D]' : 'border-slate-300 bg-slate-300'");
    expect(terminalSectionSource).toContain('inline-flex h-6 w-11 shrink-0 items-center rounded-full');
    expect(terminalSectionSource).toContain('flex h-4 w-4 items-center justify-center rounded-full');
    expect(terminalSectionSource).toContain("enabled ? 'translate-x-5' : 'translate-x-0'");
    expect(terminalSectionSource).toContain('<Check className="h-3 w-3" strokeWidth={3} />');
    expect(terminalSectionSource).toContain('<Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden="true" />');
    expect(terminalSectionSource).toContain("toggleTerminalFlag(index, 'is_active', value)");
    expect(terminalSectionSource).toContain("toggleTerminalFlag(index, 'is_default', value)");
    expect(terminalSectionSource).toContain('open={editingTerminalIndex != null && editingTerminalDraft != null}');
    expect(terminalSectionSource).toContain('editing={editingTerminalIndex != null && editingTerminalIndex < terminalRegistry.length}');
    expect(terminalSectionSource).not.toContain('aria-label="Edit terminal"');
    expect(terminalSectionSource).toContain('onDelete={deleteTerminal}');
    expect(terminalModalSource).toContain("editing ? `Edit ${draft?.terminal_id || 'terminal'}` : 'Add terminal'");
    expect(terminalModalSource).toContain("editing ? 'Save Changes' : 'Add terminal'");
  });

  it('uses specific feedback for each terminal registry action', () => {
    expect(workspaceSource).toContain('const handleTerminalRegistrySave = useCallback(async (terminalRegistryOverride, options = {}) => {');
    expect(workspaceSource).toContain("'Terminal settings updated.'");
    expect(workspaceSource).not.toContain("toast.success('Terminal registry saved.')");
    expect(terminalSectionSource).toContain('Active terminal ${value === true ? \'enabled\' : \'disabled\'}.');
    expect(terminalSectionSource).toContain(": 'Default terminal updated.';");
    expect(terminalSectionSource).toContain("successMessage: 'Cashier terminal assignments updated.'");
    expect(terminalSectionSource).toContain("successMessage: editingExistingTerminal ? 'Terminal updated.' : 'Terminal added.'");
    expect(terminalSectionSource).toContain("successMessage: 'Terminal removed.'");
  });

  it('maps toast feedback tones to semantic colors while retaining Sonner status icons', () => {
    expect(toasterSource).toContain('richColors');
    expect(toasterSource).toContain('success:');
    expect(toasterSource).toContain('!bg-emerald-50');
    expect(toasterSource).toContain('warning:');
    expect(toasterSource).toContain('!bg-amber-50');
    expect(toasterSource).toContain('error:');
    expect(toasterSource).toContain('!bg-red-50');
    expect(toasterSource).toContain('info:');
    expect(toasterSource).toContain('!bg-blue-50');
  });

  it('uses a lightweight black scrim for every POS Settings dialog', () => {
    const overlayClass = 'overlayClassName="bg-black/30 backdrop-blur-none"';
    expect((workspaceSource.match(new RegExp(overlayClass, 'g')) || []).length).toBeGreaterThanOrEqual(10);
    expect(workspaceSource).not.toContain('overlayClassName="bg-slate-950/60 backdrop-blur-sm"');
    expect(invitationModalSource).toContain('overlayClassName={overlayClassName}');
    expect(confirmActionDialogSource).toContain('overlayClassName={overlayClassName}');
  });

  it('keeps Settings modal fields mobile-safe and uses the DGFY primary color', () => {
    expect(terminalModalSource).toContain('text-[13px] font-extrabold text-[#0F172A] sm:text-[14px]');
    expect(closeoutModalSource).toContain('text-[16px] font-extrabold text-[#0F172A]');
    expect(workspaceSource).toContain('id="pos-approval-pin"');
    expect(workspaceSource).toContain('className="mt-1 text-[16px] sm:text-[14px]"');
    expect(invitationModalSource).toContain('className="pl-9 text-[16px] sm:text-[14px]"');
    expect(invitationModalSource).toContain('className="text-[16px] sm:text-[14px]"');
    expect(confirmActionDialogSource).toContain('text-[16px] font-normal');
    expect(invitationModalSource).toContain('bg-[#1A4E8D] text-[13px] font-extrabold text-white hover:bg-[#143F73]');
    expect(workspaceSource).toContain('className="bg-[#1A4E8D] text-white hover:bg-[#143F73]"');
    expect(confirmActionDialogSource).toContain("confirmClassName || (destructive ? 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-600' : '')");
    expect(workspaceSource).toContain('confirmClassName="min-h-9 min-w-0 flex-1 bg-[#1A4E8D] text-[13px] font-extrabold text-white hover:bg-[#143F73] focus-visible:ring-[#1A4E8D] sm:flex-none sm:text-[14px]"');
    expect(invitationModalSource).not.toContain('bg-teal-600 hover:bg-teal-700');
    expect(workspaceSource).not.toContain('bg-teal-600 hover:bg-teal-700');
  });

  it('keeps terminal cards in a responsive horizontal rail with edge-aware controls', () => {
    expect(terminalSectionSource).toContain('snap-x snap-mandatory');
    expect(terminalSectionSource).toContain('min-[1200px]:w-[calc((100%-1.5rem)/3)]');
    expect(terminalSectionSource).toContain('scrollTerminalCarousel');
    expect(terminalSectionSource).toContain('function TerminalCarouselPagination({');
    expect(terminalSectionSource).toContain('terminalCarouselState.canScrollPrevious');
    expect(terminalSectionSource).toContain('terminalCarouselState.canScrollNext');
    expect(terminalSectionSource).toContain('className="mt-6 flex min-w-0 flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between"');
    expect(terminalSectionSource).toContain('className="flex w-full min-w-0 items-center gap-2 sm:w-auto"');
    expect(terminalSectionSource).toContain('className="mt-4 flex items-center justify-center gap-1.5" aria-label="Terminal list pagination"');
    expect(terminalSectionSource).toContain('role="tablist" aria-label="Terminal list pages"');
    expect(terminalSectionSource).toContain('className="group grid h-9 w-9 shrink-0 place-items-center rounded-full');
    expect(terminalSectionSource).toContain('className={`h-2.5 w-2.5 rounded-full transition-colors');
    expect(terminalSectionSource).toContain('onSelect={scrollToTerminal}');
    expect(terminalSectionSource).toContain('className="mt-3 min-w-0 flex snap-x snap-mandatory gap-3 overflow-x-auto');
    expect(terminalSectionSource).toContain('aria-label="Show previous terminals"');
    expect(terminalSectionSource).toContain('aria-label="Show more terminals"');
    expect(terminalSectionSource).not.toContain('grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center');
    expect(terminalSectionSource).not.toContain('className="justify-self-start grid h-10 w-10 place-items-center');
    expect(terminalSectionSource).not.toContain('className="justify-self-end grid h-10 w-10 place-items-center');
    expect(terminalSectionSource).not.toContain('className="absolute left-2 top-1/2 z-10 grid h-10 w-10');
    expect(terminalSectionSource).not.toContain('className="absolute right-2 top-1/2 z-10 grid h-10 w-10');
  });

  it('places terminal pagination below the card rail and groups desktop controls beside the dots', () => {
    const railIndex = terminalSectionSource.indexOf('role="list" aria-label="Registered POS terminals"');
    const paginationIndex = terminalSectionSource.indexOf('<TerminalCarouselPagination');

    expect(railIndex).toBeGreaterThanOrEqual(0);
    expect(paginationIndex).toBeGreaterThan(railIndex);
    expect(terminalSectionSource).toContain('className="mt-4 flex items-center justify-center gap-1.5" aria-label="Terminal list pagination"');
    expect(terminalSectionSource).not.toContain('className="mt-4 flex items-center justify-between gap-4" aria-label="Terminal list pagination"');
  });

  it('keeps terminal card borders visible and terminal status rows compact on mobile', () => {
    expect(terminalSectionSource).toContain("selected ? 'border-[#1A4E8D] shadow-sm shadow-blue-100' : 'border-[#C7D8EB] shadow-sm shadow-slate-100/60 hover:border-[#9BBBE0]'");
    expect(terminalSectionSource).toContain('className="mt-3 grid gap-2 sm:mt-4 sm:grid-cols-[minmax(0,1fr)_1px_minmax(7rem,auto)] sm:items-center sm:gap-3"');
    expect(terminalSectionSource).toContain('className="grid gap-1 sm:gap-2"');
  });

  it('uses an edge status dot instead of a terminal header status banner', () => {
    expect(terminalSectionSource).toContain('className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#1A4E8D]"');
    expect(terminalSectionSource).toContain("terminal.is_active !== false ? 'bg-emerald-500' : 'bg-red-500'");
    expect(terminalSectionSource).toContain('aria-label={`${terminal.is_active !== false ?');
    expect(terminalSectionSource).not.toContain('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-extrabold');
  });

  it('summarizes active and inactive terminals above the registry rail', () => {
    expect(terminalSectionSource).toContain('const activeTerminalCount = terminalRegistry.filter');
    expect(terminalSectionSource).toContain('const inactiveTerminalCount = terminalRegistry.length - activeTerminalCount');
    expect(terminalSectionSource).toContain('Terminal list');
    expect(terminalSectionSource).toContain('aria-label="Terminal status summary"');
    expect(terminalSectionSource).toContain('{activeTerminalCount} Active');
    expect(terminalSectionSource).toContain('{inactiveTerminalCount} Inactive');
    expect(terminalSectionSource).toContain('aria-label={`${activeTerminalCount} Active`}');
    expect(terminalSectionSource).toContain('aria-label={`${inactiveTerminalCount} Inactive`}');
    expect(terminalSectionSource).not.toContain('Active Terminals');
    expect(terminalSectionSource).not.toContain('Inactive Terminals');
    expect(terminalSectionSource).not.toContain('Active Terminal{activeTerminalCount === 1');
    expect(terminalSectionSource).not.toContain('Inactive Terminal{inactiveTerminalCount === 1');
  });

  it('keeps unsaved POS setup actions in a persistent full-width bottom bar', () => {
    expect(workspaceSource).toContain('role="status"');
    expect(workspaceSource).toContain('aria-live="polite"');
    expect(workspaceSource).toContain('fixed inset-x-0 bottom-0 z-50');
    expect(workspaceSource).toContain('border-t border-blue-200');
    expect(workspaceSource).toContain('pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]');
    expect(workspaceSource).toContain("{renderedTab === 'pos_setup' && posSetupDirty && savingTab !== 'pos_setup' ? (");
    expect(workspaceSource).toContain("{savingTab === 'pos_setup' ? 'Saving...' : 'Save Changes'}");
  });

  it('shares the Operations & Access dirty state across defaults and the settings PIN', () => {
    expect(workspaceSource).toContain('usePosOperationsAccessController');
    expect(workspaceSource).toContain('updateAccessPin');
    expect(workspaceSource).toContain('defaultsDirty');
    expect(workspaceSource).toContain('saveDefaults');
  });

  it('keeps Cashier Closeout readable until Edit opens a draft modal', () => {
    expect(workspaceSource).toContain('Cashier Closeout');
    expect(workspaceSource).toContain('Edit Cashier Closeout Defaults');
    expect(workspaceSource).toContain('Queue Location follows the active shift and cannot be changed from this dialog.');
    expect(workspaceSource).toContain('role="switch"');
    expect(workspaceSource).toContain('onSave={saveEditing}');
    expect(workspaceSource).toContain('Save Defaults');
    expect(workspaceSource).toContain('const saved = await saveDefaults(draftValues);');
    expect(workspaceSource).toContain('const nextValues = { ...posForm, posOpenStatus: posForm?.posOpenStatus !== true };');
    expect(workspaceSource).toContain('handlePosSave(nextValues ? effectiveForm : undefined, { silent: true })');
    expect(workspaceSource).toContain('hydrateSettingsWorkspace({ silent })');
  });

  it('keeps closeout modal actions inline on mobile and removes redundant intro copy', () => {
    expect(closeoutModalSource).toContain('className="flex-row items-center justify-between gap-2 border-t border-slate-100 px-5 py-4 sm:justify-end sm:gap-6 sm:px-6 sm:pt-4"');
    expect(closeoutModalSource).toContain('min-h-9 min-w-0 flex-1 rounded-xl');
    expect(closeoutModalSource).toContain('min-h-9 min-w-0 flex-1 gap-1.5 rounded-xl');
    expect(closeoutModalSource).not.toContain('Set the defaults used when a new shift or queue session starts. Changes are shared across this POS workspace.');
    expect(closeoutModalSource).not.toContain('<DialogDescription');
  });

  it('orders Operations & Access by closeout, attendance, then permissions', () => {
    const closeoutIndex = operationsAccessSource.indexOf('<PosOperationsDefaultsSection');
    const attendanceIndex = operationsAccessSource.indexOf('<section aria-label="Attendance and breaks">');
    const permissionsIndex = operationsAccessSource.indexOf('<PosAccountPermissionsSection');

    expect(closeoutIndex).toBeGreaterThanOrEqual(0);
    expect(attendanceIndex).toBeGreaterThan(closeoutIndex);
    expect(permissionsIndex).toBeGreaterThan(attendanceIndex);
  });

  it('separates Operations & Access groups with standard vertical spacing', () => {
    expect(operationsAccessSource).toContain('className="min-w-0 space-y-6 sm:space-y-8"');
  });

  it('keeps the attendance warning tooltip inside the mobile card', () => {
    expect(attendanceCardSource).toContain('className={`pointer-events-none absolute bottom-full left-0 z-20 mb-2 w-64 max-w-[calc(100vw-2rem)] break-words rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[11px] font-semibold leading-4 text-amber-900 shadow-lg shadow-amber-100/70 transition-opacity sm:right-0 sm:left-auto ${');
    expect(attendanceCardSource).toContain('id="cashier-attendance-warning"');
    expect(attendanceCardSource).toContain('role="tooltip"');
  });

  it('fills settings tabs on desktop while keeping mobile tabs comfortably spaced', () => {
    expect(workspaceSource).toContain('min-[1024px]:min-w-0 min-[1024px]:w-full min-[1024px]:gap-0');
    expect(workspaceSource).toContain('min-[1024px]:flex-1 min-[1024px]:justify-center');
    expect(workspaceSource).toContain('items-end gap-3 px-1');
    expect(workspaceSource).toContain("mobileGridClass ? 'w-full min-w-0 justify-center whitespace-normal px-2 text-center' : 'shrink-0 px-2 whitespace-nowrap'");
    expect(workspaceSource).toContain("'py-3 text-[14px] font-bold text-[#0F172A] transition-colors'");
  });

  it('centers interior settings tabs when the mobile tab rail overflows', () => {
    expect(workspaceSource).toContain('const tabsViewportRef = useRef(null);');
    expect(workspaceSource).toContain('const activeTabIndex = availableTabs.findIndex((tab) => tab.id === activeTab);');
    expect(workspaceSource).toContain('if (activeTabIndex <= 0 || activeTabIndex >= availableTabs.length - 1) return undefined;');
    expect(workspaceSource).toContain('if (!viewport || viewport.scrollWidth <= viewport.clientWidth) return undefined;');
    expect(workspaceSource).toContain('const tabCenter = tabRect.left - viewportRect.left + viewport.scrollLeft + (tabRect.width / 2);');
    expect(workspaceSource).toContain('viewport.scrollTo({');
    expect(workspaceSource).not.toContain('activeTabElement.scrollIntoView');
    expect(workspaceSource).toContain('ref={tabsViewportRef}');
  });

  it('keeps profile fields compact and grouped on mobile viewports', () => {
    expect(profilePaneSource).toContain('grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-[#E3ECF7] py-3.5 last:border-b-0');
    expect(profilePaneSource).toContain('row-span-2 flex h-10 w-10 items-center justify-center rounded-lg');
    expect(profilePaneSource).toContain('min-[1200px]:grid-cols-[3rem_minmax(16rem,0.85fr)_minmax(0,1.15fr)] min-[1200px]:items-center min-[1200px]:gap-3');
    expect(profilePaneSource).toContain('min-[1200px]:row-span-1');
  });

  it('uses tighter mobile settings gutters with a clear tab-to-content gap', () => {
    expect(workspaceSource).toMatch(/<PosPageFrame\s+id=\{sectionId\}\s+page="settings"/);
    expect(workspaceSource).toContain('id="pos-settings-panel"');
    expect(workspaceSource).toContain('className="min-w-0"');
  });

  it('keeps first POS Setup and Employees headings clear of their mobile tab rails', () => {
    expect(setupPaneSource).toContain('grid min-w-0 gap-6');
    expect(setupPaneSource).toContain('pb-[calc(8rem+env(safe-area-inset-bottom,0px))] sm:pb-20');
    expect(employeesPaneSource).toContain('grid min-w-0 max-w-full gap-6 sm:gap-4');
  });

  it('makes the Employees subtab rail full-width on desktop like POS Setup', () => {
    expect(employeesPaneSource).toContain('flex min-w-max gap-2 px-1 min-[1200px]:grid min-[1200px]:min-w-0 min-[1200px]:grid-cols-3 min-[1200px]:px-0');
    expect(employeesPaneSource).toContain('min-h-10 min-w-36 w-max shrink-0');
    expect(employeesPaneSource).toContain('min-[1200px]:min-h-9 min-[1200px]:w-full min-[1200px]:shrink min-[1200px]:px-4');
  });

  it('keeps the Business & Receipts setup action icon and label evenly spaced', () => {
    expect(businessReceiptsSource).toContain('className="mt-4 min-h-10 w-full max-w-xs gap-2 rounded-xl');
    expect(businessReceiptsSource).toContain('<Store className="h-4 w-4" />');
    expect(businessReceiptsSource).toContain('<span>Set Up Now</span>');
    expect(businessReceiptsSource).toContain('onClick={() => setIsMetadataSetupOpen(false)}');
    expect(businessReceiptsSource).toContain('>\n                  Cancel\n                </Button>');
  });

  it('keeps Profile Settings focused on field labels and values', () => {
    expect(profilePaneSource).not.toContain('Used to sign in to IMS and POS.');
    expect(profilePaneSource).not.toContain('Used for account notifications.');
    expect(profilePaneSource).not.toContain('Shared across IMS and POS.');
    expect(profilePaneSource).not.toContain('Phone number stays shared across the same tenant account used by IMS and POS.');
    expect(profilePaneSource).not.toContain('<Info');
  });

  it('keeps email verification scoped to actual email changes', () => {
    expect(workspaceSource).toContain('requestEmailChangeOtp({ email })');
    expect(workspaceSource).toContain('const emailChanged = normalizeProfileEmail(savedProfileForm.email) !== normalizeProfileEmail(baselineEmail);');
    expect(workspaceSource).toContain('if (emailChanged) {');
    expect(workspaceSource).toContain('profileUpdate.email_otp_code = String(emailOtpCode || \'\').trim();');
    expect(profilePaneSource).toContain('Email verification code');
    expect(profilePaneSource).toContain('onSave({ emailOtpCode: emailChanged ? emailOtpCode : \'\' })');
    expect(profilePaneSource).toContain('onChange={(event) => setEmailOtpCode(event.target.value.replace(/\\D/g, \'\').slice(0, 6))}');
  });

  it('keeps password changes inside the authenticated profile flow', () => {
    expect(workspaceSource).toContain('import {\n  getAllUsers,\n  changePassword,');
    expect(workspaceSource).toContain('await changePassword({ currentPassword, newPassword });');
    expect(workspaceSource).toContain('onChangePassword={handlePasswordChange}');
    expect(profilePaneSource).toContain('Current password');
    expect(profilePaneSource).toContain('Confirm new password');
    expect(profilePaneSource).toContain('onChangePassword({ currentPassword, newPassword })');
    expect(profilePaneSource).toContain('newPassword.length < 8');
  });

  it('keeps the mobile profile editor compact with inline actions', () => {
    expect(profilePaneSource).toContain('grid gap-1.5 sm:gap-2');
    expect(profilePaneSource).toContain('h-9 rounded-xl border-slate-200 pl-10');
    expect(profilePaneSource).toContain('text-[13px] font-medium leading-5 text-[#0F172A]');
    expect(profilePaneSource).toContain('grid gap-3 py-4 sm:gap-4 sm:py-5 md:grid-cols-2');
    expect(profilePaneSource).toContain('mt-4 flex flex-row justify-end gap-2');
    expect(profilePaneSource).toContain('min-h-9 min-w-0 flex-1 rounded-xl');
    expect(profilePaneSource).toContain('min-h-9 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl');
  });

  it('keeps POS Setup section labels at the compact 13px size across breakpoints', () => {
    expect(setupSubTabsSource).toContain('flex min-w-max gap-2 px-1 min-[1200px]:grid min-[1200px]:min-w-0 min-[1200px]:grid-cols-4 min-[1200px]:px-0');
    expect(setupSubTabsSource).toContain('min-w-36 w-max shrink-0');
    expect(setupSubTabsSource).toContain('whitespace-nowrap');
    expect(setupSubTabsSource).toContain('text-center text-[13px] font-bold');
    expect(setupSubTabsSource).not.toContain('grid-cols-2');
    expect(setupSubTabsSource).not.toContain('sm:text-[14px]');
  });

  it('centers interior POS Setup subtabs when the mobile rail overflows', () => {
    expect(setupSubTabsSource).toContain('const sectionsViewportRef = useRef(null);');
    expect(setupSubTabsSource).toContain('const activeSectionIndex = POS_SETUP_SECTIONS.findIndex((section) => section.id === activeSection);');
    expect(setupSubTabsSource).toContain('if (activeSectionIndex <= 0 || activeSectionIndex >= POS_SETUP_SECTIONS.length - 1) return undefined;');
    expect(setupSubTabsSource).toContain('if (!viewport || viewport.scrollWidth <= viewport.clientWidth) return undefined;');
    expect(setupSubTabsSource).toContain('const sectionCenter = sectionRect.left - viewportRect.left + viewport.scrollLeft + (sectionRect.width / 2);');
    expect(setupSubTabsSource).toContain('viewport.scrollTo({');
    expect(setupSubTabsSource).not.toContain('activeSectionElement.scrollIntoView');
    expect(setupSubTabsSource).toContain('ref={sectionsViewportRef}');
  });

  it('matches POS visibility and online-order labels to the responsive summary value size', () => {
    expect(workspaceSource).toContain('text-[13px] font-bold text-[#0F172A] sm:text-[14px]');
    expect(workspaceSource).toContain('label="POS visible to customers"');
    expect(workspaceSource).toContain('label="Online order sound"');
  });

  it('centers Operations & Access labels against their leading icons', () => {
    expect(directToggleSource).toContain('className="flex min-w-0 items-center gap-3"');
    expect(directToggleSource).not.toContain('className="flex min-w-0 items-start gap-3"');
  });

  it('keeps terminal edit controls compact without reducing their touch target', () => {
    expect(workspaceSource).toContain('aria-label={`Edit ${terminalLabel}`} title={`Edit ${terminalLabel}`}');
    expect(workspaceSource).toContain('className="pointer-events-auto h-11 w-11 shrink-0 rounded-lg border-blue-200 bg-white p-0 text-[#1A4E8D] shadow-sm hover:border-[#1A4E8D] hover:bg-blue-50 sm:h-9 sm:w-auto sm:gap-1.5 sm:px-2.5 sm:text-[12px] sm:font-extrabold"');
    expect(workspaceSource).toContain('<span className="hidden sm:inline">Edit</span>');
    expect(workspaceSource).toContain('<Pencil className="h-3.5 w-3.5 sm:h-3 sm:w-3" />');
    expect(workspaceSource).not.toContain('sm:text-[13px]" onClick={(event) => { event.stopPropagation(); beginEditing(index); }} disabled={locked || loading || editingTerminalIndex != null}><Pencil className="h-3.5 w-3.5" />Edit</Button>');
  });

  it('keeps cashier permission switches compact and inside their table columns', () => {
    expect(cashierTableSource).toContain('relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors');
    expect(cashierTableSource).toContain('grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2');
    expect(cashierTableSource).toContain('inline-flex min-w-0 items-center gap-2');
    expect(cashierTableSource).toContain('inline-grid max-w-full grid-cols-[minmax(0,max-content)_auto] items-center gap-x-2 gap-y-2');
    expect(cashierTableSource).toContain('flex flex-col items-start gap-2');
    expect(cashierTableSource).toContain('block text-[11px] font-medium leading-4 text-slate-400">Enable access to set PIN</span>');
    expect(cashierTableSource).toContain('layout="inline"');
    expect(cashierTableSource).toContain('layout="grid-cell"');
    expect(cashierTableSource).toContain('inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform');
    expect(cashierTableSource).toContain("enabled ? 'translate-x-5' : 'translate-x-1'");
    expect(cashierTableSource).not.toContain('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors');
  });

  it('uses one blue enabled state across POS Settings toggles', () => {
    expect(workspaceSource).toContain("enabled ? 'border-[#2563EB] bg-[#2563EB]'");
    expect(workspaceSource).toContain("checked === true ? 'bg-[#1A4E8D]' : 'bg-slate-200'");
    expect(workspaceSource).toContain("hasDiscountAuthorization ? 'border-[#2563EB] bg-[#2563EB]'");
    expect(workspaceSource).toContain("hasDayCloseAccess ? 'border-[#2563EB] bg-[#2563EB]'");
    expect(workspaceSource).toContain("focus-visible:ring-[#2563EB]");
    expect(workspaceSource).not.toContain('tone="rose"');
    expect(workspaceSource).not.toContain('tone="emerald"');
  });

  it('emphasizes each terminal cashier count with the POS blue accent', () => {
    expect(terminalSectionSource).toContain('<Users className="h-4 w-4 shrink-0 text-[#1A4E8D]" />');
    expect(terminalSectionSource).toContain('<span className="font-extrabold text-[#1A4E8D]">{assignedCashierCount}</span>');
  });

  it('emphasizes the selected terminal in the cashier settings subtitle', () => {
    expect(cashierTableSource).toContain('Manage cashier permissions for');
    expect(cashierTableSource).toContain('<span className="font-extrabold text-[#1A4E8D]">{terminalLabel}</span>');
  });

  it('separates the Terminal list group from the registry readiness group', () => {
    expect(terminalSectionSource).toContain('className="mt-6 flex min-w-0 flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between"');
  });

  it('guides terminal selection with a hover and keyboard accessible hint', () => {
    expect(terminalSectionSource).toContain('Select to view assigned cashiers');
    expect(terminalSectionSource).toContain('aria-describedby={terminalHint?.index === index ? `pos-terminal-selection-help-${index}` : undefined}');
    expect(terminalSectionSource).toContain('onMouseEnter={(event) => openTerminalHint(index, { x: event.clientX, y: event.clientY })}');
    expect(terminalSectionSource).toContain('onMouseMove={(event) => {');
    expect(terminalSectionSource).toContain('onFocus={() => openTerminalHint(index)}');
    expect(terminalSectionSource).toContain('role="tooltip"');
    expect(terminalSectionSource).toContain('pointer-events-none fixed z-[60] rounded-md border border-slate-700 bg-slate-950');
  });

  it('keeps Location Binding Readiness free of surrounding divider lines', () => {
    expect(terminalSectionSource).toContain('Location Binding Readiness');
    expect(terminalSectionSource).toContain('className="mt-2 rounded-xl border border-slate-200 bg-white p-3 sm:p-4"');
    expect(terminalSectionSource).toContain('className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-start sm:justify-between"');
    expect(terminalSectionSource).toContain('className="mt-6 flex min-w-0 flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between"');
    expect(terminalSectionSource).not.toContain('className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between"');
    expect(terminalSectionSource).not.toContain('className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between"');
  });

  it('uses a compact responsive layout for Location Binding Readiness metrics', () => {
    expect(terminalSectionSource).toContain('grid grid-cols-1 gap-1 md:grid-cols-3 md:gap-3 xl:grid-cols-[minmax(0,1.25fr)_repeat(3,minmax(8rem,1fr))] xl:gap-5');
    expect(terminalSectionSource).toContain('col-span-1 flex min-w-0 items-center gap-3 border-b border-slate-100 pb-3 md:col-span-3 md:border-b-0 md:pb-0 xl:col-span-1');
    expect(terminalSectionSource).toContain('className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50/70 text-[#46658F] md:grid"');
    expect(terminalSectionSource).toContain('col-span-1 flex min-w-0 items-center gap-2.5 border-b border-slate-100 py-1.5 last:border-b-0 md:border-b-0 md:py-0');
    expect(terminalSectionSource).toContain('function ReadinessMetric({ icon: Icon, label, value })');
    expect(terminalSectionSource).toContain('<ReadinessMetric icon={Database} label="Migration"');
    expect(terminalSectionSource).toContain('<ReadinessMetric icon={AlertCircle} label="Unresolved"');
    expect(terminalSectionSource).toContain('<ReadinessMetric icon={BarChart3} label="Low confidence"');
    expect(terminalSectionSource).toContain("readiness?.ready_for_strict_mode ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'");
    expect(terminalSectionSource).toContain('block text-[14px] font-extrabold leading-5 text-[#0F172A]">Location Binding Readiness</span>');
    expect(terminalSectionSource).toContain('block text-[11px] font-medium leading-4 text-[#536B8C]');
    expect(terminalSectionSource).toContain('block text-[14px] font-extrabold leading-5 text-[#0F172A]');
  });

  it('emphasizes cashier Set PIN with a solid teal action style', () => {
    expect(cashierTableSource).toContain('variant="default"');
    expect(cashierTableSource).toContain('border border-teal-600 bg-teal-600 px-2 text-[10px] font-extrabold text-white');
    expect(cashierTableSource).toContain('hover:bg-teal-700 hover:text-white');
  });

  it('keeps cashier POS void authorization inside POS Settings and preserves other permissions', () => {
    expect(workspaceSource).toContain('Cashier Void and Cash Authorization');
    expect(workspaceSource).toContain('data-testid="pos-cashier-void-authorization"');
    expect(workspaceSource).toContain('testId={`pos-cashier-void-toggle-${cashier.user_id}`}');
    expect(workspaceSource).toContain("cashierPermissions.includes('pos:void')");
    expect(workspaceSource).toContain("Array.from(new Set([...permissions, 'pos:void']))");
    expect(workspaceSource).toContain("permissions.filter((permission) => permission !== 'pos:void')");
    expect(workspaceSource).toContain('const updated = await updateUserPermissions(userId, nextPermissions);');
    expect(workspaceSource).toContain('visibleCashiers.map((cashier) =>');
    expect(workspaceSource).toContain('const [cashiersLoaded, setCashiersLoaded] = useState(false);');
    expect(workspaceSource).toContain('Loading cashiers for this store...');
    expect(workspaceSource).toContain("role !== 'cashier'");
    expect(workspaceSource).not.toContain('Skupervisor');
  });

  it('keeps physical cash authority separate and configurable inside POS Settings', () => {
    expect(workspaceSource).toContain('Can refund cash / adjust drawer');
    expect(workspaceSource).toContain('testId={`pos-cashier-drawer-toggle-${cashier.user_id}`}');
    expect(workspaceSource).toContain("cashierPermissions.includes('pos:cash_drawer_adjust')");
    expect(workspaceSource).toContain("Array.from(new Set([...permissions, 'pos:cash_drawer_adjust']))");
    expect(workspaceSource).toContain("permissions.filter((permission) => permission !== 'pos:cash_drawer_adjust')");
    expect(workspaceSource).toContain('updateCashierDrawerAccess(cashier, !hasDrawerAccess)');
  });

  it('keeps POS onboarding primary location control aligned with IMS settings', () => {
    expect(tenantSetupModalSource).toContain("import { Switch } from '@/components/ui/switch';");
    expect(tenantSetupModalSource).toContain('Primary Business Location');
    expect(tenantSetupModalSource).toContain('onCheckedChange={(checked) => setLocationDraft');
    expect(tenantSetupModalSource).toContain('{ defaultPrimary: primaryLocation == null }');
    const primaryLocationControlStart = tenantSetupModalSource.indexOf('Primary Business Location');
    const primaryLocationControlEnd = tenantSetupModalSource.indexOf('<React.Suspense', primaryLocationControlStart);
    const primaryLocationControl = tenantSetupModalSource.slice(primaryLocationControlStart, primaryLocationControlEnd);
    expect(primaryLocationControl).not.toContain('disabled={normalizedLocations.length === 0}');
  });

  it('exposes delivery and pickup availability in both POS location editors', () => {
    expect(workspaceSource).toContain("import { LAST_FULFILLMENT_METHOD_LOCKED_MESSAGE } from '@sieitzz/shared-constants/orderMethods';");
    expect(workspaceSource).toContain('const lastFulfillmentMethodLocked = effectiveMode === \'transaction\'');
    expect(storefrontPaneSource).toContain('label={STOREFRONT_LOCATION_LABELS.supportsDelivery}');
    expect(storefrontPaneSource).toContain('label={STOREFRONT_LOCATION_LABELS.supportsPickup}');
    expect(storefrontPaneSource).toContain('label={STOREFRONT_LOCATION_LABELS.supportsDineIn}');
    expect(storefrontPaneSource).toContain('checked={locationForm.supports_delivery !== false}');
    expect(storefrontPaneSource).toContain('checked={locationForm.supports_pickup !== false}');
    expect(storefrontPaneSource).toContain('checked={locationForm.supports_dine_in !== false}');
    expect(storefrontPaneSource).toContain("handleFulfillmentMethodChange('supports_delivery', value)");
    expect(storefrontPaneSource).toContain("handleFulfillmentMethodChange('supports_pickup', value)");
    expect(tenantSetupModalSource).toContain('Label>Supports Delivery</Label>');
    expect(tenantSetupModalSource).toContain('Label>Supports Pickup</Label>');
    expect(tenantSetupModalSource).toContain('checked={locationDraft.supports_delivery === true}');
    expect(tenantSetupModalSource).toContain('checked={locationDraft.supports_pickup === true}');
  });

  it('uses concise descriptions for POS storefront location toggles', () => {
    expect(storefrontPaneSource).toContain('description="Accept orders here"');
    expect(storefrontPaneSource).toContain('description="Primary storefront for map publication"');
    expect(storefrontPaneSource).toContain('description="Sell out-of-stock items"');
    expect(storefrontPaneSource).toContain('description="Accept delivery orders"');
    expect(storefrontPaneSource).toContain('description="Accept pickup orders"');
    expect(storefrontPaneSource).toContain('label={STOREFRONT_LOCATION_LABELS.supportsDineIn}');
    expect(storefrontPaneSource).toContain('description="Accept dine-in orders"');
    expect(storefrontPaneSource).toContain('description="Offer scheduled orders"');
    expect(storefrontPaneSource).toContain('description="Offer immediate fulfillment"');
  });

  it('shows the fulfillment requirement as a readable warning toast', () => {
    expect(storefrontPaneSource).toContain("import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';");
    expect(storefrontPaneSource).toContain('const FULFILLMENT_METHOD_LOCKED_TOAST_DURATION_MS = 10000;');
    expect(storefrontPaneSource).toContain("const isDeliveryOrPickup = field === 'supports_delivery' || field === 'supports_pickup';");
    expect(storefrontPaneSource).toContain('if (isDeliveryOrPickup && value === false && lastFulfillmentMethodLocked)');
    expect(storefrontPaneSource).toContain('toast.warning(LAST_FULFILLMENT_METHOD_LOCKED_MESSAGE, {');
    expect(storefrontPaneSource).toContain('duration: FULFILLMENT_METHOD_LOCKED_TOAST_DURATION_MS');
    expect(storefrontPaneSource).not.toContain('text-amber-700">{LAST_FULFILLMENT_METHOD_LOCKED_MESSAGE}');
  });

  it('keeps Storefront settings read-only by default with scoped editable subtabs', () => {
    expect(storefrontPaneSource).toContain("label: 'Store Setup'");
    expect(storefrontPaneSource).toContain("label: 'Store Content'");
    expect(storefrontPaneSource).toContain("label: 'Business Hours and Locations'");
    expect(storefrontPaneSource).toContain("label: 'Reviews'");
    expect(storefrontPaneSource).toContain('StorefrontReviewsSettings');
    expect(storefrontPaneSource).toContain('StoreSetupSummary');
    expect(storefrontPaneSource).toContain('StoreContentSummary');
    expect(storefrontPaneSource).toContain('StoreLocationsSummary');
    expect(subtabNavigationSource).toContain('min-[1024px]:grid min-[1024px]:min-w-0');
    expect(subtabNavigationSource).toContain('min-[1024px]:grid-cols-4');
    expect(subtabNavigationSource).toContain('min-w-36 w-max shrink-0');
    expect(storefrontPaneSource).toContain('idPrefix="pos-storefront-tab"');
    expect(storefrontPaneSource).toContain('aria-live="polite"');
    expect(storefrontPaneSource).toContain('<Switch');
    expect(storefrontPaneSource).toContain('handleStorefrontBooleanChange');
    expect(workspaceSource).toContain("setStorefrontBooleanState((current) => ({ ...current, [settingKey]: 'saving' }))");
    expect(workspaceSource).toContain("[settingKey]: 'saved'");
    expect(workspaceSource).toContain("[settingKey]: 'error'");
  });

  it('uses a branch-style master-detail layout for read-only storefront locations', () => {
    expect(storefrontPaneSource).toContain('aria-label="Storefront locations list"');
    expect(storefrontPaneSource).toContain('placeholder="Search branches..."');
    expect(storefrontPaneSource).toContain('Branch Information');
    expect(storefrontPaneSource).toContain('Map preview for');
    expect(storefrontPaneSource).toContain('STOREFRONT_LOCATION_LABELS.editBranch');
    expect(storefrontPaneSource).toContain('onEditLocation(selectedLocation)');
    expect(storefrontPaneSource).toContain('selectedLocationId');
    expect(storefrontPaneSource).toContain('xl:grid-cols-[minmax(0,1.35fr)_minmax(220px,0.85fr)]');
    expect(storefrontPaneSource).toContain('h-[260px] items-center justify-center text-[11px] text-[#64748B] sm:h-[340px] lg:h-[420px]');
    expect(storefrontPaneSource).toContain('h-[260px] items-center justify-center text-[11px] text-[#64748B] sm:h-[340px] lg:h-[420px]');
  });

  it('removes redundant Storefront pane headings below the nested subtab rail', () => {
    const subtabRailIndex = storefrontPaneSource.indexOf('<PosSubtabNavigation');
    const panelIndex = storefrontPaneSource.indexOf('id="pos-storefront-panel"');

    expect(subtabRailIndex).toBeGreaterThanOrEqual(0);
    expect(panelIndex).toBeGreaterThan(subtabRailIndex);
    expect(storefrontPaneSource).not.toContain('StorefrontPaneHeader');
    expect(storefrontPaneSource).not.toContain('>Storefront settings</p>');
    expect(storefrontPaneSource).not.toContain('{activeTab.description}');
    expect(storefrontPaneSource).not.toContain('Review the current configuration, then select Edit');
  });

  it('matches the Store Setup preview layout with toggles, ID actions, and access cards', () => {
    expect(storefrontPaneSource).toContain('Controls public storefront visibility from shared tenant settings.');
    expect(storefrontPaneSource).toContain('Preserves the same no-location storefront behavior used in IMS.');
    expect(storefrontPaneSource).toContain('Generate Storefront ID');
    expect(storefrontPaneSource).toContain('CustomerAccessModeCards');
    expect(storefrontPaneSource).toContain('Applied automatically');
    expect(storefrontPaneSource).toContain("onToggle?.('storeIsVisible', 'store_is_visible', 'Storefront visibility'");
    expect(storefrontPaneSource).toContain('onCustomerAccessModeChange');
    expect(storefrontPaneSource).not.toContain('StorefrontPaneHeader');
    expect(storefrontPaneSource).toContain('className="space-y-3 pt-4 sm:pt-6" aria-labelledby="storefront-access-summary-heading"');
  });

  it('orders Store Setup summary groups from identity to access to visibility controls', () => {
    const summaryStart = storefrontPaneSource.indexOf('function StoreSetupSummary');
    const summaryEnd = storefrontPaneSource.indexOf('const createAdjustedCoverFile', summaryStart);
    const summarySource = storefrontPaneSource.slice(summaryStart, summaryEnd);
    const identityIndex = summarySource.indexOf('id="storefront-id-summary-heading"');
    const accessIndex = summarySource.indexOf('id="storefront-access-summary-heading"');
    const visibilityIndex = summarySource.indexOf('label="Storefront visible"');
    const displayOptionsIndex = summarySource.indexOf('<StorefrontDisplayOptions');

    expect(identityIndex).toBeGreaterThanOrEqual(0);
    expect(identityIndex).toBeLessThan(accessIndex);
    expect(accessIndex).toBeLessThan(visibilityIndex);
    expect(visibilityIndex).toBeLessThan(displayOptionsIndex);
  });

  it('uses three columns for Display and checkout options on desktop screens', () => {
    const displayOptionsStart = storefrontPaneSource.indexOf('function StorefrontDisplayOptions');
    const displayOptionsEnd = storefrontPaneSource.indexOf('function CustomerAccessModeCards', displayOptionsStart);
    const displayOptionsSource = storefrontPaneSource.slice(displayOptionsStart, displayOptionsEnd);

    expect(displayOptionsSource).toContain('grid gap-3 sm:grid-cols-2 lg:grid-cols-6');
    expect(displayOptionsSource).toContain('className="lg:col-span-2"');
    expect(displayOptionsSource).toContain('className="lg:col-span-3"');
    expect(displayOptionsSource).not.toContain('<ReadOnlySection title="Display and checkout options">');
    expect(displayOptionsSource).toContain('aria-labelledby="storefront-display-options-heading"');
  });

  it('matches the Store Content basic information summary layout', () => {
    expect(storefrontPaneSource).toContain('Basic Information');
    expect(storefrontPaneSource).toContain('This information will appear on your storefront.');
    expect(storefrontPaneSource).toContain('A short phrase that describes your store.');
    expect(storefrontPaneSource).toContain('A brief description about your store.');
    expect(storefrontPaneSource).toContain('aria-labelledby="store-basic-information-heading"');
    expect(storefrontPaneSource).toContain('sm:grid-cols-[minmax(0,280px)_minmax(0,1fr)]');
    expect(storefrontPaneSource).toContain('sm:border-l sm:border-slate-200 sm:pl-4');
    expect(storefrontPaneSource).not.toContain('Public contact and description');
  });

  it('uses category count to prevent empty desktop Store Content columns', () => {
    expect(storefrontPaneSource).toContain('const categoryCount = normalizeStoreContentStringList(storefrontForm?.storefrontCategories).length;');
    expect(storefrontPaneSource).toContain('const categoriesFitBesideWhy = categoryCount >= 1 && categoryCount <= 5;');
    expect(storefrontPaneSource).toContain("categoriesFitBesideWhy ? 'min-w-0' : 'min-w-0 lg:col-span-2'");
    expect(storefrontPaneSource).toContain('className="min-w-0 lg:col-span-2"');
  });

  it('stretches Store Categories and Why Choose Us panels to the same desktop height', () => {
    expect(storefrontPaneSource).toContain('grid gap-4 lg:grid-cols-2 lg:items-stretch');
    expect(storefrontPaneSource).toContain('<StorefrontCategoriesSettings className="h-full"');
    expect(storefrontPaneSource).toContain('<StorefrontWhyChooseUsSettings interactionMode="modal" className="h-full"');
    expect(storefrontCategoriesSource).toContain("className = ''");
    expect(storefrontWhyChooseUsSource).toContain("className = ''");
  });

  it('keeps Store Categories feature-owned and responsive across its required states', () => {
    expect(storefrontPaneSource).toContain("import StorefrontCategoriesSettings from './StorefrontCategoriesSettings.jsx';");
    expect(storefrontPaneSource).toContain('<StorefrontCategoriesSettings');
    expect(storefrontPaneSource).toContain('storefrontCategories: nextCategories');
    expect(storefrontCategoriesSource).toContain('export const MAX_STOREFRONT_CATEGORIES = 10;');
    expect(storefrontCategoriesSource).toContain('Store Categories');
    expect(storefrontCategoriesSource).toContain('Organize the categories customers can browse on your storefront.');
    expect(storefrontCategoriesSource).toContain('lg:grid-cols-2');
    expect(storefrontCategoriesSource).toContain('Maximum of 10 categories.');
    expect(storefrontCategoriesSource).toContain('No categories yet');
    expect(storefrontCategoriesSource).toContain('Add Category');
    expect(storefrontCategoriesSource).toContain('Edit Category');
    expect(storefrontCategoriesSource).toContain('Remove Category');
    expect(storefrontCategoriesSource).not.toContain('draggable={!disabled}');
    expect(storefrontCategoriesSource).not.toContain('onMoveWithKeyboard');
    expect(storefrontCategoriesSource).not.toContain('Drag and drop to reorder');
    expect(storefrontCategoriesSource).toContain('aria-live="polite"');
    expect(storefrontCategoriesSource).toContain('variant="destructive"');
    expect(storefrontCategoriesSource).toContain('description={`Are you sure you want to remove');
  });

  it('keeps Store Categories balanced while rendering Why Choose Us one phrase per row', () => {
    expect(storefrontCategoriesSource).toContain('function splitIntoBalancedColumns(items)');
    expect(storefrontCategoriesSource).toContain('const firstColumnCount = Math.ceil(items.length / 2);');
    expect(storefrontCategoriesSource).toContain("startIndex={columnIndex === 0 ? 0 : firstColumnCount}");
    expect(storefrontCategoriesSource).toContain("categoriesUseTwoColumns ? 'lg:grid-cols-2 lg:gap-x-4' : ''");
    expect(storefrontWhyChooseUsSource).not.toContain('function splitIntoBalancedColumns(items)');
    expect(storefrontWhyChooseUsSource).not.toContain("phrasesUseTwoColumns ? 'lg:grid-cols-2 lg:gap-x-4' : ''");
    expect(storefrontWhyChooseUsSource).toContain('hasData={visiblePhrases.length > 0}');
    expect(storefrontWhyChooseUsSource).toContain('<PhraseColumn phrases={visiblePhrases} startIndex={0} {...sharedRowProps} />');
  });

  it('keeps Store Content Why Choose Us phrases read-only outside the edit dialog', () => {
    expect((storefrontPaneSource.match(/<StorefrontWhyChooseUsSettings\s+interactionMode="modal"/g) || []).length).toBe(3);
    expect(storefrontWhyChooseUsSource).toContain('modalMode ?');
    expect(storefrontWhyChooseUsSource).toContain('break-words whitespace-normal');
    expect(storefrontWhyChooseUsSource).toContain('Edit phrase');
  });

  it('uses full-width auto-fit tracks for delivery partners and social links', () => {
    expect(storefrontDeliveryPartnersSource).toContain('grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-2.5');
    expect(storefrontDeliveryPartnersSource).not.toContain('sm:inline-grid sm:w-fit');
    expect(storefrontDeliveryPartnersSource).toContain('aria-label="Storefront delivery partners"');
    expect(storefrontDeliveryPartnersSource).toContain('export const MAX_STOREFRONT_DELIVERY_PARTNERS = 4;');
    expect(storefrontSocialLinksSource).toContain('grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))]');
    expect(storefrontSocialLinksSource).toContain("'gap-3'");
    expect(storefrontSocialLinksSource).toContain("'gap-0 divide-y divide-slate-200 sm:divide-y-0 sm:divide-x'");
    expect(storefrontSocialLinksSource).toContain('aria-label="Storefront social links"');
  });

  it('uses a banner store image preview with an overlapping profile icon', () => {
    expect(storefrontPaneSource).toContain('id="store-image-summary-heading"');
    expect(storefrontPaneSource).toContain('>Store Image</h3>');
    expect(storefrontPaneSource).toContain('absolute -bottom-8 left-4');
    expect(storefrontPaneSource).toContain('<Camera className="h-3.5 w-3.5"');
    expect(storefrontPaneSource).toContain('Storefront cover preview');
    expect(storefrontPaneSource).toContain('Storefront profile preview');
    expect(storefrontPaneSource).not.toContain('ariaLabel="Edit Store Content"');
    expect(storefrontPaneSource).toContain('ariaLabel="Edit Store Image"');
    expect(storefrontPaneSource).toContain('id="store-information-summary-heading"');
    expect(storefrontPaneSource).toContain('<Phone className="h-4 w-4"');
    expect(storefrontPaneSource).toContain('<Mail className="h-4 w-4"');
    expect(storefrontPaneSource).toContain('storefrontLocations.find((location) => location?.is_primary_storefront === true)');
    expect(storefrontPaneSource).not.toContain('rounded-lg border border-slate-100 bg-slate-50/60');
    expect(storefrontPaneSource).toContain('Edit cover photo');
    expect(storefrontPaneSource).not.toContain('storefront-profile-upload-summary');
    expect(storefrontPaneSource).not.toContain('createAdjustedCoverFile');
    expect(storefrontPaneSource).toContain('StorefrontCoverImage');
    expect(storefrontPaneSource).toContain('initialTransform={storefrontAssets.coverTransform}');
    expect(workspaceSource).toContain('storefront_cover_image_transform');
    expect(workspaceSource).toContain('normalizeCoverPhotoTransform');
    expect(storefrontPaneSource).toContain('aria-label="Cover photo adjustment canvas"');
    expect(storefrontPaneSource).toContain('aria-label="Cover photo editing help"');
    expect(storefrontPaneSource).toContain('group-hover:opacity-100');
    expect(storefrontPaneSource).toContain('aria-label="Cover photo actions"');
    expect(storefrontPaneSource).toContain('Upload photo');
    expect(storefrontPaneSource).toContain('Reposition');
    expect(storefrontPaneSource).toContain('Remove');
    expect(storefrontPaneSource).toContain('onRemove={() => handleDeleteAsset(\'cover\')}');
    expect(storefrontPaneSource).toContain('touch-none');
    expect(storefrontPaneSource).toContain('overscroll-contain');
    expect(storefrontPaneSource).toContain('Drag or use arrow keys to reposition image');
    expect(storefrontPaneSource).toContain('bg-slate-950/45');
    expect(storefrontPaneSource).toContain('Reposition to drag, pinch, and zoom.');
    expect(storefrontPaneSource).not.toContain('aria-label="Zoom out cover photo"');
    expect(storefrontPaneSource).not.toContain('aria-label="Zoom in cover photo"');
    expect(storefrontPaneSource).not.toContain('Cover photo editing controls');
    expect(storefrontPaneSource).not.toContain('onDoubleClick={handlePreviewDoubleClick}');
    expect(storefrontPaneSource).not.toContain('onDrop={handlePreviewDrop}');
    expect(storefrontPaneSource).not.toContain('aria-label="Cover photo zoom" type="range"');
    expect(storefrontPaneSource).toContain('storefront-profile-upload-edit');
    expect(storefrontPaneSource).not.toContain('aria-label="Remove cover photo"');
  });

  it('keeps cashier provisioning out of POS onboarding while preserving authorization readiness', () => {
    expect(tenantSetupModalSource).not.toContain('Cashier Gmail');
    expect(tenantSetupModalSource).not.toContain('Cashier Password');
    expect(tenantSetupModalSource).not.toContain('provisionCashierFromGmail');
    expect(tenantSetupModalSource).not.toContain('Invite DGFY Cashier');
    expect(tenantSetupModalSource).toContain('Cashier invitations and location permissions are managed from POS Settings.');
    expect(tenantSetupModalSource).toContain('active cashier or company master admin');
    expect(tenantSetupModalSource).toContain('Select a store for each active terminal before saving.');
    expect(tenantSetupModalSource).toContain('terminalSaveFeedback');
    expect(tenantSetupModalSource).toContain('terminalFieldErrors');
  });

  it('places business hours before the location editor and persists the shared storefront setting', () => {
    expect(tenantSetupModalSource).toContain('StorefrontBusinessHoursScheduler');
    expect(tenantSetupModalSource).toContain('Save Business Hours');
    expect(tenantSetupModalSource).toContain('storefront_hours: serializeStorefrontBusinessHours(storefrontHours)');
    expect(tenantSetupModalSource).toContain('onKeyDown={handleDialogKeyDown}');
    expect(tenantSetupModalSource.indexOf('Business Hours')).toBeLessThan(tenantSetupModalSource.indexOf('Business Location'));
    expect(tenantSetupModalSource).toContain('STARTER_ITEM');
    expect(tenantSetupModalSource).toContain('starterItemRequirements');
    expect(tenantSetupModalSource).toContain('Save Room Setup');
    expect(tenantSetupModalSource).not.toContain('Save Starter Item');
  });

  it('provides an inline business-hours editor from the storefront locations summary', () => {
    expect(storefrontPaneSource).toContain('Edit Business Hours');
    expect(storefrontPaneSource).toContain('storefront-business-hours-editor');
    expect(storefrontPaneSource).toContain('aria-label="Edit Business Hours"');
    expect(storefrontPaneSource).toContain('aria-label="Close business hours editor"');
    expect(storefrontPaneSource).toContain('onSaveBusinessHours={(nextHours) => {');
    expect(storefrontPaneSource).toContain("handleStorefrontGroupSave('basic', { ...storefrontForm, storefrontHours: nextHours })");
    expect(storefrontPaneSource).toContain('showHeader={!inlinePreview}');
    expect(storefrontHoursSchedulerSource).toContain('showHeader = true');
    expect(storefrontHoursSchedulerSource).toContain('className={`mt-3 grid gap-4 ${registrationScheduleEditor ?');
    expect(storefrontHoursSchedulerSource).toContain("'min-[1200px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2.5fr)_auto] min-[1200px]:items-end'");
    expect(storefrontHoursSchedulerSource).toContain('grid min-w-0 grid-cols-2 gap-2 sm:gap-3');
    expect(storefrontHoursSchedulerSource).toContain('Add Schedule Set');
    expect(storefrontHoursSchedulerSource).toContain('aria-label={`Edit ${formatScheduleDayLabel(set.dayKeys)} schedule`}');
    expect(storefrontHoursSchedulerSource).toContain('aria-label={`Remove ${formatScheduleDayLabel(set.dayKeys)} schedule`}');
    expect(storefrontHoursSchedulerSource).not.toContain('Closed days');
    expect(storefrontHoursSchedulerSource).not.toContain('handleClosedDayToggle');
  });

  it('keeps onboarding open until Finish Setup instead of allowing early dismissal', () => {
    expect(tenantSetupModalSource).toContain('<Dialog open={open} onOpenChange={() => {}}>');
    expect(tenantSetupModalSource).toContain('onEscapeKeyDown={(event) => event.preventDefault()}');
    expect(tenantSetupModalSource).toContain('onInteractOutside={(event) => event.preventDefault()}');
    expect(tenantSetupModalSource).toContain('Finish all required steps, then click');
    expect(tenantSetupModalSource).not.toContain('onSkip');
  });

  it('lets cashier protected tools reach the POS access PIN gate without an open shift', () => {
    expect(terminalPageSource).toContain("const SHIFT_EXEMPT_VIEW_MODES = new Set([...SETTINGS_VIEW_MODES, 'reports', 'audit', 'items', 'services', 'history', 'approvals']);");
    expect(terminalPageSource).toContain('const PIN_PROTECTED_VIEW_MODES = new Set(');
    expect(terminalPageSource).toContain("[...SETTINGS_VIEW_MODES, 'items'].filter((mode) => mode !== 'settings_vouchers' && mode !== 'settings_pricelists')");
    expect(terminalPageSource).toContain('if (requiresOpenShift && !isSettingsViewMode && !isShiftExemptViewMode && !canAdminBypassShiftPrompt) {');
    expect(terminalPageSource).toContain('await verifyPosSettingsAccessPin(normalizedPin);');
    expect(terminalPageSource).toContain('const hydrateTerminalMeta = useCallback');
    expect(terminalPageSource).toContain('hydrateTerminalMeta({ suppressGlobalErrors: true })');
    expect(terminalPageSource).toContain('setSettingsAccessPinVerified(true);');
    expect(terminalPageSource).toContain('commitViewModeSelection(nextMode);');
    expect(terminalPageSource).toContain('await hydrateTerminalMeta({ suppressGlobalErrors: true });');
    expect(terminalPageSource).toContain('const refreshedMeta = await hydrateTerminalMeta({ suppressGlobalErrors: true });');
    expect(terminalPageSource).toContain('pinEnabled = refreshedMeta?.settingsAccessPinEnabled === true;');
    expect(sidebarSource).toContain("onClick={() => onSelectViewMode('reports')}");
    expect(sidebarSource).toContain("onClick={() => onSelectViewMode('items')}");
    expect(sidebarSource).toContain("disabled={locked || onboardingRestricted || !canViewPos}");
    expect(sidebarSource).toContain('Daily totals, popular items, and transactions');
  });

  it('requires explicit item-edit permission while always hiding cashier item deletion', () => {
    expect(terminalPageSource).toContain("const canEditItems = hasPermission('items:edit');");
    expect(terminalPageSource).not.toContain("const canEditItems = isCashierRole || hasPermission('items:edit');");
    expect(terminalPageSource).toContain("const canDeleteItems = !isCashierRole && hasPermission('items:delete');");
    expect(itemsWorkspaceSource).toContain('{canDeleteItems && (');
  });
});
