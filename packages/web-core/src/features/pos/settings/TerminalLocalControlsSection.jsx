import { AlertCircle, CheckCircle2, Loader2, MapPin, Monitor, Printer, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const displayValue = (value, fallback = 'Not set') => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

export function TerminalQueueScopeField({ queueLocationScopeId, locations = [], loading = false }) {
  const queueLocation = (Array.isArray(locations) ? locations : [])
    .find((location) => String(location?.location_id) === String(queueLocationScopeId));
  const queueLocationLabel = loading
    ? 'Loading...'
    : displayValue(queueLocation?.name, queueLocationScopeId ? 'Location unavailable' : 'No active shift');

  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/40 px-3 py-3">
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#1A4E8D]">
          <MapPin className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="terminal-queue-location" className="text-[12px] font-bold text-[#1A4E8D]">
            Queue Location (Active Shift)
          </label>
          <select
            id="terminal-queue-location"
            aria-describedby="terminal-queue-location-help"
            value={queueLocationScopeId || ''}
            disabled
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] font-bold text-[#0F172A] disabled:cursor-not-allowed disabled:opacity-80"
          >
            <option value={queueLocationScopeId || ''}>{queueLocationLabel}</option>
          </select>
          <p id="terminal-queue-location-help" className="mt-1 text-[11px] leading-4 text-[#64748B]">
            Orders from other branches are not visible in this terminal queue.
          </p>
        </div>
      </div>
    </div>
  );
}

export function TerminalSoundField({
  onlineOrderSoundEnabled = true,
  setOnlineOrderSoundEnabled = () => {},
  locked = false,
  loading = false
}) {
  const enabled = onlineOrderSoundEnabled === true;

  return (
    <div className="flex min-w-0 items-center justify-between gap-4 rounded-xl border border-slate-100 bg-white px-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#1A4E8D]">
          <Volume2 className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-[#0F172A] sm:text-[14px]">Online order sound</p>
          <p className="mt-0.5 text-[11px] font-medium leading-4 text-[#64748B]">
            Local device setting for this terminal. Mute or enable the APK chime for new online orders.
          </p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-label="Online order sound"
        aria-checked={enabled}
        onClick={() => setOnlineOrderSoundEnabled((current) => !current)}
        disabled={locked || loading}
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`pointer-events-none absolute inline-flex h-6 w-11 items-center rounded-full border-2 border-transparent px-0.5 transition-colors motion-reduce:transition-none ${enabled ? 'bg-[#1A4E8D]' : 'bg-slate-200'}`}>
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </span>
      </button>
    </div>
  );
}

export function TerminalHardwareField({
  terminalIdOptions = [],
  activeTerminalId = '',
  registryEnforced = false,
  activeShiftId = null,
  hardwareDriverLabel = '',
  hardwareStatus = null,
  hardwareLoading = false,
  isPrinterAvailable = false,
  printersDetected = 0,
  onTestPrinter = async () => false,
  onSelectTerminal = async () => false,
  locked = false,
  loading = false
}) {
  const options = Array.isArray(terminalIdOptions)
    ? terminalIdOptions.map((option) => String(option || '').trim()).filter(Boolean)
    : [];
  const normalizedActiveTerminalId = String(activeTerminalId || '').trim();
  const selectOptions = options.includes(normalizedActiveTerminalId) || !normalizedActiveTerminalId
    ? options
    : [normalizedActiveTerminalId, ...options];
  const terminalSelectionDisabled = locked || loading || Boolean(activeShiftId);
  const testPrintDisabled = terminalSelectionDisabled || hardwareLoading || !isPrinterAvailable;
  const printerStatusMessage = hardwareLoading
    ? 'Checking printer...'
    : isPrinterAvailable
      ? `${hardwareDriverLabel || 'Printer ready'}${Number(printersDetected) > 0 ? ` · ${printersDetected} detected` : ''}`
      : String(hardwareStatus?.message || 'No printer detected');

  return (
    <section className="min-w-0 rounded-xl border border-slate-100 bg-white px-3 py-4 shadow-sm sm:col-span-2 sm:px-4" aria-labelledby="terminal-hardware-title">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#1A4E8D]">
            <Printer className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h4 id="terminal-hardware-title" className="text-[14px] font-extrabold text-[#0F172A]">POS terminal and printer</h4>
            <p className="mt-1 text-[11px] leading-4 text-[#64748B]">
              Choose the registered terminal and run a test print without recording a sale.
            </p>
          </div>
        </div>
        <div className={`flex shrink-0 items-center gap-1.5 text-[11px] font-extrabold ${isPrinterAvailable ? 'text-emerald-700' : 'text-amber-700'}`} role="status" aria-live="polite">
          {hardwareLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : (isPrinterAvailable ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />)}
          <span>{printerStatusMessage}</span>
        </div>
      </div>

      <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:grid-rows-[auto_auto]">
        <div className="min-w-0 md:col-start-1 md:row-span-2">
          <label htmlFor="terminal-setup-terminal-id" className="text-[12px] font-bold text-[#1A4E8D]">Terminal ID</label>
          <select
            id="terminal-setup-terminal-id"
            value={normalizedActiveTerminalId}
            onChange={(event) => { void onSelectTerminal(event.target.value); }}
            disabled={terminalSelectionDisabled}
            aria-describedby="terminal-setup-terminal-id-help"
            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-[#0F172A] outline-none transition focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/10 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {selectOptions.length > 0 ? selectOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            )) : <option value="">No registered terminals</option>}
          </select>
          <p id="terminal-setup-terminal-id-help" className="mt-1 text-[11px] leading-4 text-[#64748B]">
            {activeShiftId
              ? 'Close the active shift before changing terminals.'
              : (registryEnforced ? 'Only active registered terminals can be selected.' : 'Select the registered terminal used by this device.')}
          </p>
        </div>

        <div className="flex items-end justify-start md:col-start-2 md:row-start-2 md:self-end">
          <Button
            type="button"
            data-testid="pos-terminal-setup-test-print"
            className="h-12 bg-[#1A4E8D] hover:bg-[#143E72]"
            onClick={() => { void onTestPrinter(); }}
            disabled={testPrintDisabled}
            title={isPrinterAvailable ? 'Print a setup test page' : 'No printer detected on this device.'}
          >
            <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
            Test print
          </Button>
        </div>
      </div>
    </section>
  );
}

export default function TerminalLocalControlsSection({
  queueLocationScopeId,
  locations,
  onlineOrderSoundEnabled,
  setOnlineOrderSoundEnabled,
  locked,
  loading,
  terminalIdOptions,
  activeTerminalId,
  registryEnforced,
  activeShiftId,
  hardwareDriverLabel,
  hardwareStatus,
  hardwareLoading,
  isPrinterAvailable,
  printersDetected,
  onTestPrinter,
  onSelectTerminal
}) {
  return (
    <section aria-labelledby="terminal-only-controls-title" data-testid="terminal-only-controls" className="min-w-0 space-y-4">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#1A4E8D]">
          <Monitor className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 id="terminal-only-controls-title" className="text-[16px] font-extrabold text-[#0F172A]">Terminal-only controls</h3>
          <p className="mt-1 text-[12px] leading-5 text-[#64748B]">
            Local queue and device behavior for this POS terminal. Shared business policy remains in POS Setup.
          </p>
        </div>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <TerminalHardwareField
          terminalIdOptions={terminalIdOptions}
          activeTerminalId={activeTerminalId}
          registryEnforced={registryEnforced}
          activeShiftId={activeShiftId}
          hardwareDriverLabel={hardwareDriverLabel}
          hardwareStatus={hardwareStatus}
          hardwareLoading={hardwareLoading}
          isPrinterAvailable={isPrinterAvailable}
          printersDetected={printersDetected}
          onTestPrinter={onTestPrinter}
          onSelectTerminal={onSelectTerminal}
          locked={locked}
          loading={loading}
        />
        <TerminalQueueScopeField
          queueLocationScopeId={queueLocationScopeId}
          locations={locations}
          loading={loading}
        />
        <TerminalSoundField
          onlineOrderSoundEnabled={onlineOrderSoundEnabled}
          setOnlineOrderSoundEnabled={setOnlineOrderSoundEnabled}
          locked={locked}
          loading={loading}
        />
      </div>
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-3 py-3 text-[11px] leading-4 text-[#46658F]">
        Device, printer, register, and other terminal-local hardware controls stay in the terminal surface. Registry policy and branch binding stay in POS Setup.
      </div>
    </section>
  );
}
