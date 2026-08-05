// Controls whether the backend attempts to reach the LAN device-bridge
// (apps/dgfy-api/device-bridge, default http://127.0.0.1:5101) at all. This is off by
// default: most terminals have no physical hardware, and "no bridge configured"
// must not read as an error. See ADR 0053.
export const deviceBridgeEnabled = process.env.DEVICE_BRIDGE_ENABLED === 'true';

// POS_DEVICE_DRIVER selects the backend-dispatched driver explicitly:
//   - 'auto' (default): use the LAN bridge when DEVICE_BRIDGE_ENABLED=true, else client_managed
//   - 'lan_escpos_bridge': always dispatch to the LAN device-bridge
//   - 'client_managed': never dispatch server-side; hardware runs entirely client-side
//   - 'none': hardware is disabled outright; print/drawer requests fail with SERVICE_UNAVAILABLE
export const posDeviceDriverOverride = String(process.env.POS_DEVICE_DRIVER || 'auto').trim().toLowerCase();
