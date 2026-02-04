import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  Package,
  AlertTriangle,
  Warehouse,
  Percent,
  Bell,
  RefreshCw,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Users,
  Building2,
  Copy,
  Link as LinkIcon
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import useStore from '../src/store/useStore.js';
import { usePermission } from '../src/hooks/usePermission';
import * as userService from '../src/services/userService.js';
import * as settingsService from '../src/services/settingsService.js';
import UserManagementModal from '../Components/users/UserManagementModal.jsx';

export default function Settings() {
  const [settings, setSettings] = useState({
    defaultMinThreshold: 40,
    defaultPurchaseAllowance: 20,
    lowStockAlertEnabled: true,
    surplusAlertEnabled: true,
    procurementReminderDay: 1,
    qualityThreshold: 3.5,
    autoCalculateThresholds: true
  });

  const [profileSettings, setProfileSettings] = useState({
    username: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });

  const [profileErrors, setProfileErrors] = useState({});
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [companyInfo, setCompanyInfo] = useState(null);
  const { currentUser, setCurrentUser } = useStore();
  const { can } = usePermission();

  // Fetch current user and system settings on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch current user
        const user = await userService.getCurrentUser();
        setCurrentUser(user);
        setProfileSettings({
          username: user.username,
          email: user.email,
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });

        // Fetch system settings
        const systemSettings = await settingsService.getAllSettings();

        // Map backend settings to frontend state
        setSettings({
          defaultMinThreshold: systemSettings.min_stock_threshold_percent?.value || 40,
          defaultPurchaseAllowance: systemSettings.purchase_allowance_percent?.value || 20,
          lowStockAlertEnabled: systemSettings.enable_low_stock_alerts?.value ?? true,
          surplusAlertEnabled: systemSettings.enable_expiry_alerts?.value ?? true,
          procurementReminderDay: systemSettings.alert_frequency_hours?.value || 24,
          qualityThreshold: systemSettings.supplier_rating_threshold?.value || 3.5,
          autoCalculateThresholds: systemSettings.enable_auto_reorder?.value ?? true
        });

        // Fetch company info if master admin
        if (user.is_master_admin) {
          try {
            const companyData = await settingsService.getCompanyInfo();
            setCompanyInfo(companyData);
          } catch (companyError) {
            // Silently fail - not critical for page load
            console.warn('Failed to load company info:', companyError.message);
          }
        }
      } catch (error) {
        toast.error('Failed to load settings');
      }
    };

    fetchData();
  }, []);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleProfileChange = (key, value) => {
    setProfileSettings(prev => ({ ...prev, [key]: value }));
    // Clear error for this field
    setProfileErrors(prev => ({ ...prev, [key]: '' }));
  };

  const handleSave = async () => {
    setProfileErrors({});

    try {
      // Validate password fields if changing password
      if (profileSettings.newPassword || profileSettings.currentPassword) {
        if (!profileSettings.currentPassword) {
          setProfileErrors({ currentPassword: 'Current password is required' });
          toast.error('Please enter your current password');
          return;
        }

        if (profileSettings.newPassword !== profileSettings.confirmPassword) {
          setProfileErrors({ confirmPassword: 'Passwords do not match' });
          toast.error('New passwords do not match');
          return;
        }
      }

      // Update profile (username/email) if changed
      if (profileSettings.username !== currentUser?.username ||
        profileSettings.email !== currentUser?.email) {
        await userService.updateProfile({
          username: profileSettings.username,
          email: profileSettings.email
        });

        // Update current user
        const newUser = await userService.getCurrentUser();
        setCurrentUser(newUser);
      }

      // Change password if provided
      if (profileSettings.newPassword && profileSettings.currentPassword) {
        await userService.changePassword({
          currentPassword: profileSettings.currentPassword,
          newPassword: profileSettings.newPassword
        });

        // Clear password fields
        setProfileSettings(prev => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        }));
      }

      // Save threshold settings to backend
      await settingsService.updateSettings({
        enable_auto_reorder: settings.autoCalculateThresholds,
        min_stock_threshold_percent: settings.defaultMinThreshold,
        purchase_allowance_percent: settings.defaultPurchaseAllowance
      });

      toast.success("Settings saved successfully!");
    } catch (error) {
      const errorMsg = error.response?.data?.message || 'Failed to save settings';
      toast.error(errorMsg);

      // Handle validation errors
      if (error.response?.data?.errors) {
        const errors = {};
        error.response.data.errors.forEach(err => {
          errors[err.field] = err.message;
        });
        setProfileErrors(errors);
      }
    }
  };

  const handleReset = () => {
    // Reset profile to current user data
    if (currentUser) {
      setProfileSettings({
        username: currentUser.username,
        email: currentUser.email,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    }

    // Reset system settings
    setSettings({
      defaultMinThreshold: 40,
      defaultPurchaseAllowance: 20,
      lowStockAlertEnabled: true,
      surplusAlertEnabled: true,
      procurementReminderDay: 1,
      qualityThreshold: 3.5,
      autoCalculateThresholds: true
    });
    toast.success("Settings reset to defaults");
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Settings</h1>
          <p className="text-slate-500 mt-1">Configure system parameters and thresholds</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleReset}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button onClick={handleSave} className="bg-teal-600 hover:bg-teal-700">
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Profile Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-teal-600" />
              Profile Settings
            </CardTitle>
            <CardDescription>
              Manage your account information and security settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Username Field */}
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={profileSettings.username}
                onChange={(e) => handleProfileChange('username', e.target.value)}
                placeholder="Enter username"
              />
              {profileErrors.username && (
                <p className="text-xs text-red-600">{profileErrors.username}</p>
              )}
            </div>

            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-500" />
                <Input
                  id="email"
                  type="email"
                  value={profileSettings.email}
                  onChange={(e) => handleProfileChange('email', e.target.value)}
                  placeholder="Enter email"
                  className="flex-1"
                />
              </div>
              {profileErrors.email && (
                <p className="text-xs text-red-600">{profileErrors.email}</p>
              )}
            </div>

            <Separator />

            {/* Password Change Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-600" />
                <Label className="text-base font-semibold">Change Password</Label>
              </div>
              <p className="text-sm text-slate-500">
                Leave blank to keep current password
              </p>

              {/* Current Password */}
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showPasswords.current ? "text" : "password"}
                    value={profileSettings.currentPassword}
                    onChange={(e) => handleProfileChange('currentPassword', e.target.value)}
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                    onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                  >
                    {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {profileErrors.currentPassword && (
                  <p className="text-xs text-red-600">{profileErrors.currentPassword}</p>
                )}
              </div>

              {/* New Password */}
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showPasswords.new ? "text" : "password"}
                    value={profileSettings.newPassword}
                    onChange={(e) => handleProfileChange('newPassword', e.target.value)}
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                    onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                  >
                    {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Must be 8+ characters with uppercase, lowercase, number, and special character
                </p>
                {profileErrors.newPassword && (
                  <p className="text-xs text-red-600">{profileErrors.newPassword}</p>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showPasswords.confirm ? "text" : "password"}
                    value={profileSettings.confirmPassword}
                    onChange={(e) => handleProfileChange('confirmPassword', e.target.value)}
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                    onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                  >
                    {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {profileErrors.confirmPassword && (
                  <p className="text-xs text-red-600">{profileErrors.confirmPassword}</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Current Role Display */}
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Current Role</span>
                <span className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm font-medium capitalize">
                  {currentUser?.role || 'Loading...'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Contact an administrator to change your role
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Company Information - Master Admin Only */}
        {currentUser?.is_master_admin && companyInfo && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-teal-600" />
                Company Information
              </CardTitle>
              <CardDescription>
                Share these details with new employees to join your company
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Company Name */}
              <div className="space-y-2">
                <Label>Company Name</Label>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <span className="font-medium text-slate-900">{companyInfo.company_name}</span>
                </div>
              </div>

              {/* Company Token */}
              <div className="space-y-2">
                <Label>Company Token</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={companyInfo.company_token}
                    readOnly
                    className="font-mono bg-slate-50"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(companyInfo.company_token);
                      toast.success('Token copied to clipboard');
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  New employees can use this token when registering
                </p>
              </div>

              {/* Registration Link */}
              <div className="space-y-2">
                <Label>Registration Link</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={companyInfo.registration_link}
                    readOnly
                    className="text-sm bg-slate-50"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(companyInfo.registration_link);
                      toast.success('Link copied to clipboard');
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  Share this link with new employees - it pre-fills the company token
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* User Management - Admin Only (Granular Permission) */}
        {can('users:manage') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-teal-600" />
                User Management
              </CardTitle>
              <CardDescription>
                Manage user accounts, roles, and permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setShowUserManagement(true)}
                className="w-full bg-teal-600 hover:bg-teal-700"
              >
                Manage Users
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Threshold Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-teal-600" />
              Stock Thresholds
            </CardTitle>
            <CardDescription>
              Configure default thresholds for inventory items
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-calculate Thresholds</Label>
                <p className="text-sm text-slate-500">
                  Automatically set min threshold and purchase allowance based on max capacity
                </p>
              </div>
              <Switch
                checked={settings.autoCalculateThresholds}
                onCheckedChange={(v) => handleChange('autoCalculateThresholds', v)}
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className={!settings.autoCalculateThresholds ? 'text-slate-400' : ''}>Default Minimum Threshold</Label>
                  <span className={`text-sm font-medium ${!settings.autoCalculateThresholds ? 'text-slate-400' : 'text-slate-900'}`}>{settings.defaultMinThreshold}% of capacity</span>
                </div>
                <Slider
                  value={[settings.defaultMinThreshold]}
                  onValueChange={([v]) => handleChange('defaultMinThreshold', v)}
                  max={100}
                  step={5}
                  disabled={!settings.autoCalculateThresholds}
                  className={`w-full ${!settings.autoCalculateThresholds ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
                <p className="text-xs text-slate-500">
                  Items below this percentage will trigger low stock alerts
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className={!settings.autoCalculateThresholds ? 'text-slate-400' : ''}>Default Purchase Allowance</Label>
                  <span className={`text-sm font-medium ${!settings.autoCalculateThresholds ? 'text-slate-400' : 'text-slate-900'}`}>{settings.defaultPurchaseAllowance}% of capacity</span>
                </div>
                <Slider
                  value={[settings.defaultPurchaseAllowance]}
                  onValueChange={([v]) => handleChange('defaultPurchaseAllowance', v)}
                  max={50}
                  step={5}
                  disabled={!settings.autoCalculateThresholds}
                  className={`w-full ${!settings.autoCalculateThresholds ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
                <p className="text-xs text-slate-500">
                  Recommended order quantity for restocking
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alert Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-teal-600" />
              Alert Notifications
            </CardTitle>
            <CardDescription>
              Configure when and how you receive inventory alerts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Low Stock Alerts</Label>
                <p className="text-sm text-slate-500">
                  Show alerts when items fall below minimum threshold
                </p>
              </div>
              <Switch
                checked={settings.lowStockAlertEnabled}
                onCheckedChange={(v) => handleChange('lowStockAlertEnabled', v)}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Surplus Alerts</Label>
                <p className="text-sm text-slate-500">
                  Show alerts when items exceed maximum capacity
                </p>
              </div>
              <Switch
                checked={settings.surplusAlertEnabled}
                onCheckedChange={(v) => handleChange('surplusAlertEnabled', v)}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Monthly Procurement Reminder</Label>
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-500">Show reminder from day</span>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={settings.procurementReminderDay}
                  onChange={(e) => handleChange('procurementReminderDay', parseInt(e.target.value) || 1)}
                  className="w-20"
                />
                <span className="text-sm text-slate-500">of each month</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Supplier Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-teal-600" />
              Quality Control
            </CardTitle>
            <CardDescription>
              Configure supplier quality thresholds and requirements
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Minimum Quality Rating</Label>
                <span className="text-sm font-medium text-slate-900">{settings.qualityThreshold} / 5.0</span>
              </div>
              <Slider
                value={[settings.qualityThreshold * 20]}
                onValueChange={([v]) => handleChange('qualityThreshold', v / 20)}
                max={100}
                step={10}
                className="w-full"
              />
              <p className="text-xs text-slate-500">
                Suppliers below this rating will be flagged for review
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Storage Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Warehouse className="w-5 h-5 text-teal-600" />
              Storage Locations
            </CardTitle>
            <CardDescription>
              Manage warehouse and storage area configurations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {['Main Warehouse', 'Production Floor', 'Shipping Area', 'Quality Control', 'Cold Storage'].map((location, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="font-medium text-slate-900">{location}</span>
                  <span className="text-sm text-emerald-600">Active</span>
                </div>
              ))}
            </div>
            <Button variant="outline" className="mt-4 w-full">
              + Add Storage Location
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* User Management Modal */}
      {showUserManagement && (
        <UserManagementModal
          open={showUserManagement}
          onOpenChange={setShowUserManagement}
        />
      )}
    </div>
  );
}