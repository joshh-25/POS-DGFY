import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Filter, Pencil, Plus, Power, RefreshCw, Search, UserRoundCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listTenantLocations } from '@/services/tenantLocationService.js';
import { createEmployee, fetchEmployees, updateEmployee } from '../services/employeeService.js';
import PosSettingsPagination from '../settings/PosSettingsPagination.jsx';
import { PosResponsiveFormDrawer, usePosFormFocusScroll, usePosVisualViewportMetrics, usePosViewportMode } from './PosResponsiveFormDrawer.jsx';

const emptyForm = {
  employeeCode: '',
  fullName: '',
  email: '',
  phone: '',
  locationId: ''
};

const cloneEmployeeForm = (value = emptyForm) => ({ ...emptyForm, ...value });

const hasEmployeeFormChanges = (form, baseline) => Object.keys(emptyForm)
  .some((field) => form[field] !== baseline[field]);

const PAGE_SIZE = 10;

const formatDateAdded = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

function EmployeeFormPanel({
  editingId,
  form,
  locations,
  saving,
  disabled,
  isOverlayViewport,
  onFieldChange,
  onSubmit,
  onClose,
  onCollapse
}) {
  const isEditing = Boolean(editingId);
  const viewportMetrics = usePosVisualViewportMetrics(isOverlayViewport);
  const { formBodyRef, handleFocusCapture } = usePosFormFocusScroll(isOverlayViewport);
  const panelClassName = isOverlayViewport
    ? 'relative z-auto flex h-auto max-h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white shadow-[0_-12px_30px_rgba(0,0,0,0.16)]'
    : 'relative z-auto flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)] min-[1200px]:overflow-visible min-[1200px]:min-h-[34rem] min-[1200px]:rounded-2xl min-[1200px]:border min-[1200px]:border-slate-200';

  return (
    <aside
      role={isOverlayViewport ? 'dialog' : undefined}
      aria-labelledby="employee-form-title"
      aria-describedby="employee-form-description"
      aria-modal={isOverlayViewport ? 'true' : undefined}
      className={panelClassName}
    >
      <Button
        type="button"
        variant="ghost"
        onClick={onClose}
        disabled={saving}
        aria-label="Close employee form"
        title="Close employee form"
        className="absolute left-3 top-3 z-10 h-9 w-9 rounded-full p-0 text-slate-700 hover:bg-slate-100 hover:text-slate-950 min-[1200px]:hidden"
      >
        <ChevronLeft aria-hidden="true" className="h-5 w-5" />
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={onCollapse}
        disabled={saving}
        aria-label="Hide form"
        title="Hide form"
        className="absolute right-4 top-4 z-10 hidden h-8 w-8 rounded-full border-slate-200 bg-slate-100 p-0 text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:border-slate-300 hover:bg-slate-200 hover:text-slate-950 min-[1200px]:left-[-1rem] min-[1200px]:right-auto min-[1200px]:top-1/2 min-[1200px]:-translate-y-1/2 min-[1200px]:flex"
      >
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </Button>

      <div className="shrink-0 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="min-w-0 pl-10 text-center min-[1200px]:flex min-[1200px]:items-center min-[1200px]:gap-3 min-[1200px]:pl-0 min-[1200px]:pr-10 min-[1200px]:text-left">
          <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 min-[1200px]:flex">
            <UserRoundCheck className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 id="employee-form-title" className="text-[16px] font-extrabold text-slate-950">{isEditing ? 'Edit Employee' : 'Add Employee'}</h3>
            <p id="employee-form-description" className="mx-auto mt-0.5 max-w-[18rem] text-[11px] font-medium leading-4 text-slate-500 min-[1200px]:mx-0 min-[1200px]:max-w-none">{isEditing ? 'Update employee information and store location.' : 'Create a new employee and assign their store location.'}</p>
          </div>
        </div>
      </div>

      <form className={isOverlayViewport ? 'flex min-h-0 flex-col' : 'flex min-h-0 flex-1 flex-col'} onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <div ref={formBodyRef} onFocusCapture={handleFocusCapture} style={viewportMetrics ? { maxHeight: `${viewportMetrics.formBodyMaxHeight}px` } : undefined} className={isOverlayViewport ? 'min-h-0 max-h-[calc(100vh-10rem)] max-h-[calc(100dvh-10rem)] flex-none overflow-y-auto overscroll-contain px-5 py-5 sm:px-6' : 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6'}>
          <div className="grid grid-cols-2 gap-4 min-[768px]:grid-cols-1 min-[1320px]:grid-cols-2">
            <div className="col-span-2 space-y-1.5 min-[768px]:col-span-1">
              <Label className="text-[12px] font-bold" htmlFor="employee-code">Employee code *</Label>
              <Input id="employee-code" autoFocus={!isEditing && !isOverlayViewport} value={form.employeeCode} maxLength={40} onChange={(event) => onFieldChange('employeeCode', event.target.value)} disabled={saving || disabled} placeholder="EMP-001" className="text-[16px] min-[1200px]:text-[14px]" />
            </div>
            <div className="col-span-2 space-y-1.5 min-[768px]:col-span-1">
              <Label className="text-[12px] font-bold" htmlFor="employee-full-name">Full name *</Label>
              <Input id="employee-full-name" value={form.fullName} maxLength={255} onChange={(event) => onFieldChange('fullName', event.target.value)} disabled={saving || disabled} placeholder="Employee full name" className="text-[16px] min-[1200px]:text-[14px]" />
            </div>
            <div className="col-span-1 space-y-1.5 lg:col-span-1">
              <Label className="text-[12px] font-bold" htmlFor="employee-email">Email (optional)</Label>
              <Input id="employee-email" type="email" value={form.email} onChange={(event) => onFieldChange('email', event.target.value)} disabled={saving || disabled} placeholder="employee@example.com" className="text-[16px] min-[1200px]:text-[14px]" />
            </div>
            <div className="col-span-1 space-y-1.5 lg:col-span-1">
              <Label className="text-[12px] font-bold" htmlFor="employee-phone">Phone (optional)</Label>
              <Input id="employee-phone" value={form.phone} onChange={(event) => onFieldChange('phone', event.target.value)} disabled={saving || disabled} placeholder="0917 123 4567" className="text-[16px] min-[1200px]:text-[14px]" />
            </div>
            <div className="col-span-2 space-y-1.5 min-[768px]:col-span-1 min-[1320px]:col-span-2">
              <Label className="text-[12px] font-bold" htmlFor="employee-location">Branch / location (optional)</Label>
              <select id="employee-location" value={form.locationId} onChange={(event) => onFieldChange('locationId', event.target.value)} disabled={saving || disabled} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[16px] font-semibold focus:border-[#1A4E8D] focus:outline-none focus:ring-2 focus:ring-[#1A4E8D]/20 min-[1200px]:text-[14px]">
                <option value="">All locations / unassigned</option>
                {locations.map((location) => <option key={location.location_id} value={location.location_id}>{location.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 bg-white/95 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:flex sm:items-center sm:justify-end sm:px-6">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">Cancel</Button>
          <Button type="submit" disabled={saving || disabled} className="w-full bg-[#1A4E8D] text-white hover:bg-[#123B6D] sm:w-auto">
            {saving ? <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : isEditing ? <Pencil aria-hidden="true" className="mr-2 h-4 w-4" /> : <Plus aria-hidden="true" className="mr-2 h-4 w-4" />}
            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Employee'}
          </Button>
        </div>
      </form>
    </aside>
  );
}

export default function EmployeeManagementPanel({ disabled = false, onEmployeesChanged = () => {}, refreshActionRef = null }) {
  const viewportMode = usePosViewportMode();
  const isMobileViewport = viewportMode === 'mobile';
  const isTabletViewport = viewportMode === 'tablet';
  const isOverlayViewport = isMobileViewport || isTabletViewport;
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => cloneEmployeeForm());
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [isEmployeeFormCollapsed, setIsEmployeeFormCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pendingStatusFilter, setPendingStatusFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const filterContainerRef = useRef(null);
  const formBaselineRef = useRef(cloneEmployeeForm());

  const load = async () => {
    setLoading(true);
    try {
      const [employeeRows, locationRows] = await Promise.all([
        fetchEmployees({ includeInactive: true }),
        listTenantLocations({ include_inactive: false })
      ]);
      setEmployees(employeeRows);
      setLocations(Array.isArray(locationRows) ? locationRows : []);
      onEmployeesChanged(employeeRows);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load employees.');
    } finally {
      setLoading(false);
    }
  };

  const latestLoadRef = useRef(load);
  latestLoadRef.current = load;

  useEffect(() => {
    if (!refreshActionRef) return undefined;
    const refresh = () => latestLoadRef.current();
    refreshActionRef.current = refresh;
    return () => {
      if (refreshActionRef.current === refresh) refreshActionRef.current = null;
    };
  }, [refreshActionRef]);

  useEffect(() => {
    load();
    // Stable initial load; parent callback is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    const nextForm = cloneEmployeeForm();
    setEditingId(null);
    formBaselineRef.current = nextForm;
    setForm(nextForm);
  };

  const openCreateForm = () => {
    resetForm();
    setIsAddingEmployee(true);
    setIsEmployeeFormCollapsed(false);
  };

  const closeForm = () => {
    if (saving || (hasEmployeeFormChanges(form, formBaselineRef.current)
      && typeof window !== 'undefined'
      && typeof window.confirm === 'function'
      && !window.confirm('Discard unsaved employee changes?'))) return;
    resetForm();
    setIsAddingEmployee(false);
    setIsEmployeeFormCollapsed(false);
  };

  const collapseForm = () => {
    if (saving) return;
    setIsEmployeeFormCollapsed(true);
  };

  const expandForm = () => setIsEmployeeFormCollapsed(false);

  const toggleFilters = () => {
    if (filtersOpen) {
      setFiltersOpen(false);
      return;
    }
    setPendingStatusFilter(statusFilter);
    setFiltersOpen(true);
  };

  const applyStatusFilter = () => {
    setStatusFilter(pendingStatusFilter);
    setFiltersOpen(false);
  };

  const startEdit = (employee) => {
    setEditingId(employee.employee_id);
    const nextForm = cloneEmployeeForm({
      employeeCode: employee.employee_code || '',
      fullName: employee.full_name || '',
      email: employee.email || '',
      phone: employee.phone || '',
      locationId: employee.location_id ? String(employee.location_id) : ''
    });
    formBaselineRef.current = nextForm;
    setForm(nextForm);
    setIsAddingEmployee(true);
    setIsEmployeeFormCollapsed(false);
  };

  const save = async () => {
    if (form.employeeCode.trim().length < 2 || form.fullName.trim().length < 2) {
      toast.error('Employee code and full name are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        employee_code: form.employeeCode.trim().toUpperCase(),
        full_name: form.fullName.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        location_id: form.locationId ? Number(form.locationId) : null
      };
      if (editingId) {
        await updateEmployee(editingId, payload);
        toast.success('Employee updated successfully.');
      } else {
        await createEmployee(payload);
        toast.success('Employee added successfully.');
      }
      resetForm();
      setIsAddingEmployee(false);
      setIsEmployeeFormCollapsed(false);
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save employee.');
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (employee, isActive) => {
    try {
      await updateEmployee(employee.employee_id, { is_active: isActive });
      toast.success(isActive ? 'Employee activated.' : 'Employee deactivated.');
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update employee status.');
    }
  };

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return employees.filter((employee) => [
      employee.full_name,
      employee.employee_code,
      employee.email,
      employee.phone,
      employee.location?.location_name
    ].some((value) => !query || String(value || '').toLowerCase().includes(query))
      && (statusFilter === 'all' || Boolean(employee.is_active) === (statusFilter === 'active')));
  }, [employees, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const pageEmployees = useMemo(
    () => filteredEmployees.slice((page - 1) * pageSize, page * pageSize),
    [filteredEmployees, page, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, pageSize]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (!filtersOpen) return undefined;

    const closeOnOutsidePointer = (event) => {
      if (!filterContainerRef.current?.contains(event.target)) setFiltersOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setFiltersOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [filtersOpen]);

  const tablePanelClass = 'min-w-0';
  const statusFilterOptions = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Enabled' },
    { value: 'inactive', label: 'Disabled' }
  ];

  const filterPopover = filtersOpen ? (
    <div id="employee-filter-popover" role="region" aria-labelledby="employee-filter-title" className="fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom,0px))] top-auto z-[70] max-h-[calc(100dvh-1rem)] w-auto max-w-none overflow-x-hidden overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-auto sm:top-[calc(100%+0.5rem)] sm:max-h-none sm:w-[min(26rem,calc(100vw-2rem))] sm:overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4 text-left sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1A4E8D]">
            <Filter aria-hidden="true" className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h4 id="employee-filter-title" className="text-[14px] font-extrabold text-slate-950">Filter employees</h4>
            <p className="mt-0.5 text-[11px] font-medium leading-4 text-slate-500">Choose which employee statuses appear in the table.</p>
          </div>
        </div>
      </div>
      <div className="space-y-2 px-5 py-4 sm:px-6">
        <p id="employee-status-filter-label" className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Status</p>
        <div role="group" aria-labelledby="employee-status-filter-label" className="grid gap-2 sm:grid-cols-3">
          {statusFilterOptions.map((option) => {
            const selected = pendingStatusFilter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setPendingStatusFilter(option.value)}
                className={`flex min-h-10 min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 ${selected ? 'border-[#1A4E8D] bg-[#F5F9FF] text-[#1A4E8D]' : 'border-slate-200 bg-white text-slate-700 hover:border-[#9BBBE0] hover:bg-[#F5F9FF]'}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {option.value === 'all' && selected ? (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1A4E8D] text-white">
                      <Check aria-hidden="true" className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${option.value === 'active' ? 'bg-emerald-500' : option.value === 'inactive' ? 'bg-slate-400' : 'bg-slate-300'}`} />
                  )}
                  <span className="truncate">{option.label}</span>
                </span>
                {selected && option.value !== 'all' ? <Check aria-hidden="true" className="h-4 w-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col-reverse items-stretch gap-2 border-t border-slate-100 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Button type="button" variant="ghost" onClick={() => setPendingStatusFilter('all')} disabled={pendingStatusFilter === 'all'} className="h-9 w-full px-1 text-[12px] font-medium text-slate-500 hover:bg-transparent hover:text-[#1A4E8D] sm:w-auto">Clear filter</Button>
        <Button type="button" onClick={applyStatusFilter} className="h-9 w-full bg-[#1A4E8D] px-4 text-[12px] font-bold text-white hover:bg-[#123B6D] sm:w-auto">Done</Button>
      </div>
    </div>
  ) : null;

  const formPanel = isAddingEmployee ? (
    <EmployeeFormPanel
      editingId={editingId}
      form={form}
      locations={locations}
      saving={saving}
      disabled={disabled}
      isOverlayViewport={isOverlayViewport}
      onFieldChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
      onSubmit={save}
      onClose={closeForm}
      onCollapse={collapseForm}
    />
  ) : null;

  const responsiveFormPanel = isOverlayViewport && formPanel
    ? <PosResponsiveFormDrawer viewportMode={viewportMode} onClose={closeForm}>{formPanel}</PosResponsiveFormDrawer>
    : null;

  return (
    <section className="min-w-0">
      <div className={`relative grid min-w-0 gap-4 min-[1200px]:items-stretch min-[1200px]:transition-[grid-template-columns] min-[1200px]:duration-200 min-[1200px]:ease-out ${isAddingEmployee && !isEmployeeFormCollapsed ? 'min-[1200px]:grid-cols-[minmax(0,1.58fr)_minmax(19rem,1fr)]' : 'min-[1200px]:grid-cols-[minmax(0,1fr)_0fr]'}`}>
        <div className={tablePanelClass}>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1A4E8D] sm:flex">
                <UserRoundCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[16px] font-extrabold text-slate-950">Employees</h3>
                <p className="text-[12px] font-medium leading-5 text-slate-500">Add workmates without creating POS usernames, passwords, or roles.</p>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => refreshActionRef?.current?.()} disabled={disabled || loading} className="h-9 w-9 shrink-0 p-0 sm:h-10 sm:w-auto sm:px-3">
              <RefreshCw className="h-4 w-4 sm:mr-2" /> <span className="sr-only sm:not-sr-only">Refresh</span>
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-2.5 min-[1200px]:flex min-[1200px]:items-center">
            <div className="relative min-w-0 min-[1200px]:flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input type="search" aria-label="Search employees" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search employees by name, code, or email..." className="h-10 pl-9" />
            </div>
            <div ref={filterContainerRef} className="relative min-w-0">
              <Button type="button" variant="outline" size="sm" onClick={toggleFilters} aria-expanded={filtersOpen} aria-haspopup="true" aria-controls="employee-filter-popover" title="Filters" className="h-10 w-10 shrink-0 p-0 sm:w-auto sm:px-4 min-[1200px]:w-auto">
                <Filter aria-hidden="true" className="h-4 w-4 sm:mr-2" /> <span className="sr-only sm:not-sr-only">Filters</span>
              </Button>
              {filterPopover}
            </div>
            <Button type="button" onClick={openCreateForm} disabled={loading || saving || disabled || isAddingEmployee} aria-disabled={isAddingEmployee || undefined} title={isAddingEmployee ? 'Add Employee form is already open' : undefined} className="col-span-2 h-10 w-full bg-[#1A4E8D] text-white hover:bg-[#123B6D] min-[1200px]:w-auto">
              <Plus className="mr-2 h-4 w-4" /> Add Employee
            </Button>
          </div>

          <div className="mt-4 hidden overflow-hidden rounded-xl border border-slate-200 min-[1200px]:block">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left text-[13px] sm:text-[14px]">
                <caption className="sr-only">Employee directory</caption>
                <thead className="bg-slate-50 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="w-[42%] px-2 py-3 sm:px-2.5 sm:w-[24%]">Employee</th>
                    <th scope="col" className="hidden w-[10%] px-2 py-3 sm:px-2.5 sm:table-cell">Code</th>
                    <th scope="col" className="hidden w-[14%] px-2 py-3 sm:px-2.5 lg:table-cell">Contact</th>
                    <th scope="col" className="hidden w-[14%] px-2 py-3 sm:px-2.5 md:table-cell">Location</th>
                    <th scope="col" className="w-[18%] px-2 py-3 sm:px-2.5 sm:w-[10%]">Status</th>
                    <th scope="col" className="hidden w-[13%] whitespace-nowrap px-2 py-3 sm:px-2.5 lg:table-cell">Date added</th>
                    <th scope="col" className="w-[40%] px-2 py-3 text-right sm:px-2.5 sm:w-[15%]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageEmployees.map((employee) => {
                    const locationName = employee.location?.location_name || 'All locations';
                    return (
                      <tr key={employee.employee_id} className={employee.is_active ? 'bg-white' : 'bg-slate-50/80'}>
                        <td className="max-w-0 px-2 py-2.5 sm:px-2.5">
                          <div className="min-w-0">
                            <p className="truncate font-bold text-slate-950">{employee.full_name}</p>
                            <p className="truncate text-[11px] font-medium text-slate-500">{employee.email || 'No email on file'}</p>
                          </div>
                        </td>
                        <td className="hidden whitespace-nowrap px-2 py-2.5 font-semibold text-slate-700 sm:px-2.5 sm:table-cell">{employee.employee_code || '—'}</td>
                        <td className="hidden whitespace-nowrap px-2 py-2.5 text-slate-600 sm:px-2.5 lg:table-cell">{employee.phone || '—'}</td>
                        <td className="hidden max-w-0 truncate px-2 py-2.5 text-slate-600 sm:px-2.5 md:table-cell" title={locationName}>{locationName}</td>
                        <td className="px-2 py-2.5 sm:px-2.5">
                          <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold ${employee.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{employee.is_active ? 'Enabled' : 'Disabled'}</span>
                        </td>
                        <td className="hidden whitespace-nowrap px-2 py-2.5 text-slate-600 sm:px-2.5 lg:table-cell">{formatDateAdded(employee.created_at)}</td>
                        <td className="px-2 py-2.5 sm:px-2.5">
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button type="button" variant="outline" size="sm" onClick={() => startEdit(employee)} disabled={disabled} aria-label={`Edit ${employee.full_name}`} title={`Edit ${employee.full_name}`} className="h-8 w-8 p-0 text-[#1A4E8D] hover:bg-blue-50 hover:text-[#123B6D]"><Pencil aria-hidden="true" className="h-3.5 w-3.5" /></Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => setActive(employee, !employee.is_active)} disabled={disabled} aria-label={`${employee.is_active ? 'Disable' : 'Enable'} ${employee.full_name}`} title={`${employee.is_active ? 'Disable' : 'Enable'} ${employee.full_name}`} className={`h-8 w-8 p-0 ${employee.is_active ? 'border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700' : 'border-[#BFD4EC] text-[#1A4E8D] hover:bg-blue-50 hover:text-[#123B6D]'}`}><Power aria-hidden="true" className="h-3.5 w-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {pageEmployees.length === 0 && !loading ? (
                    <tr>
                      <td colSpan="7" className="px-3 py-10 text-center text-[13px] font-medium text-slate-500 sm:px-4 sm:text-[14px]">
                        {employees.length === 0 ? 'No employees added yet.' : 'No employees match your filters.'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-4 grid gap-2 min-[1200px]:hidden">
            {pageEmployees.map((employee) => {
              const locationName = employee.location?.location_name || 'All locations';
              return (
                <article key={employee.employee_id} className={`rounded-xl border p-3 ${employee.is_active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50/80'}`}>
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-950">{employee.full_name}</p>
                          <p className="truncate text-[11px] font-semibold text-slate-600">{employee.employee_code || 'No employee code'}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold ${employee.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{employee.is_active ? 'Enabled' : 'Disabled'}</span>
                      </div>
                      <p className="mt-1 truncate text-[11px] font-medium text-slate-500">{locationName}</p>
                      <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500">{employee.email || employee.phone || 'No contact details'}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button type="button" variant="outline" size="sm" onClick={() => startEdit(employee)} disabled={disabled} aria-label={`Edit ${employee.full_name}`} title={`Edit ${employee.full_name}`} className="h-9 w-9 p-0 text-[#1A4E8D] hover:bg-blue-50 hover:text-[#123B6D]"><Pencil aria-hidden="true" className="h-3.5 w-3.5" /></Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setActive(employee, !employee.is_active)} disabled={disabled} aria-label={`${employee.is_active ? 'Disable' : 'Enable'} ${employee.full_name}`} title={`${employee.is_active ? 'Disable' : 'Enable'} ${employee.full_name}`} className={`h-9 w-9 p-0 ${employee.is_active ? 'border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700' : 'border-[#BFD4EC] text-[#1A4E8D] hover:bg-blue-50 hover:text-[#123B6D]'}`}><Power aria-hidden="true" className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </article>
              );
            })}
            {pageEmployees.length === 0 && !loading ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-3 py-10 text-center text-[13px] font-medium text-slate-500">
                {employees.length === 0 ? 'No employees added yet.' : 'No employees match your filters.'}
              </div>
            ) : null}
          </div>
          <div className="mt-3">
            <PosSettingsPagination
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              total={filteredEmployees.length}
              itemLabel="employees"
              pageSizeLabel="Employees per page"
              previousLabel="Previous employee page"
              nextLabel="Next employee page"
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={loading}
            />
          </div>
        </div>
        {!isOverlayViewport && isAddingEmployee && !isEmployeeFormCollapsed ? <div className="min-w-0 min-[1200px]:h-full">{formPanel}</div> : null}
        {!isOverlayViewport && isAddingEmployee && isEmployeeFormCollapsed ? (
          <Button type="button" variant="outline" onClick={expandForm} disabled={disabled} aria-label="Show form" title="Show form" className="absolute right-2 top-3 z-10 h-8 w-8 rounded-full border-slate-200 bg-slate-100 p-0 text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:border-slate-300 hover:bg-slate-200 hover:text-slate-950 min-[1200px]:right-[-1rem] min-[1200px]:top-1/2 min-[1200px]:-translate-y-1/2">
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      {responsiveFormPanel}
    </section>
  );
}
