import React, { useState } from 'react';
import { 
  Settings as SettingsIcon, 
  Save, 
  Package, 
  AlertTriangle, 
  Warehouse,
  Percent,
  Bell,
  RefreshCw
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

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

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    toast.success("Settings saved successfully!");
  };

  const handleReset = () => {
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
    <div className="space-y-6 max-w-4xl">
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
                  <Label>Default Minimum Threshold</Label>
                  <span className="text-sm font-medium text-slate-900">{settings.defaultMinThreshold}% of capacity</span>
                </div>
                <Slider
                  value={[settings.defaultMinThreshold]}
                  onValueChange={([v]) => handleChange('defaultMinThreshold', v)}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <p className="text-xs text-slate-500">
                  Items below this percentage will trigger low stock alerts
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Default Purchase Allowance</Label>
                  <span className="text-sm font-medium text-slate-900">{settings.defaultPurchaseAllowance}% of capacity</span>
                </div>
                <Slider
                  value={[settings.defaultPurchaseAllowance]}
                  onValueChange={([v]) => handleChange('defaultPurchaseAllowance', v)}
                  max={50}
                  step={5}
                  className="w-full"
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
    </div>
  );
}