import React, { useEffect, useState } from 'react';
import { Plus, Check, Layers, SlidersHorizontal, AlertCircle, Package } from 'lucide-react';
import { toast } from 'sonner';
import {
  listServiceOptionGroups,
  createServiceOptionGroup,
  updateServiceOptionGroup,
  deactivateServiceOption,
  assignItemOptionGroups,
  getItemOptionGroups
} from '../api/servicesApi.js';

export default function ServiceOptionGroupManager({ selectedItem = null, onClose }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignedGroupIds, setAssignedGroupIds] = useState([]);
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroup, setNewGroup] = useState({
    name: '',
    description: '',
    group_type: 'variation',
    selection_type: 'single',
    is_required: true,
    min_selections: 1,
    max_selections: 1,
    options: [
      { name: '', price_adjustment_pesos: '0.00', duration_adjustment_minutes: 0, linked_physical_item_id: null }
    ]
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await listServiceOptionGroups();
      setGroups(res.groups || []);

      if (selectedItem?.item_id) {
        const assignedRes = await getItemOptionGroups(selectedItem.item_id);
        const assigned = (assignedRes.groups || []).map((g) => g.group_id);
        setAssignedGroupIds(assigned);
      }
    } catch (err) {
      toast.error('Failed to load service option groups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedItem?.item_id]);

  const handleToggleGroupAssign = (groupId) => {
    setAssignedGroupIds((prev) => (
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    ));
  };

  const handleSaveAssignments = async () => {
    if (!selectedItem?.item_id) return;
    setSavingAssignments(true);
    try {
      await assignItemOptionGroups(selectedItem.item_id, assignedGroupIds);
      toast.success('Variations & Add-ons assigned to service successfully');
      if (onClose) onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save assignments');
    } finally {
      setSavingAssignments(false);
    }
  };

  const handleAddOptionField = () => {
    setNewGroup((prev) => ({
      ...prev,
      options: [
        ...prev.options,
        { name: '', price_adjustment_pesos: '0.00', duration_adjustment_minutes: 0, linked_physical_item_id: null }
      ]
    }));
  };

  const handleOptionChange = (index, field, value) => {
    setNewGroup((prev) => {
      const updated = [...prev.options];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, options: updated };
    });
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroup.name.trim()) {
      toast.error('Group name is required');
      return;
    }

    const formattedOptions = newGroup.options
      .filter((opt) => opt.name.trim())
      .map((opt) => ({
        name: opt.name.trim(),
        price_adjustment_centavos: Math.round(parseFloat(opt.price_adjustment_pesos || 0) * 100),
        duration_adjustment_minutes: parseInt(opt.duration_adjustment_minutes || 0, 10),
        linked_physical_item_id: opt.linked_physical_item_id ? parseInt(opt.linked_physical_item_id, 10) : null
      }));

    if (formattedOptions.length === 0) {
      toast.error('At least one option choice is required');
      return;
    }

    try {
      await createServiceOptionGroup({
        name: newGroup.name.trim(),
        description: newGroup.description.trim() || null,
        group_type: newGroup.group_type,
        selection_type: newGroup.selection_type,
        is_required: newGroup.is_required,
        min_selections: newGroup.min_selections,
        max_selections: newGroup.max_selections,
        options: formattedOptions
      });
      toast.success('Option group created successfully');
      setShowCreateModal(false);
      setNewGroup({
        name: '',
        description: '',
        group_type: 'variation',
        selection_type: 'single',
        is_required: true,
        min_selections: 1,
        max_selections: 1,
        options: [{ name: '', price_adjustment_pesos: '0.00', duration_adjustment_minutes: 0, linked_physical_item_id: null }]
      });
      loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to create option group');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <h3 className="font-semibold text-slate-900 flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
            Service Variations & Add-ons
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {selectedItem ? `Configure options for "${selectedItem.name}"` : 'Manage reusable service variations and add-ons'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Option Group
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-500 text-sm">Loading options...</div>
      ) : groups.length === 0 ? (
        <div className="p-8 border border-dashed rounded-xl text-center text-slate-500 space-y-2">
          <Layers className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-medium">No Variation or Add-on Groups</p>
          <p className="text-xs text-slate-400">Create your first option group (e.g. Hair Length, Treatment Extras) to assign to services.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {groups.map((group) => {
            const isAssigned = assignedGroupIds.includes(group.group_id);
            return (
              <div
                key={group.group_id}
                className={`p-3.5 rounded-xl border transition-all ${
                  isAssigned ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2.5">
                    {selectedItem && (
                      <input
                        type="checkbox"
                        checked={isAssigned}
                        onChange={() => handleToggleGroupAssign(group.group_id)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm">{group.name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                          group.group_type === 'variation' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                        }`}>
                          {group.group_type}
                        </span>
                        {group.is_required && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-medium">Required</span>
                        )}
                      </div>
                      {group.description && <p className="text-xs text-slate-500 mt-0.5">{group.description}</p>}
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-2">
                  {(group.options || []).map((opt) => (
                    <div key={opt.option_id} className="inline-flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-lg text-xs text-slate-700 border border-slate-200">
                      <span className="font-medium">{opt.name}</span>
                      {opt.price_adjustment_centavos > 0 && (
                        <span className="text-emerald-700 font-semibold">+₱{(opt.price_adjustment_centavos / 100).toFixed(2)}</span>
                      )}
                      {opt.duration_adjustment_minutes > 0 && (
                        <span className="text-blue-700 font-medium">+{opt.duration_adjustment_minutes}m</span>
                      )}
                      {opt.linked_physical_item_id && (
                        <span className="inline-flex items-center gap-0.5 text-purple-700 text-[10px] bg-purple-50 px-1 py-0.5 rounded" title="Physical Inventory Add-on">
                          <Package className="w-3 h-3" /> Stock-draining
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedItem && (
        <div className="flex justify-end gap-2 border-t pt-3">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveAssignments}
            disabled={savingAssignments}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors"
          >
            {savingAssignments ? 'Saving...' : 'Save Assigned Options'}
          </button>
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900">Create New Option Group</h3>
            <form onSubmit={handleCreateGroup} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Group Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hair Length or Treatment Add-ons"
                  value={newGroup.name}
                  onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Group Type</label>
                  <select
                    value={newGroup.group_type}
                    onChange={(e) => setNewGroup({
                      ...newGroup,
                      group_type: e.target.value,
                      selection_type: e.target.value === 'variation' ? 'single' : newGroup.selection_type,
                      is_required: e.target.value === 'variation' ? true : newGroup.is_required
                    })}
                    className="w-full px-3 py-2 border rounded-lg outline-none"
                  >
                    <option value="variation">Variation (Mandatory single choice e.g. 30/60 min)</option>
                    <option value="addon">Add-on (Optional extra)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Selection Mode</label>
                  <select
                    value={newGroup.selection_type}
                    onChange={(e) => setNewGroup({ ...newGroup, selection_type: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg outline-none"
                  >
                    <option value="single">Single Select</option>
                    <option value="multi">Multi Select</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1.5">Option Choices</label>
                <div className="space-y-2">
                  {newGroup.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <input
                        type="text"
                        placeholder="Option name"
                        value={opt.name}
                        onChange={(e) => handleOptionChange(i, 'name', e.target.value)}
                        className="flex-1 px-2.5 py-1.5 border rounded outline-none"
                      />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="+₱ Price"
                        value={opt.price_adjustment_pesos}
                        onChange={(e) => handleOptionChange(i, 'price_adjustment_pesos', e.target.value)}
                        className="w-20 px-2 py-1.5 border rounded outline-none"
                      />
                      <input
                        type="number"
                        placeholder="+Min"
                        value={opt.duration_adjustment_minutes}
                        onChange={(e) => handleOptionChange(i, 'duration_adjustment_minutes', e.target.value)}
                        className="w-16 px-2 py-1.5 border rounded outline-none"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddOptionField}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium inline-flex items-center gap-1 mt-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Choice
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border rounded-lg font-medium text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium"
                >
                  Create Group
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
