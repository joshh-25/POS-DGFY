import React, { useState, useEffect, useCallback } from 'react';
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
  Plus,
  Trash2,
  MapPin
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import useStore from '../src/store/useStore.js';
import { usePermission } from '../src/hooks/usePermission';
import * as userService from '../src/services/userService.js';
import * as settingsService from '../src/services/settingsService.js';
import * as paymentService from '../src/services/paymentService.js';
import * as tenantLocationService from '../src/services/tenantLocationService.js';
import StoreLocationPickerMap from '../src/components/maps/StoreLocationPickerMap.jsx';
import UserManagementModal from '../Components/users/UserManagementModal.jsx';
import { useSearchParams } from 'react-router-dom';
import { shouldShowMigrateToPayMongoSection } from '../src/utils/subscriptionUi.js';

const ORDER_METHOD_FEE_DEFINITIONS = [
  { key: 'dine_in', label: 'Dine In', defaultFeeLabel: 'Dine In Fee' },
  { key: 'takeout', label: 'Takeout', defaultFeeLabel: 'Takeout Fee' },
  { key: 'delivery', label: 'Delivery', defaultFeeLabel: 'Delivery Fee' },
  { key: 'online', label: 'Online', defaultFeeLabel: 'Online Fee' }
];

const createDefaultOrderMethodFees = () => ORDER_METHOD_FEE_DEFINITIONS.reduce((acc, method) => {
  acc[method.key] = {
    enabled: false,
    amount: 0,
    label: method.defaultFeeLabel
  };
  return acc;
}, {});

const createEmptyStoreLocationForm = () => ({
  location_id: null,
  name: '',
  address_line: '',
  latitude: '',
  longitude: '',
  delivery_radius_km: 5,
  is_open: true,
  is_primary_storefront: true,
  supports_delivery: true,
  supports_pickup: true,
  supports_dine_in: true
});

const mapLocationToForm = (location) => ({
  location_id: location?.location_id ?? null,
  name: String(location?.name || ''),
  address_line: String(location?.address_line || ''),
  latitude: location?.latitude ?? '',
  longitude: location?.longitude ?? '',
  delivery_radius_km: Number(location?.delivery_radius_km ?? 5),
  is_open: location?.is_open !== false,
  is_primary_storefront: location?.is_primary_storefront === true,
  supports_delivery: location?.supports_delivery !== false,
  supports_pickup: location?.supports_pickup !== false,
  supports_dine_in: location?.supports_dine_in !== false
});

const parseCoordinate = (value, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return Number(parsed.toFixed(6));
};

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'profile';

  const [settings, setSettings] = useState({
    defaultMinThreshold: 40,
    defaultPurchaseAllowance: 20,
    lowStockAlertEnabled: true,
    surplusAlertEnabled: true,
    procurementReminderDay: 1,
    qualityThreshold: 3.5,
    autoCalculateThresholds: true,
    posBusinessName: '',
    posTinBranch: '',
    posAddress: '',
    posPtuNumber: '',
    posMinNumber: '',
    posAccreditationNumber: '',
    posStrictComplianceEnabled: false,
    posReceiptFooterMessage: '',
    posDiscountProfiles: [],
    posOrderMethodFees: createDefaultOrderMethodFees(),
    posPettyCashSymbol: 'PHP',
    posPettyCashAmount: 0
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
  const canEditSettings = can('settings:edit');

  const [isCancelling, setIsCancelling] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [billingHistory, setBillingHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isChangingPlan, setIsChangingPlan] = useState(false);
  const [isMigratingToPayMongo, setIsMigratingToPayMongo] = useState(false);
  const [paymongoSubscriptionIdInput, setPaymongoSubscriptionIdInput] = useState('');
  const [isStartingPayMongoSetup, setIsStartingPayMongoSetup] = useState(false);
  const [pendingPlanInfo, setPendingPlanInfo] = useState(null);
  const [storeLocations, setStoreLocations] = useState([]);
  const [selectedStoreLocationId, setSelectedStoreLocationId] = useState('new');
  const [storeLocationForm, setStoreLocationForm] = useState(createEmptyStoreLocationForm);
  const [loadingStoreLocations, setLoadingStoreLocations] = useState(false);
  const [savingStoreLocation, setSavingStoreLocation] = useState(false);

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
          autoCalculateThresholds: systemSettings.enable_auto_reorder?.value ?? true,
          posBusinessName: systemSettings.pos_business_name?.value || '',
          posTinBranch: systemSettings.pos_tin_branch?.value || '',
          posAddress: systemSettings.pos_address?.value || '',
          posPtuNumber: systemSettings.pos_ptu_number?.value || '',
          posMinNumber: systemSettings.pos_min_number?.value || '',
          posAccreditationNumber: systemSettings.pos_accreditation_number?.value || '',
          posStrictComplianceEnabled: systemSettings.pos_strict_compliance_enabled?.value ?? false,
          posReceiptFooterMessage: systemSettings.pos_receipt_footer_message?.value || '',
          posDiscountProfiles: normalizeDiscountProfiles(systemSettings.pos_discount_profiles?.value),
          posOrderMethodFees: normalizeOrderMethodFees(systemSettings.pos_order_method_fees?.value),
          posPettyCashSymbol: systemSettings.pos_petty_cash_symbol?.value || 'PHP',
          posPettyCashAmount: Number(systemSettings.pos_petty_cash_amount?.value ?? 0) || 0
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

  // Fetch billing data when tab changes to subscription
  useEffect(() => {
    if (currentTab === 'subscription') {
      fetchBillingHistory();
      fetchPendingPlan();
    }
  }, [currentTab]);

  const fetchPendingPlan = async () => {
    try {
      const data = await paymentService.getPendingPlan();
      setPendingPlanInfo(data);
    } catch {
      // silently ignore — unauthenticated or no pending plan
    }
  };

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

  const sanitizeDiscountProfile = (profile) => ({
    name: String(profile?.name || '').trim(),
    percentage: Number(profile?.percentage ?? 0),
    active: profile?.active !== false
  });

  const normalizeDiscountProfiles = (rawProfiles) => {
    let parsed = rawProfiles;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = [];
      }
    }

    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeDiscountProfile);
  };

  const normalizeOrderMethodFees = (rawFees) => {
    let parsed = rawFees;
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        parsed = {};
      }
    }

    const defaults = createDefaultOrderMethodFees();
    if (!parsed || typeof parsed !== 'object') return defaults;

    ORDER_METHOD_FEE_DEFINITIONS.forEach((method) => {
      const entry = parsed?.[method.key];
      if (!entry || typeof entry !== 'object') return;
      const amount = Number(entry.amount);
      defaults[method.key] = {
        enabled: entry.enabled === true || entry.enabled === 'true' || entry.enabled === 1 || entry.enabled === '1',
        amount: Number.isFinite(amount) ? Math.max(0, amount) : 0,
        label: String(entry.label || '').trim() || method.defaultFeeLabel
      };
    });

    return defaults;
  };

  const handleOrderMethodFeeChange = (methodKey, key, value) => {
    setSettings((prev) => {
      const nextFees = normalizeOrderMethodFees(prev.posOrderMethodFees);
      const current = nextFees[methodKey] || { enabled: false, amount: 0, label: '' };
      nextFees[methodKey] = {
        ...current,
        [key]: key === 'amount' ? Number(value) : value
      };
      return { ...prev, posOrderMethodFees: nextFees };
    });
  };

  const handleDiscountProfileChange = (index, key, value) => {
    setSettings((prev) => {
      const nextProfiles = Array.isArray(prev.posDiscountProfiles)
        ? [...prev.posDiscountProfiles]
        : [];
      const existing = nextProfiles[index] || { name: '', percentage: 0, active: true };
      nextProfiles[index] = {
        ...existing,
        [key]: key === 'percentage' ? Number(value) : value
      };
      return { ...prev, posDiscountProfiles: nextProfiles };
    });
  };

  const addDiscountProfile = () => {
    setSettings((prev) => ({
      ...prev,
      posDiscountProfiles: [
        ...(Array.isArray(prev.posDiscountProfiles) ? prev.posDiscountProfiles : []),
        { name: '', percentage: 0, active: true }
      ]
    }));
  };

  const removeDiscountProfile = (index) => {
    setSettings((prev) => ({
      ...prev,
      posDiscountProfiles: (Array.isArray(prev.posDiscountProfiles) ? prev.posDiscountProfiles : [])
        .filter((_, idx) => idx !== index)
    }));
  };

  const handleProfileChange = (key, value) => {
    setProfileSettings(prev => ({ ...prev, [key]: value }));
    // Clear error for this field
    setProfileErrors(prev => ({ ...prev, [key]: '' }));
  };

  const loadStoreLocations = useCallback(async () => {
    setLoadingStoreLocations(true);
    try {
      const rows = await tenantLocationService.listTenantLocations({ include_inactive: true });
      const normalized = Array.isArray(rows) ? rows : [];
      setStoreLocations(normalized);

      const active = normalized.filter((row) => row?.is_active !== false);
      const preferred = active.find((row) => row?.is_primary_storefront === true) || active[0] || null;
      if (preferred) {
        setSelectedStoreLocationId(String(preferred.location_id));
        setStoreLocationForm(mapLocationToForm(preferred));
      } else {
        setSelectedStoreLocationId('new');
        setStoreLocationForm(createEmptyStoreLocationForm());
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load store locations');
      setStoreLocations([]);
    } finally {
      setLoadingStoreLocations(false);
    }
  }, []);

  useEffect(() => {
    if (currentTab === 'pos') {
      loadStoreLocations();
    }
  }, [currentTab, loadStoreLocations]);

  const handleStoreLocationSelection = (value) => {
    setSelectedStoreLocationId(value);
    if (value === 'new') {
      setStoreLocationForm(createEmptyStoreLocationForm());
      return;
    }

    const selected = storeLocations.find((row) => String(row?.location_id) === String(value));
    if (selected) {
      setStoreLocationForm(mapLocationToForm(selected));
    }
  };

  const handleStoreLocationFormChange = (key, value) => {
    setStoreLocationForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleStoreLocationMapChange = useCallback(({ latitude, longitude }) => {
    setStoreLocationForm((prev) => ({
      ...prev,
      latitude,
      longitude
    }));
  }, []);

  const handleSaveStoreLocation = async () => {
    if (!canEditSettings) {
      toast.error('You do not have permission to edit store locations.');
      return;
    }

    const payload = {
      name: String(storeLocationForm.name || '').trim(),
      address_line: String(storeLocationForm.address_line || '').trim(),
      latitude: Number(storeLocationForm.latitude),
      longitude: Number(storeLocationForm.longitude),
      delivery_radius_km: Number(storeLocationForm.delivery_radius_km || 0),
      is_open: Boolean(storeLocationForm.is_open),
      is_active: true,
      is_primary_storefront: Boolean(storeLocationForm.is_primary_storefront),
      supports_delivery: Boolean(storeLocationForm.supports_delivery),
      supports_pickup: Boolean(storeLocationForm.supports_pickup),
      supports_dine_in: Boolean(storeLocationForm.supports_dine_in)
    };

    if (!payload.name) {
      toast.error('Store location name is required.');
      return;
    }
    if (!payload.address_line) {
      toast.error('Store location address is required.');
      return;
    }
    if (!Number.isFinite(payload.latitude) || payload.latitude < -90 || payload.latitude > 90) {
      toast.error('Latitude must be between -90 and 90.');
      return;
    }
    if (!Number.isFinite(payload.longitude) || payload.longitude < -180 || payload.longitude > 180) {
      toast.error('Longitude must be between -180 and 180.');
      return;
    }
    if (!Number.isFinite(payload.delivery_radius_km) || payload.delivery_radius_km < 0 || payload.delivery_radius_km > 100) {
      toast.error('Delivery radius must be between 0 and 100 km.');
      return;
    }

    setSavingStoreLocation(true);
    try {
      if (selectedStoreLocationId === 'new') {
        await tenantLocationService.createTenantLocation(payload);
        toast.success('Store location created.');
      } else {
        await tenantLocationService.updateTenantLocation(selectedStoreLocationId, payload);
        toast.success('Store location updated.');
      }
      await loadStoreLocations();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save store location');
    } finally {
      setSavingStoreLocation(false);
    }
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

      const posDiscountProfiles = (Array.isArray(settings.posDiscountProfiles) ? settings.posDiscountProfiles : [])
        .map(sanitizeDiscountProfile)
        .filter((profile) => profile.name.length > 0);

      const normalizedNames = new Set();
      for (const profile of posDiscountProfiles) {
        const normalizedName = profile.name.toLowerCase();
        if (normalizedNames.has(normalizedName)) {
          toast.error(`Duplicate POS discount name: ${profile.name}`);
          return;
        }
        normalizedNames.add(normalizedName);
      }

      const posOrderMethodFees = normalizeOrderMethodFees(settings.posOrderMethodFees);

      // Save threshold settings to backend
      await settingsService.updateSettings({
        enable_auto_reorder: settings.autoCalculateThresholds,
        min_stock_threshold_percent: settings.defaultMinThreshold,
        purchase_allowance_percent: settings.defaultPurchaseAllowance,
        pos_business_name: settings.posBusinessName,
        pos_tin_branch: settings.posTinBranch,
        pos_address: settings.posAddress,
        pos_ptu_number: settings.posPtuNumber,
        pos_min_number: settings.posMinNumber,
        pos_accreditation_number: settings.posAccreditationNumber,
        pos_strict_compliance_enabled: settings.posStrictComplianceEnabled,
        pos_receipt_footer_message: settings.posReceiptFooterMessage,
        pos_discount_profiles: posDiscountProfiles,
        pos_order_method_fees: posOrderMethodFees,
        pos_petty_cash_symbol: settings.posPettyCashSymbol,
        pos_petty_cash_amount: Number(settings.posPettyCashAmount || 0)
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
      autoCalculateThresholds: true,
      posBusinessName: '',
      posTinBranch: '',
      posAddress: '',
      posPtuNumber: '',
      posMinNumber: '',
      posAccreditationNumber: '',
      posStrictComplianceEnabled: false,
      posReceiptFooterMessage: '',
      posDiscountProfiles: [],
      posOrderMethodFees: createDefaultOrderMethodFees(),
      posPettyCashSymbol: 'PHP',
      posPettyCashAmount: 0
    });
    toast.success("Settings reset to defaults");
  };

  const handleSetupPayMongoRecurring = async () => {
    setIsStartingPayMongoSetup(true);
    try {
      const result = await paymentService.setupPayMongoRecurring();
      if (result?.checkoutLink) {
        window.open(result.checkoutLink, '_blank', 'noopener,noreferrer');
        toast.success('PayMongo checkout link opened in a new tab. Complete setup to activate recurring billing.');
      } else {
        toast.success('PayMongo recurring setup initiated.');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start PayMongo setup.');
    } finally {
      setIsStartingPayMongoSetup(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm("Are you sure you want to cancel your Premium subscription? You will retain access until the end of your current billing period.")) {
      return;
    }

    setIsCancelling(true);
    try {
      const result = await paymentService.cancelPayMongoSubscription('User initiated cancellation from settings');
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
      const result = await paymentService.syncPayMongoSubscription();
      const updatedUser = await userService.getCurrentUser();
      setCurrentUser(updatedUser);
      toast.success("Subscription status updated from PayMongo.");
      fetchBillingHistory();
    } catch (err) {
      toast.error("Failed to sync status. Please try again later.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleChangePlan = async (newPlan) => {
    setIsChangingPlan(true);
    try {
      const result = await paymentService.changePayMongoPlan(newPlan);
      const updatedUser = await userService.getCurrentUser();
      setCurrentUser(updatedUser);
      toast.success(result?.effective_immediately
        ? `Plan changed to ${newPlan} successfully.`
        : `Plan change to ${newPlan} was scheduled successfully.`);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to change plan.");
    } finally {
      setIsChangingPlan(false);
    }
  };

  const handleMigrateToPayMongo = async (subscriptionId) => {
    setIsMigratingToPayMongo(true);
    try {
      await paymentService.migrateToPayMongo(subscriptionId);
      const updatedUser = await userService.getCurrentUser();
      setCurrentUser(updatedUser);
      setPaymongoSubscriptionIdInput('');
      toast.success("PayMongo subscription linked successfully.");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to link PayMongo subscription.");
    } finally {
      setIsMigratingToPayMongo(false);
    }
  };

  const parsedLatitude = parseCoordinate(storeLocationForm.latitude, -90, 90);
  const parsedLongitude = parseCoordinate(storeLocationForm.longitude, -180, 180);

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
        <TabsList className="grid w-full grid-cols-5 lg:w-[760px] mb-8">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="pos">POS Setup</TabsTrigger>
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
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-teal-600" />
                    Company Details
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setShowUserManagement(true)}>
                    <Users className="w-4 h-4 mr-2" />
                    Manage Users
                  </Button>
                </div>
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
                <div className="p-3 bg-teal-50 rounded-lg border border-teal-100">
                  <Label className="text-xs uppercase text-teal-600">Company Join Link</Label>
                  <p className="text-xs text-slate-500 mt-0.5 mb-2">Share this link with new team members — the company token is pre-filled.</p>
                  <div className="flex items-center gap-2">
                    <code className="bg-white px-2 py-1 rounded border flex-1 text-xs truncate">
                      {`${window.location.origin}/register?token=${companyInfo.company_token}`}
                    </code>
                    <Button variant="ghost" size="icon" onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/register?token=${companyInfo.company_token}`);
                      toast.success("Invite link copied!");
                    }}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-slate-500 mb-4">
                  View company details and manage team members.
                </div>
                {currentUser?.role === 'admin' && (
                  <Button onClick={() => setShowUserManagement(true)} className="w-full sm:w-auto">
                    <Users className="w-4 h-4 mr-2" />
                    Manage Users
                  </Button>
                )}
              </CardContent>
            </Card>
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

              {/* Pending plan change notice */}
              {pendingPlanInfo?.pending_plan && (
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-start gap-3 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold text-indigo-800">Plan change pending: </span>
                    <span className="text-indigo-700 capitalize">{pendingPlanInfo.pending_plan}</span>
                    {pendingPlanInfo.pending_plan_approved
                      ? ' — approved, will apply on next billing cycle.'
                      : ' — awaiting provider approval.'}
                  </div>
                </div>
              )}

              {/* PayMongo tenant actions */}
              {currentUser?.company?.payment_method === 'paymongo' && (
                <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-slate-100">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSyncSubscription}
                    disabled={isSyncing}
                  >
                    <RefreshCw className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
                    Sync with PayMongo
                  </Button>

                  {currentUser?.company?.plan === 'standard' && !pendingPlanInfo?.pending_plan && (
                    <Button
                      size="sm"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white"
                      onClick={() => handleChangePlan('premium')}
                      disabled={isChangingPlan}
                    >
                      {isChangingPlan ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Star className="w-4 h-4 mr-2" />}
                      Upgrade to Premium
                    </Button>
                  )}

                  {currentUser?.company?.plan === 'premium' && !pendingPlanInfo?.pending_plan && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-slate-600"
                      onClick={() => handleChangePlan('standard')}
                      disabled={isChangingPlan}
                    >
                      {isChangingPlan ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Downgrade to Standard
                    </Button>
                  )}

                  {currentUser?.company?.subscription_status !== 'cancelled' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-500 hover:text-red-600 hover:bg-red-50 ml-auto"
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
                        <strong>Payment Failed.</strong> Update your payment method to avoid service interruption.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Migrate to PayMongo (manual tenants, master admin only) */}
              {shouldShowMigrateToPayMongoSection({
                company: currentUser?.company,
                isMasterAdmin: currentUser?.is_master_admin
              }) && (
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Link PayMongo Subscription</h4>
                  <p className="text-xs text-slate-500 mb-3">
                    Enter an existing PayMongo subscription ID to enable automatic renewals for your current plan.
                  </p>
                  {isMigratingToPayMongo ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Linking subscription...
                    </div>
                  ) : (
                    <div className="max-w-md space-y-3">
                      <Input
                        placeholder="PayMongo subscription ID"
                        value={paymongoSubscriptionIdInput}
                        onChange={(e) => setPaymongoSubscriptionIdInput(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleMigrateToPayMongo(paymongoSubscriptionIdInput)}
                          disabled={!paymongoSubscriptionIdInput.trim()}
                          className="bg-teal-600 hover:bg-teal-700"
                        >
                          <LinkIcon className="w-4 h-4 mr-2" />
                          Link Subscription
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleSetupPayMongoRecurring}
                          disabled={isStartingPayMongoSetup}
                        >
                          {isStartingPayMongoSetup ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                          Start Checkout
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Billing History Section */}
              {currentUser?.company?.payment_method === 'paymongo' && (
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

              {currentUser?.company?.plan === 'standard' && currentUser?.company?.payment_method !== 'paymongo' && (
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <div className="bg-gradient-to-br from-indigo-600 to-teal-600 rounded-2xl p-6 text-white relative overflow-hidden shadow-xl">
                    <Star className="absolute top-4 right-4 w-12 h-12 text-white/10 rotate-12" />
                    <div className="relative z-10">
                      <h3 className="text-xl font-bold mb-2">Upgrade to Premium</h3>
                      <p className="text-white/80 text-sm mb-6 max-w-md">
                        Unlock AI features, smart predictions, and prioritized support for your entire company. Just ₱3,000/month.
                      </p>

                      <div className="max-w-[320px]">
                        <Button
                          className="bg-white text-indigo-700 hover:bg-slate-100"
                          onClick={handleSetupPayMongoRecurring}
                          disabled={isStartingPayMongoSetup}
                        >
                          {isStartingPayMongoSetup ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Star className="w-4 h-4 mr-2" />}
                          Open PayMongo Checkout
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Tab */}
        <TabsContent value="pos" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-teal-600" />
                POS Setup & Receipt Metadata
              </CardTitle>
              <CardDescription>
                Configure business and compliance header details shown on digital receipts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Business Name</Label>
                  <Input
                    value={settings.posBusinessName}
                    onChange={(e) => handleChange('posBusinessName', e.target.value)}
                    placeholder="Registered business name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>TIN / Branch</Label>
                  <Input
                    value={settings.posTinBranch}
                    onChange={(e) => handleChange('posTinBranch', e.target.value)}
                    placeholder="e.g. 123-456-789-000"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Business Address</Label>
                  <Input
                    value={settings.posAddress}
                    onChange={(e) => handleChange('posAddress', e.target.value)}
                    placeholder="Complete branch/business address"
                  />
                </div>
                <div className="space-y-2">
                  <Label>PTU Number</Label>
                  <Input
                    value={settings.posPtuNumber}
                    onChange={(e) => handleChange('posPtuNumber', e.target.value)}
                    placeholder="Permit to Use reference"
                  />
                </div>
                <div className="space-y-2">
                  <Label>MIN Number</Label>
                  <Input
                    value={settings.posMinNumber}
                    onChange={(e) => handleChange('posMinNumber', e.target.value)}
                    placeholder="Machine Identification Number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Accreditation Number</Label>
                  <Input
                    value={settings.posAccreditationNumber}
                    onChange={(e) => handleChange('posAccreditationNumber', e.target.value)}
                    placeholder="BIR accreditation reference"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Strict POS Compliance Blocking</Label>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-600">Block POS checkout when required compliance fields are incomplete</span>
                    <Switch
                      checked={settings.posStrictComplianceEnabled}
                      onCheckedChange={(v) => handleChange('posStrictComplianceEnabled', v)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Receipt Footer Message</Label>
                  <Input
                    value={settings.posReceiptFooterMessage}
                    onChange={(e) => handleChange('posReceiptFooterMessage', e.target.value)}
                    placeholder="Optional receipt footer"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Petty Cash Currency Symbol</Label>
                  <Input
                    value={settings.posPettyCashSymbol}
                    onChange={(e) => handleChange('posPettyCashSymbol', e.target.value)}
                    placeholder="e.g. PHP"
                    maxLength={12}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Petty Cash Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={settings.posPettyCashAmount}
                    onChange={(e) => handleChange('posPettyCashAmount', e.target.value)}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-slate-500">
                    Used for cashier reconciliation and daily closeout context. Not counted as sales.
                  </p>
                </div>
                <div className="space-y-3 md:col-span-2">
                  <Label>Order Method Fees</Label>
                  <p className="text-xs text-slate-500">
                    Configure additive service fees by order method. These are non-VAT fees and are applied after item discounts.
                  </p>
                  <div className="space-y-2">
                    {ORDER_METHOD_FEE_DEFINITIONS.map((method) => {
                      const feeEntry = normalizeOrderMethodFees(settings.posOrderMethodFees)?.[method.key] || {
                        enabled: false,
                        amount: 0,
                        label: method.defaultFeeLabel
                      };

                      return (
                        <div
                          key={`order-method-fee-${method.key}`}
                          className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-slate-200 rounded-lg p-3"
                        >
                          <div className="md:col-span-3 space-y-1">
                            <Label className="text-xs text-slate-500">{method.label}</Label>
                            <div className="h-10 flex items-center px-2 border border-slate-200 rounded-lg">
                              <Switch
                                checked={feeEntry.enabled === true}
                                onCheckedChange={(checked) => handleOrderMethodFeeChange(method.key, 'enabled', checked)}
                              />
                            </div>
                          </div>
                          <div className="md:col-span-4 space-y-1">
                            <Label className="text-xs text-slate-500">Fee Amount (PHP)</Label>
                            <Input
                              type="number"
                              min="0"
                              step="0.0001"
                              value={feeEntry.amount}
                              onChange={(e) => handleOrderMethodFeeChange(method.key, 'amount', e.target.value)}
                              disabled={!feeEntry.enabled}
                            />
                          </div>
                          <div className="md:col-span-5 space-y-1">
                            <Label className="text-xs text-slate-500">Fee Label</Label>
                            <Input
                              value={feeEntry.label}
                              onChange={(e) => handleOrderMethodFeeChange(method.key, 'label', e.target.value)}
                              placeholder={method.defaultFeeLabel}
                              disabled={!feeEntry.enabled}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-3 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label>POS Discount Presets (Percentage)</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addDiscountProfile}>
                      <Plus className="w-4 h-4 mr-1" />
                      Add Discount
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Example: Employee Discount at 20%. Cashiers can select these at checkout.
                  </p>
                  <div className="space-y-2">
                    {(Array.isArray(settings.posDiscountProfiles) ? settings.posDiscountProfiles : []).map((profile, index) => (
                      <div
                        key={`discount-profile-${index}`}
                        className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-slate-200 rounded-lg p-3"
                      >
                        <div className="md:col-span-6 space-y-1">
                          <Label className="text-xs text-slate-500">Discount Name</Label>
                          <Input
                            value={profile.name}
                            onChange={(e) => handleDiscountProfileChange(index, 'name', e.target.value)}
                            placeholder="e.g. Employee Discount"
                          />
                        </div>
                        <div className="md:col-span-3 space-y-1">
                          <Label className="text-xs text-slate-500">Percent</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={profile.percentage}
                            onChange={(e) => handleDiscountProfileChange(index, 'percentage', e.target.value)}
                          />
                        </div>
                        <div className="md:col-span-2 space-y-1">
                          <Label className="text-xs text-slate-500">Active</Label>
                          <div className="h-10 flex items-center px-2 border border-slate-200 rounded-lg">
                            <Switch
                              checked={profile.active !== false}
                              onCheckedChange={(checked) => handleDiscountProfileChange(index, 'active', checked)}
                            />
                          </div>
                        </div>
                        <div className="md:col-span-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => removeDiscountProfile(index)}
                            aria-label={`Remove discount profile ${index + 1}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {(Array.isArray(settings.posDiscountProfiles) ? settings.posDiscountProfiles : []).length === 0 && (
                      <p className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-3">
                        No discount presets configured yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-teal-600" />
                Store Location (Storefront)
              </CardTitle>
              <CardDescription>
                Set the branch address and coordinates used by storefront discovery, tenant store routing, and delivery scope.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="flex-1 space-y-2">
                  <Label>Location Record</Label>
                  <select
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={selectedStoreLocationId}
                    onChange={(e) => handleStoreLocationSelection(e.target.value)}
                    disabled={loadingStoreLocations}
                  >
                    <option value="new">Create New Location</option>
                    {storeLocations
                      .filter((location) => location?.is_active !== false)
                      .map((location) => (
                        <option key={location.location_id} value={String(location.location_id)}>
                          {location.name}{location.is_primary_storefront ? ' (Primary)' : ''}
                        </option>
                      ))}
                  </select>
                </div>
                <Button type="button" variant="outline" onClick={loadStoreLocations} disabled={loadingStoreLocations}>
                  <RefreshCw className={cn('mr-2 h-4 w-4', loadingStoreLocations && 'animate-spin')} />
                  Refresh
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Store Name</Label>
                  <Input
                    value={storeLocationForm.name}
                    onChange={(e) => handleStoreLocationFormChange('name', e.target.value)}
                    placeholder="e.g. Main Branch"
                    disabled={!canEditSettings}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Store Address</Label>
                  <Input
                    value={storeLocationForm.address_line}
                    onChange={(e) => handleStoreLocationFormChange('address_line', e.target.value)}
                    placeholder="Complete customer-facing address"
                    disabled={!canEditSettings}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>OpenStreetMap Location Picker</Label>
                  <StoreLocationPickerMap
                    latitude={parsedLatitude}
                    longitude={parsedLongitude}
                    deliveryRadiusKm={storeLocationForm.delivery_radius_km}
                    onCoordinatesChange={handleStoreLocationMapChange}
                    disabled={!canEditSettings}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Latitude</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    min="-90"
                    max="90"
                    value={storeLocationForm.latitude}
                    onChange={(e) => handleStoreLocationFormChange('latitude', e.target.value)}
                    placeholder="e.g. 14.5995"
                    disabled={!canEditSettings}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Longitude</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    min="-180"
                    max="180"
                    value={storeLocationForm.longitude}
                    onChange={(e) => handleStoreLocationFormChange('longitude', e.target.value)}
                    placeholder="e.g. 120.9842"
                    disabled={!canEditSettings}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Delivery Radius (km)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={storeLocationForm.delivery_radius_km}
                    onChange={(e) => handleStoreLocationFormChange('delivery_radius_km', e.target.value)}
                    disabled={!canEditSettings}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Primary Storefront Location</Label>
                  <div className="flex h-10 items-center justify-between rounded-lg border border-slate-200 px-3">
                    <span className="text-sm text-slate-600">Use this branch as the primary storefront</span>
                    <Switch
                      checked={storeLocationForm.is_primary_storefront === true}
                      onCheckedChange={(checked) => handleStoreLocationFormChange('is_primary_storefront', checked)}
                      disabled={!canEditSettings}
                    />
                  </div>
                </div>
              </div>

              {!canEditSettings && (
                <p className="text-xs text-amber-700">
                  You currently have view-only access. Ask an admin with <code>settings:edit</code> permission to update store location.
                </p>
              )}

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleSaveStoreLocation}
                  disabled={!canEditSettings || savingStoreLocation || loadingStoreLocations}
                  className="bg-teal-600 hover:bg-teal-700"
                >
                  {savingStoreLocation ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Store Location
                </Button>
              </div>
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
              <div className="flex items-center justify-between">
                <div>
                  <Label>Low Stock Alerts</Label>
                  <p className="text-xs text-slate-500">Get notified when items fall below threshold</p>
                </div>
                <Switch
                  checked={settings.lowStockAlertEnabled}
                  onCheckedChange={(v) => handleChange('lowStockAlertEnabled', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Surplus & Expiry Alerts</Label>
                  <p className="text-xs text-slate-500">Warnings for overstock and expiring items</p>
                </div>
                <Switch
                  checked={settings.surplusAlertEnabled}
                  onCheckedChange={(v) => handleChange('surplusAlertEnabled', v)}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-900">Inventory Thresholds</h3>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <Label>Minimum Stock Level ({settings.defaultMinThreshold}%)</Label>
                    <span className="text-xs text-slate-500">Triggers reorder suggestions</span>
                  </div>
                  <div className="flex gap-4 items-center">
                    <Slider
                      value={[settings.defaultMinThreshold]}
                      min={5}
                      max={90}
                      step={5}
                      onValueChange={([v]) => handleChange('defaultMinThreshold', v)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={settings.defaultMinThreshold}
                      onChange={(e) => handleChange('defaultMinThreshold', parseInt(e.target.value) || 0)}
                      className="w-16 h-8 text-center"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <Label>Purchase Allowance ({settings.defaultPurchaseAllowance}%)</Label>
                    <span className="text-xs text-slate-500">Extra stock to order above min</span>
                  </div>
                  <div className="flex gap-4 items-center">
                    <Slider
                      value={[settings.defaultPurchaseAllowance]}
                      min={0}
                      max={100}
                      step={5}
                      onValueChange={([v]) => handleChange('defaultPurchaseAllowance', v)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={settings.defaultPurchaseAllowance}
                      onChange={(e) => handleChange('defaultPurchaseAllowance', parseInt(e.target.value) || 0)}
                      className="w-16 h-8 text-center"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Procurement Reminder (Hours)</Label>
                  <p className="text-xs text-slate-500 mb-2">How often to check for reorders</p>
                  <Input
                    type="number"
                    value={settings.procurementReminderDay}
                    onChange={(e) => handleChange('procurementReminderDay', parseInt(e.target.value) || 24)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Supplier Quality Standard ({settings.qualityThreshold})</Label>
                  <p className="text-xs text-slate-500 mb-2">Minimum rating for auto-approval</p>
                  <div className="pt-2">
                    <Slider
                      value={[settings.qualityThreshold]}
                      min={1}
                      max={5}
                      step={0.1}
                      onValueChange={([v]) => handleChange('qualityThreshold', v)}
                    />
                  </div>
                </div>
              </div>
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
