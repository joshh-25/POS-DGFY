import { useEffect, useState } from 'react';
import { Bike, Pencil, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { listTenantLocations } from '@/services/tenantLocationService.js';
import {
  createDeliveryPersonnel,
  fetchDeliveryPersonnelRegistry,
  updateDeliveryPersonnel
} from '../services/deliveryPersonnelService.js';

const emptyForm = {
  displayName: '',
  phone: '',
  locationId: '',
  notes: ''
};

export default function DeliveryPersonnelManagementPanel({ disabled = false, onDeliveryPersonnelChanged = () => {} }) {
  const [deliveryPersonnel, setDeliveryPersonnel] = useState([]);
  const [locations, setLocations] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [deliveryPersonnelRows, locationRows] = await Promise.all([
        fetchDeliveryPersonnelRegistry({ includeInactive: true }),
        listTenantLocations({ include_inactive: false })
      ]);
      setDeliveryPersonnel(deliveryPersonnelRows);
      setLocations(Array.isArray(locationRows) ? locationRows : []);
      onDeliveryPersonnelChanged(deliveryPersonnelRows);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load delivery personnel.');
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

  const startEdit = (person) => {
    setEditingId(person.delivery_personnel_id);
    setForm({
      displayName: person.display_name || '',
      phone: person.phone || '',
      locationId: person.location_id ? String(person.location_id) : '',
      notes: person.notes || ''
    });
  };

  const save = async () => {
    if (form.displayName.trim().length < 2) {
      toast.error('Rider name is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        display_name: form.displayName.trim(),
        phone: form.phone.trim() || null,
        location_id: form.locationId ? Number(form.locationId) : null,
        notes: form.notes.trim() || null
      };
      if (editingId) {
        await updateDeliveryPersonnel(editingId, payload);
        toast.success('Delivery personnel updated.');
      } else {
        await createDeliveryPersonnel(payload);
        toast.success('Delivery personnel added.');
      }
      resetForm();
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save delivery personnel.');
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (person, isActive) => {
    try {
      await updateDeliveryPersonnel(person.delivery_personnel_id, { is_active: isActive });
      toast.success(isActive ? 'Delivery personnel activated.' : 'Delivery personnel deactivated.');
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update delivery personnel status.');
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1A4E8D]">
            <Bike className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-[15px] font-black text-slate-950">Delivery Personnel Registry</h3>
            <p className="text-xs text-slate-500">Manage riders who can be picked when assigning a manual delivery. Third-party couriers can still be typed in free-text at assignment time.</p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={load} disabled={loading || saving || disabled}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      <div className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
        <div className="space-y-1.5"><Label>Rider name *</Label><Input value={form.displayName} maxLength={255} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} disabled={saving || disabled} placeholder="Rider full name" /></div>
        <div className="space-y-1.5"><Label>Phone (optional)</Label><Input value={form.phone} maxLength={40} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} disabled={saving || disabled} /></div>
        <label className="space-y-1.5 md:col-span-2">
          <span className="text-xs font-bold text-slate-700">Branch / location (optional)</span>
          <select value={form.locationId} onChange={(event) => setForm((current) => ({ ...current, locationId: event.target.value }))} disabled={saving || disabled} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">
            <option value="">All locations / unassigned</option>
            {locations.map((location) => <option key={location.location_id} value={location.location_id}>{location.name}</option>)}
          </select>
        </label>
        <div className="space-y-1.5 md:col-span-2"><Label>Notes (optional)</Label><Input value={form.notes} maxLength={2000} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} disabled={saving || disabled} /></div>
        <div className="flex justify-end gap-2 md:col-span-2">
          {editingId ? <Button type="button" variant="outline" onClick={resetForm} disabled={saving}>Cancel edit</Button> : null}
          <Button type="button" onClick={save} disabled={saving || disabled} className="bg-[#1A4E8D] text-white hover:bg-[#123B6D]">
            {saving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : editingId ? <Pencil className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
            {editingId ? 'Save Delivery Personnel' : 'Add Delivery Personnel'}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {deliveryPersonnel.length === 0 && !loading ? <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">No delivery personnel added yet.</p> : null}
        {deliveryPersonnel.map((person) => (
          <div key={person.delivery_personnel_id} className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between ${person.is_active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
            <div>
              <p className="font-black text-slate-950">{person.display_name}</p>
              <p className="text-xs text-slate-500">{person.phone || 'No phone on file'} {person.location?.location_name ? `• ${person.location.location_name}` : '• All locations'}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => startEdit(person)} disabled={disabled}><Pencil className="mr-1 h-3.5 w-3.5" /> Edit</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setActive(person, !person.is_active)} disabled={disabled}>{person.is_active ? 'Deactivate' : 'Activate'}</Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
