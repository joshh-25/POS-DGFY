import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import * as userService from '../../src/services/userService.js';
import PermissionMatrix from './PermissionMatrix';
import UserAvatar from './UserAvatar';
import UserInvitationModal from './UserInvitationModal';
import PermissionPickerModal from './PermissionPickerModal';
import {
  Shield,
  Search,
  RefreshCw,
  ChevronDown,
  Users2,
  UserCheck,
  UserX,
  Settings2,
  UserMinus,
  UserPlus
} from 'lucide-react';
import api from '../../src/services/api.js';
import useStore from '../../src/store/useStore.js';
import DeleteConfirmDialog from '../ui/DeleteConfirmDialog';

// Role hierarchy for permission checks (higher number = higher rank)
const ROLE_HIERARCHY = { admin: 3, manager: 2, staff: 1 };

// Permission templates for bulk operations
const PERMISSION_TEMPLATES = {
  manager: {
    label: 'Manager',
    permissions: [
      'items:view', 'items:create', 'items:edit', 'items:export',
      'suppliers:view', 'suppliers:create', 'suppliers:edit',
      'po:view', 'po:create', 'po:approve', 'po:receive',
      'jo:view', 'jo:create', 'jo:approve', 'jo:complete',
      'do:view', 'do:create', 'do:dispatch', 'do:delete',
      'stock:view', 'stock:adjust', 'batches:view', 'batches:edit',
      'reports:view',
      'ai:chat', 'ai:action',
      'settings:view', 'settings:edit',
      'users:view', 'users:delete', 'audit:view'
    ]
  },
  staff: {
    label: 'Staff',
    permissions: [
      'items:view',
      'suppliers:view',
      'po:view', 'po:receive',
      'jo:view', 'jo:complete',
      'do:view',
      'stock:view'
    ]
  },
  viewer: {
    label: 'Viewer (Read-Only)',
    permissions: [
      'items:view',
      'suppliers:view',
      'po:view',
      'jo:view',
      'stock:view',
      'reports:view'
    ]
  }
};

export default function UserManagementModal({ open, onOpenChange }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showPermissionMatrix, setShowPermissionMatrix] = useState(false);
  const [savingPermissions, setSavingPermissions] = useState(false);

  // New features state
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [bulkAction, setBulkAction] = useState(null); // 'template' | 'grant' | 'revoke'
  const [showPermissionPicker, setShowPermissionPicker] = useState(false);
  const [permissionPickerMode, setPermissionPickerMode] = useState('grant');

  // Remove user from company state
  const [removeConfirmUser, setRemoveConfirmUser] = useState(null);
  const [removingUser, setRemovingUser] = useState(false);

  // Get current user from store
  const currentUser = useStore((state) => state.currentUser);

  // Check if current user can remove target user (hierarchical access control)
  const canRemoveUser = (targetUser) => {
    if (!currentUser || !targetUser) return false;
    // Cannot remove yourself
    if (currentUser.user_id === targetUser.user_id) return false;
    // Cannot remove Master Admin
    if (targetUser.is_master_admin) return false;
    // Master Admin can remove anyone except other Master Admins
    if (currentUser.is_master_admin) return true;
    // Check hierarchical permission
    const currentRank = ROLE_HIERARCHY[currentUser.role] || 0;
    const targetRank = ROLE_HIERARCHY[targetUser.role] || 0;
    return currentRank > targetRank;
  };

  // Handle removing a user from company
  const handleRemoveUser = async () => {
    if (!removeConfirmUser) return;
    setRemovingUser(true);
    try {
      await userService.removeUserFromCompany(removeConfirmUser.user_id);
      toast.success(`${removeConfirmUser.username} has been removed from the company`);
      setRemoveConfirmUser(null);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to remove user');
    } finally {
      setRemovingUser(false);
    }
  };

  // Fetch all users when modal opens
  useEffect(() => {
    if (open) {
      fetchUsers();
      setSelectedUserIds([]);
      setSearchQuery('');
      setFilter('all');
    }
  }, [open]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await userService.getAllUsers();
      setUsers(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  // Filtered users based on search and filter
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Search filter
      const matchesSearch = !searchQuery ||
        user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase());

      // Role/status filter
      let matchesFilter = true;
      if (filter === 'inactive') {
        // Inactive tab: show only inactive users
        matchesFilter = !user.is_active;
      } else {
        // All other tabs: only show active users
        if (!user.is_active) return false;

        // Apply role filter
        if (filter === 'admin') matchesFilter = user.role === 'admin';
        else if (filter === 'manager') matchesFilter = user.role === 'manager';
        else if (filter === 'staff') matchesFilter = user.role === 'staff';
        // 'all' filter shows all active users (no additional filter needed)
      }

      return matchesSearch && matchesFilter;
    });
  }, [users, searchQuery, filter]);

  const handleRoleChange = async (userId, newRole) => {
    try {
      const updatedUser = await userService.updateUserRole(userId, newRole);
      toast.success('User role updated successfully');

      // If the Permission Matrix is open for this user, update selectedUser with new permissions
      if (selectedUser && selectedUser.user_id === userId) {
        // Parse permissions if it's a string (backend may return JSON string)
        let permissions = updatedUser.permissions || [];
        if (typeof permissions === 'string') {
          try {
            permissions = JSON.parse(permissions);
          } catch (e) {
            permissions = [];
          }
        }

        setSelectedUser(prev => ({
          ...prev,
          role: updatedUser.role,
          permissions: permissions,
          is_master_admin: updatedUser.is_master_admin
        }));
      }

      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update role');
    }
  };

  const handleStatusToggle = async (userId, currentStatus) => {
    try {
      await userService.updateUserStatus(userId, !currentStatus);
      toast.success(`User ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update status');
    }
  };

  const openPermissionMatrix = (user) => {
    // Ensure permissions is always an array when opening the matrix
    // Handle case where permissions might be a JSON string from the backend
    let permissions = user.permissions || [];
    if (typeof permissions === 'string') {
      try {
        permissions = JSON.parse(permissions);
      } catch (e) {
        permissions = [];
      }
    }
    if (!Array.isArray(permissions)) {
      permissions = [];
    }

    setSelectedUser({
      ...user,
      permissions: permissions
    });
    setShowPermissionMatrix(true);
  };

  const handleUpdatePermissions = async (userId, permissions, isMasterAdmin) => {
    setSavingPermissions(true);
    try {
      // Ensure permissions is always an array
      const permissionsArray = Array.isArray(permissions) ? permissions : [];
      await api.put(`/users/${userId}/permissions`, {
        permissions: permissionsArray,
        is_master_admin: isMasterAdmin
      });
      toast.success('Permissions updated successfully');
      setShowPermissionMatrix(false);
      fetchUsers();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || 'Failed to update permissions');
    } finally {
      setSavingPermissions(false);
    }
  };

  // Bulk selection handlers
  const toggleUserSelection = (userId, event) => {
    if (event.shiftKey && selectedUserIds.length > 0) {
      // Shift+click for range select
      const lastSelected = selectedUserIds[selectedUserIds.length - 1];
      const currentIndex = filteredUsers.findIndex(u => u.user_id === userId);
      const lastIndex = filteredUsers.findIndex(u => u.user_id === lastSelected);
      const start = Math.min(currentIndex, lastIndex);
      const end = Math.max(currentIndex, lastIndex);
      const rangeIds = filteredUsers.slice(start, end + 1).map(u => u.user_id);
      setSelectedUserIds([...new Set([...selectedUserIds, ...rangeIds])]);
    } else {
      setSelectedUserIds(prev =>
        prev.includes(userId)
          ? prev.filter(id => id !== userId)
          : [...prev, userId]
      );
    }
  };

  const selectAllVisible = () => {
    const allVisibleIds = filteredUsers.map(u => u.user_id);
    const allSelected = allVisibleIds.every(id => selectedUserIds.includes(id));
    if (allSelected) {
      setSelectedUserIds(prev => prev.filter(id => !allVisibleIds.includes(id)));
    } else {
      setSelectedUserIds([...new Set([...selectedUserIds, ...allVisibleIds])]);
    }
  };

  // Bulk actions
  const applyBulkTemplate = async (templateKey) => {
    const template = PERMISSION_TEMPLATES[templateKey];
    if (!template) return;

    try {
      await Promise.all(
        selectedUserIds.map(userId =>
          api.put(`/users/${userId}/permissions`, {
            permissions: template.permissions,
            is_master_admin: false
          })
        )
      );
      toast.success(`Applied "${template.label}" template to ${selectedUserIds.length} users`);
      setSelectedUserIds([]);
      setShowBulkMenu(false);
      fetchUsers();
    } catch (error) {
      toast.error('Failed to apply template to some users');
    }
  };

  const handleBulkPermissionChange = async (permissionsToChange) => {
    try {
      const mode = permissionPickerMode;

      await Promise.all(
        selectedUserIds.map(async (userId) => {
          const user = users.find(u => u.user_id === userId);
          if (!user) return;

          let newPermissions = [...(user.permissions || [])];
          if (mode === 'grant') {
            // Add all selected permissions that aren't already present
            permissionsToChange.forEach(perm => {
              if (!newPermissions.includes(perm)) {
                newPermissions.push(perm);
              }
            });
          } else if (mode === 'revoke') {
            // Remove all selected permissions
            newPermissions = newPermissions.filter(p => !permissionsToChange.includes(p));
          }

          await api.put(`/users/${userId}/permissions`, {
            permissions: newPermissions,
            is_master_admin: user.is_master_admin
          });
        })
      );

      const permCount = permissionsToChange.length;
      toast.success(`${mode === 'grant' ? 'Granted' : 'Revoked'} ${permCount} permission${permCount !== 1 ? 's' : ''} for ${selectedUserIds.length} users`);
      setSelectedUserIds([]);
      setShowBulkMenu(false);
      setShowPermissionPicker(false);
      fetchUsers();
    } catch (error) {
      toast.error('Failed to update permissions for some users');
    }
  };

  const formatLastLogin = (date) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const FILTER_OPTIONS = [
    { key: 'all', label: 'All', icon: Users2 },
    { key: 'admin', label: 'Admins', icon: Shield },
    { key: 'manager', label: 'Managers', icon: UserCheck },
    { key: 'staff', label: 'Staff', icon: UserCheck },
    { key: 'inactive', label: 'Inactive', icon: UserX },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col p-0">
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 bg-white border-b px-6 py-4">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-xl">User Management</DialogTitle>
                  <p className="text-sm text-slate-500">
                    Manage user accounts, roles, and permissions
                  </p>
                </div>
                <Button onClick={() => setShowInviteModal(true)} className="bg-teal-600 hover:bg-teal-700">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Invite User
                </Button>
              </div>
            </DialogHeader>

            {/* Search and Actions Row */}
            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by username or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Bulk Actions */}
              {selectedUserIds.length > 0 && (
                <div className="relative">
                  <Button
                    variant="outline"
                    onClick={() => setShowBulkMenu(!showBulkMenu)}
                    className="flex items-center gap-2"
                  >
                    <Settings2 className="w-4 h-4" />
                    Bulk Actions ({selectedUserIds.length})
                    <ChevronDown className="w-4 h-4" />
                  </Button>

                  {showBulkMenu && (
                    <div className="absolute right-0 top-full mt-1 w-64 bg-white border rounded-xl shadow-lg z-20 py-2">
                      <p className="px-3 py-1 text-xs text-slate-500 uppercase font-semibold">
                        Apply Template
                      </p>
                      {Object.entries(PERMISSION_TEMPLATES).map(([key, template]) => (
                        <button
                          key={key}
                          onClick={() => applyBulkTemplate(key)}
                          className="w-full text-left px-3 py-2 hover:bg-slate-100 text-sm"
                        >
                          {template.label}
                        </button>
                      ))}
                      <div className="border-t my-1" />
                      <button
                        onClick={() => {
                          setPermissionPickerMode('grant');
                          setShowPermissionPicker(true);
                          setShowBulkMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-100 text-sm text-teal-600"
                      >
                        Grant Specific Permission
                      </button>
                      <button
                        onClick={() => {
                          setPermissionPickerMode('revoke');
                          setShowPermissionPicker(true);
                          setShowBulkMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-100 text-sm text-red-600"
                      >
                        Revoke Specific Permission
                      </button>
                    </div>
                  )}
                </div>
              )}

              <Button onClick={fetchUsers} variant="outline" size="icon">
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {/* Filter Pills */}
            <div className="flex gap-2 mt-3 flex-wrap">
              {FILTER_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isActive = filter === option.key;
                return (
                  <button
                    key={option.key}
                    onClick={() => setFilter(option.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${isActive
                      ? 'bg-teal-100 text-teal-700'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                <p className="mt-2 text-sm text-slate-500">Loading users...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                {searchQuery ? 'No users match your search' : 'No users found'}
              </div>
            ) : (
              <div className="space-y-2">
                {/* Select All Header */}
                <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-lg text-sm font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={filteredUsers.length > 0 && filteredUsers.every(u => selectedUserIds.includes(u.user_id))}
                    onChange={selectAllVisible}
                    className="w-4 h-4 rounded border-slate-300 text-teal-600"
                  />
                  <span className="flex-1">Select All ({filteredUsers.length})</span>
                  <span className="w-24">Role</span>
                  <span className="w-24">Access</span>
                  <span className="w-20 text-center">Status</span>
                  <span className="w-10"></span>
                </div>

                {/* User Rows */}
                {filteredUsers.map((user) => (
                  <div
                    key={user.user_id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors cursor-pointer ${selectedUserIds.includes(user.user_id)
                      ? 'bg-teal-50 border-teal-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    onClick={(e) => {
                      if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
                        toggleUserSelection(user.user_id, e);
                      }
                    }}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(user.user_id)}
                      onChange={(e) => toggleUserSelection(user.user_id, e)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded border-slate-300 text-teal-600"
                    />

                    {/* Avatar + Name */}
                    <UserAvatar username={user.username} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate" title={formatLastLogin(user.last_login)}>
                        {user.username}
                        {user.is_master_admin && (
                          <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                            Master
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-slate-500 truncate">{user.email}</p>
                    </div>

                    {/* Role Dropdown */}
                    <div className="w-24">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.user_id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-2 py-1 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="staff">Staff</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>

                    {/* Permissions Button */}
                    <div className="w-24">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPermissionMatrix(user);
                        }}
                        className="w-full flex items-center justify-center gap-1"
                      >
                        <Shield className="w-3 h-3" />
                        <span className="text-xs">Edit</span>
                      </Button>
                    </div>

                    {/* Status Toggle */}
                    <div className="w-20 flex justify-center">
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Switch
                          checked={user.is_active}
                          onCheckedChange={() => handleStatusToggle(user.user_id, user.is_active)}
                        />
                        <span className={`text-xs ${user.is_active ? 'text-green-600' : 'text-red-500'}`}>
                          {user.is_active ? 'On' : 'Off'}
                        </span>
                      </div>
                    </div>

                    {/* Remove User Button */}
                    <div className="w-10 flex justify-center">
                      {canRemoveUser(user) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRemoveConfirmUser(user);
                          }}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 h-8 w-8"
                          title="Remove from company"
                        >
                          <UserMinus className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t px-6 py-3 flex items-center justify-between">
            <span className="text-sm text-slate-600">
              {selectedUserIds.length > 0
                ? `${selectedUserIds.length} selected`
                : `${filteredUsers.length} users`}
            </span>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invite User Modal */}
      <UserInvitationModal
        open={showInviteModal}
        onOpenChange={setShowInviteModal}
        onSuccess={fetchUsers}
      />

      {/* Permission Matrix Dialog */}
      {showPermissionMatrix && selectedUser && (
        <Dialog open={showPermissionMatrix} onOpenChange={setShowPermissionMatrix}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-teal-600" />
                Manage Permissions: {selectedUser.username}
              </DialogTitle>
            </DialogHeader>
            <PermissionMatrix
              permissions={selectedUser.permissions || []}
              isMasterAdmin={selectedUser.is_master_admin}
              onChange={(newPerms) => {
                setSelectedUser(prev => ({ ...prev, permissions: newPerms }));
              }}
              onMasterAdminChange={(value) => {
                setSelectedUser(prev => ({ ...prev, is_master_admin: value }));
              }}
            />
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowPermissionMatrix(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => handleUpdatePermissions(
                  selectedUser.user_id,
                  selectedUser.permissions,
                  selectedUser.is_master_admin
                )}
                disabled={savingPermissions}
                className="bg-teal-600 hover:bg-teal-700"
              >
                {savingPermissions ? 'Saving...' : 'Save Permissions'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Permission Picker Modal for Bulk Operations */}
      <PermissionPickerModal
        open={showPermissionPicker}
        onClose={() => setShowPermissionPicker(false)}
        onSelect={handleBulkPermissionChange}
        title={permissionPickerMode === 'grant' ? 'Grant Permission to Selected Users' : 'Revoke Permission from Selected Users'}
        mode={permissionPickerMode}
      />

      {/* Remove User Confirmation Dialog */}
      <DeleteConfirmDialog
        open={!!removeConfirmUser}
        onClose={() => setRemoveConfirmUser(null)}
        onConfirm={handleRemoveUser}
        title="Remove User from Company"
        description={
          removeConfirmUser
            ? `Are you sure you want to remove "${removeConfirmUser.username}" (${removeConfirmUser.email}) from the company? This action will:\n\n• Permanently remove their access to this company\n• Prevent them from logging in\n• Require a new invitation if they need to rejoin\n\nThis action cannot be easily undone.`
            : ''
        }
        confirmText="Remove User"
        loading={removingUser}
      />
    </>
  );
}
