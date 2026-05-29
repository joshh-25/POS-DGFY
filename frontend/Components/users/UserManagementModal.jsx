import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog.jsx";
import { Button } from "../../components/ui/button.jsx";
import { Input } from "../../components/ui/input.jsx";
import { Switch } from "../../components/ui/switch.jsx";
import { toast } from "sonner";
import * as userService from '../../src/services/userService.js';
import PermissionMatrix from './PermissionMatrix';
import UserAvatar from './UserAvatar';
import UserInvitationModal from './UserInvitationModal';
import PermissionPickerModal from './PermissionPickerModal';
import { listTenantLocations } from '../../src/services/tenantLocationService.js';
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
  UserPlus,
  MapPin,
  Send,
  Copy,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import api from '../../src/services/api.js';
import useStore from '../../src/store/useStore.js';
import DeleteConfirmDialog from '../ui/DeleteConfirmDialog';

// Role hierarchy for permission checks (higher number = higher rank)
const ROLE_HIERARCHY = { admin: 7, manager: 6, po: 5, do: 5, jo: 5, cashier: 4, staff: 3 };
const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  po: 'PO Officer',
  do: 'DO Officer',
  jo: 'JO Officer',
  cashier: 'Cashier',
  staff: 'Staff'
};
const INVITATION_STATUSES = new Set(['pending', 'cancelled', 'expired']);
const INVITATION_STATUS_LABELS = {
  pending: 'Pending',
  cancelled: 'Cancelled',
  expired: 'Expired'
};
const DELIVERY_STATUS_LABELS = {
  not_configured: 'SMTP missing',
  sent: 'Email sent',
  failed: 'Email failed',
  manual_link: 'Manual link'
};

const isInvitationRow = (user) => INVITATION_STATUSES.has(String(user?.invitation_status || '').toLowerCase());
const isPendingInvitation = (user) => String(user?.invitation_status || '').toLowerCase() === 'pending';
const parsePermissions = (permissions) => {
  if (Array.isArray(permissions)) return permissions;
  if (typeof permissions === 'string') {
    try {
      const parsed = JSON.parse(permissions);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};
const parseLocationIds = (locationIds) => (
  Array.isArray(locationIds)
    ? locationIds.map((id) => Number.parseInt(id, 10)).filter((id) => Number.isInteger(id) && id > 0)
    : []
);
const getErrorMessage = (error, fallback) => error?.response?.data?.message || error?.message || fallback;

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
      'pos:view', 'pos:transact', 'pos:price_override', 'pos:cash_drawer_adjust', 'pos:close_day', 'pos:reprint', 'pos:switch_location',
      'stock:view', 'stock:adjust', 'batches:view', 'batches:edit',
      'reports:view',
      'ai:chat', 'ai:action',
      'settings:view', 'settings:edit', 'settings:storefront_branding_edit',
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
      'pos:view',
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
  const [showLocationGrantsModal, setShowLocationGrantsModal] = useState(false);
  const [locationGrantUser, setLocationGrantUser] = useState(null);
  const [locationGrantRows, setLocationGrantRows] = useState([]);
  const [selectedLocationGrantIds, setSelectedLocationGrantIds] = useState([]);
  const [loadingLocationGrants, setLoadingLocationGrants] = useState(false);
  const [savingLocationGrants, setSavingLocationGrants] = useState(false);
  const [roleCatalog, setRoleCatalog] = useState(null);
  const [roleCatalogError, setRoleCatalogError] = useState('');
  const [pendingRoleAssignment, setPendingRoleAssignment] = useState(null);
  const [pendingBulkRoleAssignment, setPendingBulkRoleAssignment] = useState(null);
  const [showBulkRoleScopeModal, setShowBulkRoleScopeModal] = useState(false);
  const [bulkLocationRows, setBulkLocationRows] = useState([]);
  const [selectedBulkLocationIds, setSelectedBulkLocationIds] = useState([]);
  const [loadingBulkRoleScope, setLoadingBulkRoleScope] = useState(false);
  const [savingBulkRoleScope, setSavingBulkRoleScope] = useState(false);

  // New features state
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [showPermissionPicker, setShowPermissionPicker] = useState(false);
  const [permissionPickerMode, setPermissionPickerMode] = useState('grant');

  // Remove user from company state
  const [removeConfirmUser, setRemoveConfirmUser] = useState(null);
  const [removingUser, setRemovingUser] = useState(false);

  // Get current user from store
  const currentUser = useStore((state) => state.currentUser);
  const rolePresets = useMemo(() => (
    Array.isArray(roleCatalog?.presets) ? roleCatalog.presets : []
  ), [roleCatalog]);
  const visiblePermissionGroups = Array.isArray(roleCatalog?.permission_groups) && roleCatalog.permission_groups.length > 0
    ? roleCatalog.permission_groups
    : undefined;
  const permissionTemplates = useMemo(() => {
    if (rolePresets.length > 0) {
      return rolePresets
        .filter((preset) => preset.role !== 'admin')
        .map((preset) => ({
          key: preset.key,
          label: preset.label,
          rolePresetKey: preset.key,
          role: preset.role,
          locationScope: preset.location_scope,
          permissions: preset.permissions || []
        }));
    }

    return Object.entries(PERMISSION_TEMPLATES).map(([key, template]) => ({
      key,
      label: template.label,
      permissions: template.permissions
    }));
  }, [rolePresets]);

  const getRoleDisplay = (user) => user?.role_preset_label || ROLE_LABELS[user?.role] || user?.role || 'Role';
  const getRoleSelectValue = (user) => (
    user?.role_preset_key ? `preset:${user.role_preset_key}` : `legacy:${user?.role || 'staff'}`
  );
  const resetLocationGrantState = () => {
    setShowLocationGrantsModal(false);
    setLocationGrantUser(null);
    setLocationGrantRows([]);
    setSelectedLocationGrantIds([]);
    setPendingRoleAssignment(null);
  };
  const resetBulkRoleScopeState = () => {
    setShowBulkRoleScopeModal(false);
    setPendingBulkRoleAssignment(null);
    setBulkLocationRows([]);
    setSelectedBulkLocationIds([]);
  };

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
      const [data, catalog] = await Promise.all([
        userService.getAllUsers({ include_invitations: true }),
        userService.getRoleCatalog().catch((error) => {
          setRoleCatalogError(getErrorMessage(error, 'Mode-aware role catalog unavailable; legacy roles are shown.'));
          return null;
        })
      ]);
      setUsers(data);
      setRoleCatalog(catalog);
      if (catalog) setRoleCatalogError('');
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
      const normalizedSearchQuery = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery ||
        String(user.username || '').toLowerCase().includes(normalizedSearchQuery) ||
        String(user.email || '').toLowerCase().includes(normalizedSearchQuery) ||
        String(user.phone_number || '').toLowerCase().includes(normalizedSearchQuery);

      // Role/status filter
      let matchesFilter = true;
      if (filter === 'invitations') {
        matchesFilter = isInvitationRow(user);
      } else if (filter === 'missing-phone') {
        matchesFilter = user.is_active && !isInvitationRow(user) && !String(user.phone_number || '').trim();
      } else if (filter === 'inactive') {
        // Inactive tab: show only inactive users
        matchesFilter = !user.is_active && !isInvitationRow(user);
      } else {
        // All other tabs: only show active users
        if (!user.is_active || isInvitationRow(user)) return false;

        // Apply role filter
        if (filter.startsWith('preset:')) {
          matchesFilter = user.role_preset_key === filter.slice('preset:'.length);
        } else if (filter.startsWith('legacy:')) {
          matchesFilter = !user.role_preset_key && user.role === filter.slice('legacy:'.length);
        }
        // 'all' filter shows all active users (no additional filter needed)
      }

      return matchesSearch && matchesFilter;
    });
  }, [users, searchQuery, filter]);

  const handleRoleChange = async (userId, selectionValue) => {
    try {
      const user = users.find((entry) => entry.user_id === userId);
      const isPresetSelection = selectionValue.startsWith('preset:');
      const presetKey = isPresetSelection ? selectionValue.slice('preset:'.length) : '';
      const preset = isPresetSelection
        ? rolePresets.find((entry) => entry.key === presetKey)
        : null;
      const payload = isPresetSelection
        ? { role_preset_key: presetKey }
        : { role: selectionValue.replace(/^legacy:/, '') };

      if (preset?.location_scope === 'assigned') {
        setLocationGrantUser(user || { user_id: userId, username: 'User' });
        setPendingRoleAssignment({
          label: preset.label,
          payload
        });
        setShowLocationGrantsModal(true);
        setLoadingLocationGrants(true);
        try {
          const data = await userService.getUserLocationGrants(userId);
          const rows = Array.isArray(data?.locations) ? data.locations : [];
          const grantedIds = parseLocationIds(data?.granted_location_ids);
          setLocationGrantRows(rows);
          setSelectedLocationGrantIds(grantedIds);
          if (rows.length <= 1) {
            const singleLocationIds = rows.map((row) => Number(row.location_id)).filter((id) => Number.isInteger(id) && id > 0);
            const updatedUser = await userService.updateUserRole(userId, {
              ...payload,
              location_ids: singleLocationIds.length > 0 ? singleLocationIds : grantedIds
            });
            toast.success('User role updated successfully');
            resetLocationGrantState();
            if (selectedUser && selectedUser.user_id === userId) {
              setSelectedUser(prev => ({
                ...prev,
                role: updatedUser.role,
                role_preset_key: updatedUser.role_preset_key || null,
                role_preset_label: updatedUser.role_preset_label,
                role_preset_status: updatedUser.role_preset_status,
                permissions: parsePermissions(updatedUser.permissions),
                is_master_admin: updatedUser.is_master_admin
              }));
            }
            fetchUsers();
          }
        } catch (error) {
          toast.error(getErrorMessage(error, 'Failed to prepare role assignment scope'));
          resetLocationGrantState();
        } finally {
          setLoadingLocationGrants(false);
        }
        return;
      }

      const updatedUser = await userService.updateUserRole(userId, payload);
      toast.success('User role updated successfully');

      // If the Permission Matrix is open for this user, update selectedUser with new permissions
      if (selectedUser && selectedUser.user_id === userId) {
        const permissions = parsePermissions(updatedUser.permissions);

        setSelectedUser(prev => ({
          ...prev,
          role: updatedUser.role,
          role_preset_key: updatedUser.role_preset_key || null,
          role_preset_label: updatedUser.role_preset_label,
          role_preset_status: updatedUser.role_preset_status,
          permissions: permissions,
          is_master_admin: updatedUser.is_master_admin
        }));
      }

      fetchUsers();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to update role'));
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

  const handleCopyInvitationLink = async (user) => {
    try {
      const result = await userService.createInvitationLink(user.user_id);
      if (!result.invitation_url) {
        throw new Error('Invitation link was not returned');
      }
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard is not available in this browser');
      }
      await navigator.clipboard.writeText(result.invitation_url);
      toast.success('Invitation link copied');
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Failed to create invitation link');
    }
  };

  const handleResendInvitation = async (user) => {
    try {
      const result = await userService.resendUserInvitation(user.user_id);
      if (result.invitation_url) {
        if (!navigator.clipboard?.writeText) {
          throw new Error('Clipboard is not available in this browser');
        }
        await navigator.clipboard.writeText(result.invitation_url);
        toast.success('Invitation link copied because email was not sent');
      } else {
        toast.success('Invitation resent');
      }
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || 'Failed to resend invitation');
    }
  };

  const handleCancelInvitation = async (user) => {
    try {
      await userService.cancelUserInvitation(user.user_id);
      toast.success('Invitation cancelled');
      fetchUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to cancel invitation');
    }
  };

  const openPermissionMatrix = (user) => {
    setSelectedUser({
      ...user,
      permissions: parsePermissions(user.permissions)
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
      window.dispatchEvent(new CustomEvent('auth:login'));
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

  const openLocationGrantEditor = async (user) => {
    setLocationGrantUser(user);
    setPendingRoleAssignment(null);
    setShowLocationGrantsModal(true);
    setLoadingLocationGrants(true);
    try {
      const data = await userService.getUserLocationGrants(user.user_id);
      const rows = Array.isArray(data?.locations) ? data.locations : [];
      const grantedIds = parseLocationIds(data?.granted_location_ids);
      setLocationGrantRows(rows);
      setSelectedLocationGrantIds(grantedIds);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load location grants');
      resetLocationGrantState();
    } finally {
      setLoadingLocationGrants(false);
    }
  };

  const toggleLocationGrant = (locationId) => {
    setSelectedLocationGrantIds((previous) => (
      previous.includes(locationId)
        ? previous.filter((id) => id !== locationId)
        : [...previous, locationId]
    ));
  };

  const toggleAllLocationGrants = () => {
    const allLocationIds = locationGrantRows.map((row) => Number(row.location_id)).filter((id) => Number.isInteger(id) && id > 0);
    const allSelected = allLocationIds.length > 0
      && allLocationIds.every((id) => selectedLocationGrantIds.includes(id));
    setSelectedLocationGrantIds(allSelected ? [] : allLocationIds);
  };

  const handleSaveLocationGrants = async () => {
    if (!locationGrantUser) return;
    if (pendingRoleAssignment && locationGrantRows.length > 1 && selectedLocationGrantIds.length === 0) {
      toast.error('Select at least one location for this assigned-scope role.');
      return;
    }
    setSavingLocationGrants(true);
    try {
      if (pendingRoleAssignment) {
        const updatedUser = await userService.updateUserRole(locationGrantUser.user_id, {
          ...pendingRoleAssignment.payload,
          location_ids: selectedLocationGrantIds
        });
        if (selectedUser && selectedUser.user_id === locationGrantUser.user_id) {
          setSelectedUser(prev => ({
            ...prev,
            role: updatedUser.role,
            role_preset_key: updatedUser.role_preset_key || null,
            role_preset_label: updatedUser.role_preset_label,
            role_preset_status: updatedUser.role_preset_status,
            permissions: parsePermissions(updatedUser.permissions),
            is_master_admin: updatedUser.is_master_admin
          }));
        }
        toast.success('Role and location scope updated successfully');
      } else {
        await userService.updateUserLocationGrants(locationGrantUser.user_id, selectedLocationGrantIds);
        toast.success('Location grants updated successfully');
      }
      resetLocationGrantState();
      fetchUsers();
    } catch (error) {
      toast.error(getErrorMessage(error, pendingRoleAssignment ? 'Failed to update role and location scope' : 'Failed to update location grants'));
    } finally {
      setSavingLocationGrants(false);
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
    const template = permissionTemplates.find((entry) => entry.key === templateKey);
    if (!template) return;
    if (template.rolePresetKey && template.locationScope === 'assigned') {
      setPendingBulkRoleAssignment(template);
      setShowBulkRoleScopeModal(true);
      setShowBulkMenu(false);
      setLoadingBulkRoleScope(true);
      try {
        const rows = await listTenantLocations({ include_inactive: false });
        const activeRows = Array.isArray(rows) ? rows.filter((row) => row.is_active !== false) : [];
        setBulkLocationRows(activeRows);
        setSelectedBulkLocationIds(activeRows.length === 1 ? [Number(activeRows[0].location_id)] : []);
      } catch (error) {
        toast.error(getErrorMessage(error, 'Failed to load locations for bulk role assignment'));
        resetBulkRoleScopeState();
      } finally {
        setLoadingBulkRoleScope(false);
      }
      return;
    }

    try {
      if (template.rolePresetKey) {
        await Promise.all(
          selectedUserIds.map(userId =>
            userService.updateUserRole(userId, { role_preset_key: template.rolePresetKey })
          )
        );
      } else {
        await Promise.all(
          selectedUserIds.map(userId =>
            api.put(`/users/${userId}/permissions`, {
              permissions: template.permissions,
              is_master_admin: false
            })
          )
        );
      }
      toast.success(`Applied "${template.label}" template to ${selectedUserIds.length} users`);
      setSelectedUserIds([]);
      setShowBulkMenu(false);
      fetchUsers();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to apply template to some users'));
    }
  };

  const toggleBulkLocation = (locationId) => {
    setSelectedBulkLocationIds((previous) => (
      previous.includes(locationId)
        ? previous.filter((id) => id !== locationId)
        : [...previous, locationId]
    ));
  };

  const toggleAllBulkLocations = () => {
    const allLocationIds = bulkLocationRows.map((row) => Number(row.location_id)).filter((id) => Number.isInteger(id) && id > 0);
    const allSelected = allLocationIds.length > 0
      && allLocationIds.every((id) => selectedBulkLocationIds.includes(id));
    setSelectedBulkLocationIds(allSelected ? [] : allLocationIds);
  };

  const handleSaveBulkRoleScope = async () => {
    if (!pendingBulkRoleAssignment) return;
    if (bulkLocationRows.length > 1 && selectedBulkLocationIds.length === 0) {
      toast.error('Select at least one location for this assigned-scope role.');
      return;
    }

    setSavingBulkRoleScope(true);
    try {
      await Promise.all(
        selectedUserIds.map(userId =>
          userService.updateUserRole(userId, {
            role_preset_key: pendingBulkRoleAssignment.rolePresetKey,
            location_ids: selectedBulkLocationIds
          })
        )
      );
      toast.success(`Applied "${pendingBulkRoleAssignment.label}" to ${selectedUserIds.length} users`);
      setSelectedUserIds([]);
      resetBulkRoleScopeState();
      fetchUsers();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to apply role and location scope to selected users'));
    } finally {
      setSavingBulkRoleScope(false);
    }
  };

  const handleBulkPermissionChange = async (permissionsToChange) => {
    try {
      const mode = permissionPickerMode;

      await Promise.all(
        selectedUserIds.map(async (userId) => {
          const user = users.find(u => u.user_id === userId);
          if (!user) return;

          let newPermissions = parsePermissions(user.permissions);
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

  const formatShortDate = (date) => {
    if (!date) return 'Not set';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const FILTER_OPTIONS = useMemo(() => {
    const modeRoleFilters = rolePresets.map((preset) => ({
      key: `preset:${preset.key}`,
      label: preset.label,
      icon: preset.role === 'admin' ? Shield : UserCheck
    }));
    const legacyRoleFilters = rolePresets.length === 0
      ? [
          { key: 'legacy:admin', label: 'Admins', icon: Shield },
          { key: 'legacy:manager', label: 'Managers', icon: UserCheck },
          { key: 'legacy:cashier', label: 'Cashiers', icon: UserCheck },
          { key: 'legacy:po', label: 'PO', icon: UserCheck },
          { key: 'legacy:do', label: 'DO', icon: UserCheck },
          { key: 'legacy:jo', label: 'JO', icon: UserCheck },
          { key: 'legacy:staff', label: 'Staff', icon: UserCheck }
        ]
      : [];

    return [
      { key: 'all', label: 'All', icon: Users2 },
      { key: 'invitations', label: 'Invitations', icon: UserPlus },
      { key: 'missing-phone', label: 'Missing Phone', icon: AlertTriangle },
      ...modeRoleFilters,
      ...legacyRoleFilters,
      { key: 'inactive', label: 'Inactive', icon: UserX }
    ];
  }, [rolePresets]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-6xl max-h-[90vh] flex flex-col overflow-hidden p-0 sm:w-[calc(100vw-2rem)]">
          {/* Sticky Header */}
          <div className="sticky top-0 z-10 bg-white border-b px-4 py-4 sm:px-6">
            <DialogHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <DialogTitle className="text-xl">User Management</DialogTitle>
                  <p className="text-sm text-slate-500">
                    Manage user accounts, roles, and permissions
                  </p>
                </div>
                <Button onClick={() => setShowInviteModal(true)} className="w-full bg-teal-600 hover:bg-teal-700 sm:w-auto">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Invite User
                </Button>
              </div>
            </DialogHeader>
            {roleCatalogError && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{roleCatalogError}</span>
              </div>
            )}

            {/* Search and Actions Row */}
            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by username, email, or phone..."
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
                      {permissionTemplates.map((template) => (
                        <button
                          key={template.key}
                          onClick={() => applyBulkTemplate(template.key)}
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
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
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
              <div className="overflow-x-auto pb-2">
                <div className="min-w-[760px] space-y-2">
                {/* Select All Header */}
                <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-lg text-sm font-medium text-slate-600">
                  <input
                    type="checkbox"
                    checked={filteredUsers.length > 0 && filteredUsers.every(u => selectedUserIds.includes(u.user_id))}
                    onChange={selectAllVisible}
                    className="w-4 h-4 rounded border-slate-300 text-teal-600"
                  />
                  <span className="flex-1">Select All ({filteredUsers.length})</span>
                  <span className="w-40">Role</span>
                  <span className="w-24">Access</span>
                  <span className="w-28">Locations</span>
                  <span className="w-20 text-center">Status</span>
                  <span className="w-28"></span>
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
                      {user.phone_number ? (
                        <p className="text-xs text-slate-500 truncate">{user.phone_number}</p>
                      ) : !isInvitationRow(user) ? (
                        <p className="text-xs text-amber-700 truncate">Phone number missing</p>
                      ) : null}
                      {isInvitationRow(user) && (
                        <p className="text-xs text-slate-500 truncate">
                          Expires {formatShortDate(user.invitation_expires_at)}
                          {user.invited_by ? ` - Invited by user #${user.invited_by}` : ''}
                        </p>
                      )}
                    </div>

                    {/* Role Dropdown */}
                    <div className="w-40">
                      {isInvitationRow(user) ? (
                        <div className="space-y-1">
                          <span className="block truncate text-sm font-medium text-slate-700">
                            {getRoleDisplay(user)}
                          </span>
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            {INVITATION_STATUS_LABELS[user.invitation_status] || user.invitation_status}
                          </span>
                        </div>
                      ) : (
                      <select
                        value={getRoleSelectValue(user)}
                        onChange={(e) => handleRoleChange(user.user_id, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-2 py-1 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        {user.role_preset_key && !rolePresets.some((preset) => preset.key === user.role_preset_key) && (
                          <option value={`preset:${user.role_preset_key}`} disabled>
                            {getRoleDisplay(user)}
                          </option>
                        )}
                        {rolePresets.length > 0 ? (
                          rolePresets.map((preset) => (
                            <option key={preset.key} value={`preset:${preset.key}`}>
                              {preset.label}
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="legacy:staff">Staff</option>
                            <option value="legacy:cashier">Cashier</option>
                            <option value="legacy:po">PO Officer</option>
                            <option value="legacy:do">DO Officer</option>
                            <option value="legacy:jo">JO Officer</option>
                            <option value="legacy:manager">Manager</option>
                            <option value="legacy:admin">Admin</option>
                          </>
                        )}
                      </select>
                      )}
                    </div>

                    {/* Permissions Button */}
                    <div className="w-24">
                      {isInvitationRow(user) ? (
                        <span className="text-xs text-slate-400">After accept</span>
                      ) : (
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
                      )}
                    </div>

                    {/* Location Grants Button */}
                    <div className="w-28">
                      {isInvitationRow(user) ? (
                        <span className="text-xs text-slate-400">Pre-set</span>
                      ) : (
                        <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openLocationGrantEditor(user);
                        }}
                        className="w-full flex items-center justify-center gap-1"
                      >
                        <MapPin className="w-3 h-3" />
                        <span className="text-xs">Scope</span>
                      </Button>
                      )}
                    </div>

                    {/* Status Toggle */}
                    <div className="w-20 flex justify-center">
                      {isInvitationRow(user) ? (
                        <span className="text-xs text-amber-700">
                          {DELIVERY_STATUS_LABELS[user.invitation_delivery_status] || user.invitation_delivery_status || 'Pending'}
                        </span>
                      ) : (
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
                      )}
                    </div>

                    {/* Remove User Button */}
                    <div className="w-28 flex justify-center">
                      {isInvitationRow(user) ? (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-1" title="Resend invitation" onClick={(e) => { e.stopPropagation(); handleResendInvitation(user); }}>
                            <Send className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-1" title="Copy invitation link" onClick={(e) => { e.stopPropagation(); handleCopyInvitationLink(user); }}>
                            <Copy className="w-4 h-4" />
                          </Button>
                          {isPendingInvitation(user) && (
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-1 text-red-500 hover:bg-red-50 hover:text-red-700" title="Cancel invitation" onClick={(e) => { e.stopPropagation(); handleCancelInvitation(user); }}>
                              <XCircle className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ) : (
                        <>
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
                        </>
                      )}
                    </div>
                  </div>
                ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t px-4 py-3 flex items-center justify-between sm:px-6">
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
        roleCatalog={roleCatalog}
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
              permissionGroups={visiblePermissionGroups}
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

      {/* Location Grant Dialog */}
      <Dialog
        open={showLocationGrantsModal}
        onOpenChange={(isOpen) => {
          if (savingLocationGrants) return;
          setShowLocationGrantsModal(isOpen);
          if (!isOpen) {
            resetLocationGrantState();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-teal-600" />
              {pendingRoleAssignment
                ? `Assign ${pendingRoleAssignment.label}: ${locationGrantUser?.username || 'User'}`
                : `Location Scope: ${locationGrantUser?.username || 'User'}`}
            </DialogTitle>
          </DialogHeader>

          {loadingLocationGrants ? (
            <div className="py-10 text-center text-slate-500 text-sm">Loading location grants...</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-600">
                  {pendingRoleAssignment
                    ? 'This role requires an assigned location scope. The role preset and location grants will be saved together.'
                    : 'Location grants define where this user can execute stock-affecting actions when multi-location inventory is enabled.'}
                </div>
                <Button variant="outline" size="sm" onClick={toggleAllLocationGrants}>
                  {locationGrantRows.length > 0 && locationGrantRows.every((row) => selectedLocationGrantIds.includes(Number(row.location_id)))
                    ? 'Clear All'
                    : 'Grant All'}
                </Button>
              </div>

              {locationGrantRows.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No active locations available.
                </div>
              ) : (
                <div className="space-y-2">
                  {locationGrantRows.map((row) => {
                    const locationId = Number(row.location_id);
                    const checked = selectedLocationGrantIds.includes(locationId);
                    return (
                      <label
                        key={`location-grant-${locationId}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:border-slate-300"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{row.name}</p>
                          <p className="text-xs text-slate-500">
                            {row.is_primary_storefront ? 'Primary storefront' : 'Secondary location'} {row.is_open ? '• Open' : '• Closed'}
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLocationGrant(locationId)}
                          className="w-4 h-4 rounded border-slate-300 text-teal-600"
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                resetLocationGrantState();
              }}
              disabled={savingLocationGrants}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveLocationGrants}
              disabled={savingLocationGrants || loadingLocationGrants}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {savingLocationGrants
                ? 'Saving...'
                : pendingRoleAssignment
                  ? 'Assign Role'
                  : 'Save Location Scope'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Assigned-Scope Role Dialog */}
      <Dialog
        open={showBulkRoleScopeModal}
        onOpenChange={(isOpen) => {
          if (savingBulkRoleScope) return;
          setShowBulkRoleScopeModal(isOpen);
          if (!isOpen) {
            resetBulkRoleScopeState();
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-teal-600" />
              Apply {pendingBulkRoleAssignment?.label || 'Role'} To {selectedUserIds.length} Users
            </DialogTitle>
          </DialogHeader>

          {loadingBulkRoleScope ? (
            <div className="py-10 text-center text-slate-500 text-sm">Loading locations...</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-600">
                  This assigned-scope preset will be saved with the same location grants for every selected user.
                </div>
                <Button variant="outline" size="sm" onClick={toggleAllBulkLocations}>
                  {bulkLocationRows.length > 0 && bulkLocationRows.every((row) => selectedBulkLocationIds.includes(Number(row.location_id)))
                    ? 'Clear All'
                    : 'Grant All'}
                </Button>
              </div>

              {bulkLocationRows.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  No active locations available.
                </div>
              ) : (
                <div className="space-y-2">
                  {bulkLocationRows.map((row) => {
                    const locationId = Number(row.location_id);
                    const checked = selectedBulkLocationIds.includes(locationId);
                    return (
                      <label
                        key={`bulk-role-location-${locationId}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:border-slate-300"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{row.name}</p>
                          <p className="text-xs text-slate-500">
                            {row.is_primary_storefront ? 'Primary storefront' : 'Secondary location'} {row.is_open ? '• Open' : '• Closed'}
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBulkLocation(locationId)}
                          className="w-4 h-4 rounded border-slate-300 text-teal-600"
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
            <Button
              variant="outline"
              onClick={resetBulkRoleScopeState}
              disabled={savingBulkRoleScope}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveBulkRoleScope}
              disabled={savingBulkRoleScope || loadingBulkRoleScope}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {savingBulkRoleScope ? 'Saving...' : 'Apply Role'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Permission Picker Modal for Bulk Operations */}
      <PermissionPickerModal
        open={showPermissionPicker}
        onClose={() => setShowPermissionPicker(false)}
        onSelect={handleBulkPermissionChange}
        title={permissionPickerMode === 'grant' ? 'Grant Permission to Selected Users' : 'Revoke Permission from Selected Users'}
        mode={permissionPickerMode}
        permissionGroups={visiblePermissionGroups}
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
