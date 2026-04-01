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
  Plus,
  Trash2
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
import UserManagementModal from '../Components/users/UserManagementModal.jsx';
import OpenStreetMapPinPicker from '../src/components/maps/OpenStreetMapPinPicker.jsx';
import { useSearchParams } from 'react-router-dom';
import { shouldShowMigrateToPayMongoSection } from '../src/utils/subscriptionUi.js';

const ORDER_METHOD_FEE_DEFINITIONS = [
  { key: 'dine_in', label: 'Dine In', defaultFeeLabel: 'Dine In Fee' },
  { key: 'takeout', label: 'Takeout', defaultFeeLabel: 'Takeout Fee' },
  { key: 'pickup', label: 'Pickup', defaultFeeLabel: 'Pickup Fee' },
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

const SETTINGS_FIELD_LABELS = {
  username: 'Username',
  email: 'Email',
  currentPassword: 'Current Password',
  newPassword: 'New Password',
  confirmPassword: 'Confirm Password',
  pos_business_name: 'Business Name',
  pos_tin_branch: 'TIN / Branch',
  pos_address: 'Business Address',
  pos_ptu_number: 'PTU Number',
  pos_min_number: 'MIN Number',
  pos_accreditation_number: 'Accreditation Number',
  pos_receipt_footer_message: 'Receipt Footer Message',
  pos_petty_cash_symbol: 'Petty Cash Currency Symbol',
  pos_petty_cash_amount: 'Petty Cash Amount',
  store_delivery_fee: 'Store Delivery Fee',
  store_tenant_slug: 'Store Slug',
  pos_wait_time_minutes: 'POS Wait Time'
};

const getReadableFieldName = (field) => SETTINGS_FIELD_LABELS[field] || field;

const formatValidationErrorDescription = (apiErrors) => {
  if (!Array.isArray(apiErrors) || apiErrors.length === 0) {
    return '';
  }

  return apiErrors
    .slice(0, 5)
    .map((err) => `${getReadableFieldName(err.field)}: ${err.message}`)
    .join(' | ');
};

const createDefaultLocationForm = () => ({
  name: '',
  address_line: '',
  latitude: '10.7202',
  longitude: '122.5621',
  location_version: '',
  delivery_radius_km: '5',
  current_wait_time_minutes: '15',
  is_open: true,
  is_active: true,
  is_primary_storefront: false,
  allow_out_of_stock_sales: false,
  supports_delivery: true,
  supports_pickup: true,
  supports_dine_in: true
});

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
    posPettyCashAmount: 0,
    storeDeliveryFee: 0,
    storeTenantSlug: '',
    storeIsVisible: true,
    posOpenStatus: true,
    posWaitTimeMinutes: 15
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

  const [isCancelling, setIsCancelling] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [billingHistory, setBillingHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isChangingPlan, setIsChangingPlan] = useState(false);
  const [isMigratingToPayMongo, setIsMigratingToPayMongo] = useState(false);
  const [paymongoSubscriptionIdInput, setPaymongoSubscriptionIdInput] = useState('');
  const [isStartingPayMongoSetup, setIsStartingPayMongoSetup] = useState(false);
  const [pendingPlanInfo, setPendingPlanInfo] = useState(null);
  const [tenantLocations, setTenantLocations] = useState([]);
  const [storefrontSyncHealth, setStorefrontSyncHealth] = useState(null);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationSaving, setLocationSaving] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [locationForm, setLocationForm] = useState(createDefaultLocationForm());

  const loadTenantLocations = async ({ silent = false } = {}) => {
    if (!silent) {
      setLocationsLoading(true);
    }
    try {
      const result = await tenantLocationService.listTenantLocationsWithMeta({ include_inactive: true });
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      setTenantLocations(rows);
      setStorefrontSyncHealth(result?.meta?.storefront_sync_health || null);
    } catch (error) {
      if (!silent) {
        toast.error(error?.response?.data?.message || 'Failed to load tenant locations');
      }
    } finally {
      if (!silent) {
        setLocationsLoading(false);
      }
    }
  };

  const resetLocationForm = () => {
    setEditingLocationId(null);
    setLocationForm(createDefaultLocationForm());
  };

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
          posPettyCashAmount: Number(systemSettings.pos_petty_cash_amount?.value ?? 0) || 0,
          storeDeliveryFee: Number(systemSettings.store_delivery_fee?.value ?? 0) || 0,
          storeTenantSlug: String(systemSettings.store_tenant_slug?.value || ''),
          storeIsVisible: systemSettings.store_is_visible?.value ?? true,
          posOpenStatus: systemSettings.pos_open_status?.value ?? true,
          posWaitTimeMinutes: Number(systemSettings.pos_wait_time_minutes?.value ?? 15) || 15
        });

        await loadTenantLocations({ silent: true });

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

  const handleLocationFormChange = (key, value) => {
    setLocationForm((prev) => {
      if (key === 'is_active' && value === false) {
        return {
          ...prev,
          is_active: false,
          is_primary_storefront: false
        };
      }
      return { ...prev, [key]: value };
    });
  };

  const handleLocationPinChange = ({ latitude, longitude }) => {
    setLocationForm((prev) => ({
      ...prev,
      latitude: latitude == null ? '' : String(latitude),
      longitude: longitude == null ? '' : String(longitude)
    }));
  };

  const handleEditLocation = (location) => {
    setEditingLocationId(location?.location_id || null);
    setLocationForm({
      name: String(location?.name || ''),
      address_line: String(location?.address_line || ''),
      latitude: location?.latitude == null ? '' : String(location.latitude),
      longitude: location?.longitude == null ? '' : String(location.longitude),
      location_version: String(location?.updated_at || ''),
      delivery_radius_km: location?.delivery_radius_km == null ? '5' : String(location.delivery_radius_km),
      current_wait_time_minutes: location?.current_wait_time_minutes == null ? '15' : String(location.current_wait_time_minutes),
      is_open: location?.is_open !== false,
      is_active: location?.is_active !== false,
      is_primary_storefront: location?.is_primary_storefront === true,
      allow_out_of_stock_sales: location?.allow_out_of_stock_sales === true,
      supports_delivery: location?.supports_delivery !== false,
      supports_pickup: location?.supports_pickup !== false,
      supports_dine_in: location?.supports_dine_in !== false
    });
  };

  const handleSaveLocation = async () => {
    const payload = {
      name: String(locationForm.name || '').trim(),
      address_line: String(locationForm.address_line || '').trim(),
      latitude: Number(locationForm.latitude),
      longitude: Number(locationForm.longitude),
      delivery_radius_km: Number(locationForm.delivery_radius_km || 0),
      current_wait_time_minutes: Number(locationForm.current_wait_time_minutes || 0),
      is_open: locationForm.is_open === true,
      is_active: locationForm.is_active !== false,
      is_primary_storefront: locationForm.is_primary_storefront === true,
      allow_out_of_stock_sales: locationForm.allow_out_of_stock_sales === true,
      supports_delivery: locationForm.supports_delivery !== false,
      supports_pickup: locationForm.supports_pickup !== false,
      supports_dine_in: locationForm.supports_dine_in !== false
    };
    if (editingLocationId && locationForm.location_version) {
      payload.last_known_updated_at = locationForm.location_version;
    }

    if (!payload.name || !payload.address_line) {
      toast.error('Location name and address are required.');
      return;
    }

    if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
      toast.error('Please pin the location on the map.');
      return;
    }

    setLocationSaving(true);
    try {
      if (editingLocationId) {
        await tenantLocationService.updateTenantLocation(editingLocationId, payload);
        toast.success('Tenant location updated.');
      } else {
        await tenantLocationService.createTenantLocation(payload);
        toast.success('Tenant location created.');
      }

      await loadTenantLocations({ silent: true });
      resetLocationForm();
    } catch (error) {
      const status = error?.response?.status;
      if (status === 409) {
        toast.error(error?.response?.data?.message || 'Location was updated elsewhere. Please refresh and try again.');
      } else {
        toast.error(error?.response?.data?.message || 'Failed to save tenant location');
      }
    } finally {
      setLocationSaving(false);
    }
  };

  const handleSetPrimaryLocation = async (location) => {
    if (!location?.location_id) {
      return;
    }

    if (location.is_active !== true) {
      toast.error('Reactivate this location before setting it as primary.');
      return;
    }

    setLocationSaving(true);
    try {
      await tenantLocationService.updateTenantLocation(location.location_id, {
        is_primary_storefront: true
      });
      toast.success('Primary storefront location updated.');
      await loadTenantLocations({ silent: true });
      if (editingLocationId === location.location_id) {
        setLocationForm((prev) => ({
          ...prev,
          is_primary_storefront: true
        }));
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to set primary storefront location');
    } finally {
      setLocationSaving(false);
    }
  };

  const handleDeactivateLocation = async (locationId) => {
    if (!window.confirm('Deactivate this location?')) {
      return;
    }

    setLocationSaving(true);
    try {
      await tenantLocationService.deactivateTenantLocation(locationId);
      toast.success('Tenant location deactivated.');
      await loadTenantLocations({ silent: true });
      if (editingLocationId === locationId) {
        resetLocationForm();
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to deactivate tenant location');
    } finally {
      setLocationSaving(false);
    }
  };

  const handleReactivateLocation = async (locationId) => {
    if (!window.confirm('Reactivate this location?')) {
      return;
    }

    setLocationSaving(true);
    try {
      await tenantLocationService.reactivateTenantLocation(locationId);
      toast.success('Tenant location reactivated.');
      await loadTenantLocations();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to reactivate tenant location');
    } finally {
      setLocationSaving(false);
    }
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
        pos_petty_cash_amount: Number(settings.posPettyCashAmount || 0),
        store_delivery_fee: Number(settings.storeDeliveryFee || 0),
        store_tenant_slug: String(settings.storeTenantSlug || '').trim().toLowerCase(),
        store_is_visible: settings.storeIsVisible === true,
        pos_open_status: settings.posOpenStatus === true,
        pos_wait_time_minutes: Number(settings.posWaitTimeMinutes || 0)
      });

      toast.success("Settings saved successfully!");
    } catch (error) {
      const errorMsg = error.response?.data?.message || 'Failed to save settings';
      const validationErrors = Array.isArray(error.response?.data?.errors)
        ? error.response.data.errors
        : [];
      const validationDescription = formatValidationErrorDescription(validationErrors);
      toast.error(errorMsg, validationDescription ? { description: validationDescription } : undefined);

      if (validationErrors.length > 0) {
        const errors = {};
        validationErrors.forEach(err => {
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
      posPettyCashAmount: 0,
      storeDeliveryFee: 0,
      storeTenantSlug: '',
      storeIsVisible: true,
      posOpenStatus: true,
      posWaitTimeMinutes: 15
    });
    resetLocationForm();
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

  const primaryStorefrontLocation = tenantLocations.find((location) => location?.is_primary_storefront === true) || null;
  const primaryStorefrontLastSyncAt = (
    primaryStorefrontLocation?.storefront_last_synced_at
    || tenantLocations.find((location) => Boolean(location?.storefront_last_synced_at))?.storefront_last_synced_at
    || null
  );
  const primaryStorefrontHealthCopy = primaryStorefrontLocation
    ? `Primary storefront location: ${primaryStorefrontLocation.name}`
    : 'No primary storefront location selected yet.';
  const primaryStorefrontLastSyncCopy = primaryStorefrontLastSyncAt
    ? new Date(primaryStorefrontLastSyncAt).toLocaleString()
    : 'Not synced yet';
  const storefrontSyncHealthLabel = storefrontSyncHealth?.status === 'healthy'
    ? 'Healthy'
    : storefrontSyncHealth?.status === 'degraded'
      ? 'Degraded'
      : 'Unknown';
  const storefrontSyncHealthClass = storefrontSyncHealth?.status === 'healthy'
    ? 'bg-emerald-100 text-emerald-700'
    : storefrontSyncHealth?.status === 'degraded'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-slate-100 text-slate-600';
  const storefrontSyncCheckedAtCopy = storefrontSyncHealth?.last_checked_at
    ? new Date(storefrontSyncHealth.last_checked_at).toLocaleString()
    : 'No sync health event yet';

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
                <div className="space-y-2">
                  <Label>Store Tenant Slug</Label>
                  <Input
                    value={settings.storeTenantSlug}
                    onChange={(e) => handleChange('storeTenantSlug', e.target.value)}
                    placeholder="your-store-slug"
                    maxLength={80}
                  />
                  <p className="text-xs text-slate-500">
                    Used for storefront URL path: `/store/:slug`.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Store Delivery Fee (PHP)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={settings.storeDeliveryFee}
                    onChange={(e) => handleChange('storeDeliveryFee', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Public Store Visibility</Label>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-600">Show this tenant in general store discovery</span>
                    <Switch
                      checked={settings.storeIsVisible === true}
                      onCheckedChange={(v) => handleChange('storeIsVisible', v)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>POS Open Status</Label>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-600">Storefront open/closed status reflected to buyers</span>
                    <Switch
                      checked={settings.posOpenStatus === true}
                      onCheckedChange={(v) => handleChange('posOpenStatus', v)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>POS Wait Time (minutes)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="720"
                    value={settings.posWaitTimeMinutes}
                    onChange={(e) => handleChange('posWaitTimeMinutes', e.target.value)}
                    placeholder="15"
                  />
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
                <Warehouse className="w-5 h-5 text-teal-600" />
                Storefront & Tenant Locations
              </CardTitle>
              <CardDescription>
                Manage active fulfillment locations used by the storefront and POS terminal.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
                <p className="text-sm font-semibold text-sky-900">{primaryStorefrontHealthCopy}</p>
                <p className="text-xs text-sky-700">Discovery last synced: {primaryStorefrontLastSyncCopy}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">Storefront Sync Health</p>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${storefrontSyncHealthClass}`}>
                    {storefrontSyncHealthLabel}
                  </span>
                </div>
                <div className="grid md:grid-cols-2 gap-2 text-xs text-slate-600">
                  <p>Last checked: {storefrontSyncCheckedAtCopy}</p>
                  <p>Source: {storefrontSyncHealth?.source || 'N/A'}</p>
                  <p>Attempts: {Number.isFinite(Number(storefrontSyncHealth?.attempts)) ? Number(storefrontSyncHealth.attempts) : 0}</p>
                  <p>Recovered by reconcile: {storefrontSyncHealth?.reconciled === true ? 'Yes' : 'No'}</p>
                </div>
                {Array.isArray(storefrontSyncHealth?.errors) && storefrontSyncHealth.errors.length > 0 && (
                  <p className="text-xs text-amber-700">
                    Recent sync issues: {storefrontSyncHealth.errors.slice(0, 3).join(' | ')}
                  </p>
                )}
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Location Name</Label>
                  <Input
                    value={locationForm.name}
                    onChange={(e) => handleLocationFormChange('name', e.target.value)}
                    placeholder="Main Branch"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input
                    value={locationForm.address_line}
                    onChange={(e) => handleLocationFormChange('address_line', e.target.value)}
                    placeholder="Street, City, Province"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Map Pin (OpenStreetMap)</Label>
                  <OpenStreetMapPinPicker
                    latitude={locationForm.latitude}
                    longitude={locationForm.longitude}
                    deliveryRadiusKm={locationForm.delivery_radius_km}
                    onChange={handleLocationPinChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Delivery Radius (km)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={locationForm.delivery_radius_km}
                    onChange={(e) => handleLocationFormChange('delivery_radius_km', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Wait Time (minutes)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="720"
                    value={locationForm.current_wait_time_minutes}
                    onChange={(e) => handleLocationFormChange('current_wait_time_minutes', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Location Is Open</Label>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-600">Open status visible to buyers</span>
                    <Switch
                      checked={locationForm.is_open === true}
                      onCheckedChange={(v) => handleLocationFormChange('is_open', v)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Primary Storefront Pin</Label>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-600">Use this as the storefront discovery map pin</span>
                    <Switch
                      checked={locationForm.is_primary_storefront === true}
                      disabled={locationForm.is_active !== true}
                      onCheckedChange={(v) => handleLocationFormChange('is_primary_storefront', v)}
                    />
                  </div>
                  {locationForm.is_active !== true && (
                    <p className="text-xs text-amber-700">Primary storefront pin can only be set on an active location.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Allow Out-Of-Stock Sales</Label>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-600">Allow ordering items even when stock is zero</span>
                    <Switch
                      checked={locationForm.allow_out_of_stock_sales === true}
                      onCheckedChange={(v) => handleLocationFormChange('allow_out_of_stock_sales', v)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Supports Delivery</Label>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-600">Enable delivery orders for this location</span>
                    <Switch
                      checked={locationForm.supports_delivery === true}
                      onCheckedChange={(v) => handleLocationFormChange('supports_delivery', v)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Supports Pickup</Label>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-600">Enable pickup orders for this location</span>
                    <Switch
                      checked={locationForm.supports_pickup === true}
                      onCheckedChange={(v) => handleLocationFormChange('supports_pickup', v)}
                    />
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <div>
                      <Label>Supports Dine-In</Label>
                      <p className="text-xs text-slate-500">Enable dine-in reservations or walk-in routing for this location</p>
                    </div>
                    <Switch
                      checked={locationForm.supports_dine_in === true}
                      onCheckedChange={(v) => handleLocationFormChange('supports_dine_in', v)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={handleSaveLocation} disabled={locationSaving}>
                  {locationSaving ? 'Saving...' : editingLocationId ? 'Update Location' : 'Add Location'}
                </Button>
                {editingLocationId && (
                  <Button type="button" variant="outline" onClick={resetLocationForm} disabled={locationSaving}>
                    Cancel Edit
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => loadTenantLocations()} disabled={locationsLoading || locationSaving}>
                  Refresh List
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Configured Locations</Label>
                {locationsLoading ? (
                  <p className="text-sm text-slate-500">Loading locations...</p>
                ) : tenantLocations.length === 0 ? (
                  <p className="text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg p-3">
                    No locations configured yet.
                  </p>
                ) : (
                  tenantLocations.map((location) => (
                    <div
                      key={`tenant-location-${location.location_id}`}
                      className="rounded-lg border border-slate-200 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{location.name}</p>
                          <p className="text-xs text-slate-500">{location.address_line}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${location.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            {location.is_active ? 'Active' : 'Inactive'}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${location.is_open ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'}`}>
                            {location.is_open ? 'Open' : 'Closed'}
                          </span>
                          {location.is_primary_storefront === true && (
                            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-sky-100 text-sky-700">
                              Primary
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-600">
                        <p>Lat: {location.latitude}</p>
                        <p>Lng: {location.longitude}</p>
                        <p>Radius: {location.delivery_radius_km} km</p>
                        <p>Wait: {location.current_wait_time_minutes} min</p>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => handleEditLocation(location)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetPrimaryLocation(location)}
                          disabled={locationSaving || location.is_active !== true || location.is_primary_storefront === true}
                        >
                          {location.is_primary_storefront === true ? 'Primary' : 'Set Primary'}
                        </Button>
                        {location.is_active ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeactivateLocation(location.location_id)}
                            disabled={locationSaving}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleReactivateLocation(location.location_id)}
                            disabled={locationSaving}
                          >
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
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
