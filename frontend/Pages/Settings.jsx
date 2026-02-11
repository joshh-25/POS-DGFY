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
  Link as LinkIcon,
  CreditCard,
  Star,
  CheckCircle2,
  History,
  XCircle,
  ExternalLink
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import useStore from '../src/store/useStore.js';
import { usePermission } from '../src/hooks/usePermission';
import * as userService from '../src/services/userService.js';
import * as settingsService from '../src/services/settingsService.js';
import * as paymentService from '../src/services/paymentService.js';
import UserManagementModal from '../Components/users/UserManagementModal.jsx';
import { useSearchParams } from 'react-router-dom';

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'profile';

  const [settings, setSettings] = useState({
    defaultMinThreshold: 40,
    defaultPurchaseAllowance: 20,
    lowStockAlertEnabled: true,
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

  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [billingHistory, setBillingHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

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

  // Fetch billing history when tab changes to subscription
  useEffect(() => {
    if (currentTab === 'subscription' && currentUser?.company?.plan === 'premium') {
      fetchBillingHistory();
    }
  }, [currentTab, currentUser?.company?.plan]);

  const fetchBillingHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const history = await paymentService.getBillingHistory();
      setBillingHistory(history);
    } catch (err) {
      console.error('Failed to fetch billing history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

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

  const handleUpgradeSuccess = async (subscriptionId) => {
    setIsUpgrading(true);
    try {
      await paymentService.upgradeToPremium(subscriptionId);

      const user = await userService.getCurrentUser();
      setCurrentUser(user);
      toast.success("Welcome to Premium! Your features are now unlocked.");
    } catch (err) {
      toast.error("Upgrade pending verification. Please refresh in a moment.");
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm("Are you sure you want to cancel your Premium subscription? You will retain access until the end of your current billing period.")) {
      return;
    }

    setIsCancelling(true);
    try {
      const result = await paymentService.cancelSubscription();
      const updatedUser = await userService.getCurrentUser();
      setCurrentUser(updatedUser);
      toast.success(result.message || "Subscription cancelled successfully.");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to cancel subscription.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSyncSubscription = async () => {
    setIsSyncing(true);
    try {
      const result = await paymentService.syncSubscription();
      const updatedUser = await userService.getCurrentUser();
      setCurrentUser(updatedUser);
      toast.success("Subscription status updated from PayPal.");
      fetchBillingHistory();
    } catch (err) {
      toast.error("Failed to sync status. Please try again later.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Settings</h1>
          <p className="text-slate-500 mt-1">Configure your workspace and profile</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleReset}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button onClick={handleSave} className="bg-teal-600 hover:bg-teal-700">
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>

      <Tabs value={currentTab} onValueChange={(v) => setSearchParams({ tab: v })} className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px] mb-8">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-teal-600" />
                Profile Settings
              </CardTitle>
              <CardDescription>Manage your account security</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={profileSettings.username}
                  onChange={(e) => handleProfileChange('username', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={profileSettings.email}
                  onChange={(e) => handleProfileChange('email', e.target.value)}
                />
              </div>
              <Separator />
              <div className="space-y-4">
                <Label className="text-base font-semibold">Change Password</Label>
                <div className="grid gap-4">
                  <Input
                    type="password"
                    placeholder="Current Password"
                    value={profileSettings.currentPassword}
                    onChange={(e) => handleProfileChange('currentPassword', e.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="New Password"
                    value={profileSettings.newPassword}
                    onChange={(e) => handleProfileChange('newPassword', e.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="Confirm New Password"
                    value={profileSettings.confirmPassword}
                    onChange={(e) => handleProfileChange('confirmPassword', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Company Tab */}
        <TabsContent value="company" className="space-y-6">
          {currentUser?.is_master_admin && companyInfo ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-teal-600" />
                  Company Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <Label className="text-xs uppercase text-slate-500">Company Name</Label>
                  <p className="font-bold text-slate-900">{companyInfo.company_name}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <Label className="text-xs uppercase text-slate-500">Company Token</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="bg-white px-2 py-1 rounded border flex-1">{companyInfo.company_token}</code>
                    <Button variant="ghost" size="icon" onClick={() => {
                      navigator.clipboard.writeText(companyInfo.company_token);
                      toast.success("Token copied!");
                    }}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="p-12 text-center text-slate-500">
              Only Master Admins can view company details.
            </div>
          )}
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription" className="space-y-6">
          <Card className="overflow-hidden">
            <div className={`h-2 w-full ${currentUser?.company?.plan === 'premium' ? 'bg-amber-400' : 'bg-slate-300'}`} />
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-teal-600" />
                    Subscription Management
                  </CardTitle>
                  <CardDescription>Manage your plan and billing details</CardDescription>
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm",
                  currentUser?.company?.plan === 'premium' ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"
                )}>
                  {currentUser?.company?.plan || 'Standard'} Plan
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-tight mb-3">Plan Details</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Status</span>
                      <span className={cn(
                        "text-sm font-bold capitalize",
                        currentUser?.company?.subscription_status === 'active' ? "text-green-600" : "text-amber-600"
                      )}>
                        {currentUser?.company?.subscription_status || 'Inactive'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Cycle End</span>
                      <span className="text-sm font-medium">
                        {currentUser?.company?.current_period_end ? new Date(currentUser.company.current_period_end).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                  <h4 className="text-sm font-semibold text-indigo-900 uppercase tracking-tight mb-3">AI Features</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-indigo-700">
                      <CheckCircle2 className={cn("w-4 h-4", currentUser?.company?.plan === 'premium' ? "text-indigo-600" : "text-slate-300")} />
                      AI Inventory Assistant
                    </div>
                    <div className="flex items-center gap-2 text-sm text-indigo-700">
                      <CheckCircle2 className={cn("w-4 h-4", currentUser?.company?.plan === 'premium' ? "text-indigo-600" : "text-slate-300")} />
                      Smart Stock Predictions
                    </div>
                  </div>
                </div>
              </div>

              {currentUser?.company?.plan === 'premium' && (
                <div className="flex flex-wrap gap-4 mt-6 pt-6 border-t border-slate-100">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    onClick={handleSyncSubscription}
                    disabled={isSyncing}
                  >
                    <RefreshCw className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
                    Sync with PayPal
                  </Button>

                  {currentUser?.company?.subscription_status !== 'cancelled' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-500 hover:text-red-600 hover:bg-red-50 flex-1 sm:flex-none"
                      onClick={handleCancelSubscription}
                      disabled={isCancelling}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Cancel Subscription
                    </Button>
                  )}

                  {currentUser?.company?.subscription_status === 'past_due' && (
                    <div className="w-full mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3 text-amber-800 text-sm">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                      <div>
                        <strong>Payment Failed.</strong> You are currently in a grace period. Please update your payment method in PayPal to avoid service interruption.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Billing History Section */}
              {currentUser?.company?.plan === 'premium' && (
                <div className="mt-8">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-4">
                    <History className="w-4 h-4 text-teal-600" />
                    Billing History
                  </h4>
                  <div className="rounded-xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-4 py-3 font-semibold text-slate-600">Date</th>
                          <th className="px-4 py-3 font-semibold text-slate-600">Transaction ID</th>
                          <th className="px-4 py-3 font-semibold text-slate-600">Amount</th>
                          <th className="px-4 py-3 font-semibold text-slate-600 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {isLoadingHistory ? (
                          <tr>
                            <td colSpan="4" className="px-4 py-8 text-center text-slate-400">Loading history...</td>
                          </tr>
                        ) : billingHistory.length === 0 ? (
                          <tr>
                            <td colSpan="4" className="px-4 py-8 text-center text-slate-400">No transactions recorded yet.</td>
                          </tr>
                        ) : (
                          billingHistory.map((pmt) => (
                            <tr key={pmt.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3 text-slate-600">{new Date(pmt.createdAt).toLocaleDateString()}</td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-500 uppercase">{pmt.transaction_id}</td>
                              <td className="px-4 py-3 font-medium text-slate-700">${pmt.amount} {pmt.currency}</td>
                              <td className="px-4 py-3 text-right">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-green-100 text-green-700">
                                  {pmt.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {currentUser?.company?.plan === 'standard' && (
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <div className="bg-gradient-to-br from-indigo-600 to-teal-600 rounded-2xl p-6 text-white relative overflow-hidden shadow-xl">
                    <Star className="absolute top-4 right-4 w-12 h-12 text-white/10 rotate-12" />
                    <div className="relative z-10">
                      <h3 className="text-xl font-bold mb-2">Upgrade to Premium</h3>
                      <p className="text-white/80 text-sm mb-6 max-w-md">
                        Unlock AI features, smart predictions, and prioritized support for your entire company. Just $29.99/month.
                      </p>

                      <PayPalScriptProvider options={{
                        "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID || "test",
                        vault: true,
                        intent: "subscription"
                      }}>
                        <div className="max-w-[280px]">
                          <PayPalButtons
                            style={{ layout: "vertical", label: "subscribe", height: 44, color: 'blue' }}
                            createSubscription={(data, actions) => {
                              return actions.subscription.create({
                                plan_id: import.meta.env.VITE_PAYPAL_PLAN_ID
                              });
                            }}
                            onApprove={(data, actions) => {
                              handleUpgradeSuccess(data.subscriptionID);
                            }}
                          />
                        </div>
                      </PayPalScriptProvider>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Tab */}
        <TabsContent value="system" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-teal-600" />
                Stock Thresholds
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-calculate Thresholds</Label>
                  <p className="text-xs text-slate-500">Automatically set min/max levels</p>
                </div>
                <Switch checked={settings.autoCalculateThresholds} onCheckedChange={(v) => handleChange('autoCalculateThresholds', v)} />
              </div>
              {/* ... other settings ... */}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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