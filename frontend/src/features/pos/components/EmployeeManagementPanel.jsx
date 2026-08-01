import { useEffect, useState } from 'react';
import { Pencil, Plus, RefreshCw, UserRoundCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listTenantLocations } from '@/services/tenantLocationService.js';
import { createEmployee, fetchEmployees, updateEmployee } from '../services/employeeService.js';

const emptyForm = {
  employeeCode: '',
  fullName: '',
  email: '',
  phone: '',
  locationId: ''
};

export default function EmployeeManagementPanel({ disabled = false, onEmployeesChanged = () => {} }) {
  const [employees, setEmployees] = useState([]);
  const [locations, setLocations] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    load();
    // Stable initial load; parent callback is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const startEdit = (employee) => {
    setEditingId(employee.employee_id);
    setForm({
      employeeCode: employee.employee_code || '',
      fullName: employee.full_name || '',
      email: employee.email || '',
      phone: employee.phone || '',
      locationId: employee.location_id ? String(employee.location_id) : ''
    });
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
        toast.success('Employee updated.');
      } else {
        await createEmployee(payload);
        toast.success('Employee added.');
      }
      resetForm();
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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1A4E8D]">
            <UserRoundCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-[15px] font-black text-slate-950">Employee Directory</h3>
            <p className="text-xs text-slate-500">Add workmates without creating POS usernames, passwords, or roles.</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading || saving || disabled}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
        <div className="space-y-1.5"><Label>Employee code *</Label><Input value={form.employeeCode} maxLength={40} onChange={(event) => setForm((current) => ({ ...current, employeeCode: event.target.value }))} disabled={saving || disabled} placeholder="EMP-001" /></div>
        <div className="space-y-1.5"><Label>Full name *</Label><Input value={form.fullName} maxLength={255} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} disabled={saving || disabled} placeholder="Employee full name" /></div>
        <div className="space-y-1.5"><Label>Email (optional)</Label><Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} disabled={saving || disabled} /></div>
        <div className="space-y-1.5"><Label>Phone (optional)</Label><Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} disabled={saving || disabled} /></div>
        <label className="space-y-1.5 md:col-span-2">
          <span className="text-xs font-bold text-slate-700">Branch / location (optional)</span>
          <select value={form.locationId} onChange={(event) => setForm((current) => ({ ...current, locationId: event.target.value }))} disabled={saving || disabled} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">
            <option value="">All locations / unassigned</option>
            {locations.map((location) => <option key={location.location_id} value={location.location_id}>{location.name}</option>)}
          </select>
        </label>
        <div className="flex justify-end gap-2 md:col-span-2">
          {editingId ? <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>Cancel edit</Button> : null}
          <Button type="button" onClick={save} disabled={saving || disabled} className="bg-[#1A4E8D] text-white hover:bg-[#123B6D]">
            {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : editingId ? <Pencil className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
            {editingId ? 'Save Employee' : 'Add Employee'}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {employees.length === 0 && !loading ? <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">No employees added yet.</p> : null}
        {employees.map((employee) => (
          <div key={employee.employee_id} className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${employee.is_active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
            <div>
              <p className="font-black text-slate-950">{employee.full_name}</p>
              <p className="text-xs text-slate-500">{employee.employee_code} {employee.location?.location_name ? `• ${employee.location.location_name}` : '• All locations'}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => startEdit(employee)} disabled={disabled}><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setActive(employee, !employee.is_active)} disabled={disabled}>{employee.is_active ? 'Deactivate' : 'Activate'}</Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
