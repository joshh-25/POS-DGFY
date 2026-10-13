import { useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Download, Loader2, Play, Square, Upload, Volume2 } from 'lucide-react';
import {
  getOrderAlertSoundCatalog,
  ORDER_ALERT_SOUND_DEFAULT_ID
} from '../utils/orderAlertSounds.js';

const compactButtonClass = 'inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20 disabled:cursor-not-allowed disabled:opacity-50';

export default function OrderAlertSoundOptions({
  soundId = ORDER_ALERT_SOUND_DEFAULT_ID,
  downloadedSoundIds = [],
  downloadId = '',
  onSoundSelect = () => {},
  onDownload = async () => false,
  onImport = async () => false,
  importing = false,
  onPreview = async () => false,
  previewingSoundId = '',
  disabled = false,
  title = 'Order alert sound',
  titleId = 'order-alert-sound-options-title'
}) {
  const downloaded = new Set(Array.isArray(downloadedSoundIds) ? downloadedSoundIds : []);
  const selectedSoundId = String(soundId || ORDER_ALERT_SOUND_DEFAULT_ID).trim() || ORDER_ALERT_SOUND_DEFAULT_ID;
  const fileInputRef = useRef(null);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const soundCatalog = getOrderAlertSoundCatalog();
  const selectedSound = soundCatalog.find((sound) => sound.id === selectedSoundId) || soundCatalog[0];
  const selectedSoundIsPreviewing = selectedSound && String(previewingSoundId || '').trim() === selectedSound.id;
  const selectedSoundIsDownloading = selectedSound && downloadId === selectedSound.id;
  const selectedSoundIsAvailable = selectedSound && (selectedSound.isDefault || selectedSound.isImported || downloaded.has(selectedSound.id));

  const handleImportChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void onImport(file);
  };

  return (
    <section className="min-w-0 rounded-xl border border-slate-100 bg-white px-3 py-3" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#1A4E8D]">
            <Volume2 className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h4 id={titleId} className="text-[13px] font-bold text-[#0F172A] sm:text-[14px]">{title}</h4>
          </div>
        </div>
        <button
          type="button"
          className={`${compactButtonClass} border-slate-300 bg-white text-[#1A4E8D] hover:border-[#1A4E8D]`}
          aria-expanded={isManageOpen}
          aria-controls={`${titleId}-library`}
          onClick={() => setIsManageOpen((current) => !current)}
        >
          {isManageOpen ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
          {isManageOpen ? 'Hide sounds' : 'Manage sounds'}
        </button>
      </div>

      {selectedSound ? (
        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#64748B]">Selected sound</p>
            <p className="truncate text-[13px] font-extrabold text-[#0F172A]">{selectedSound.label}</p>
            <p className="text-[10px] font-semibold text-[#64748B]">
              {selectedSound.isDefault ? 'Uses the current device sound.' : (selectedSound.isImported ? 'Imported on this device.' : 'Saved on this device.')}
            </p>
          </div>
          <button
            type="button"
            className={`${compactButtonClass} shrink-0 border-[#1A4E8D] bg-white text-[#1A4E8D] hover:bg-blue-50`}
            aria-label={`${selectedSoundIsPreviewing ? 'Stop preview' : 'Preview'} ${selectedSound.label}`}
            onClick={() => { void onPreview(selectedSound.id); }}
            disabled={disabled || !selectedSoundIsAvailable || selectedSoundIsDownloading}
          >
            {selectedSoundIsPreviewing ? <Square className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
            {selectedSoundIsPreviewing ? 'Stop preview' : 'Preview'}
          </button>
        </div>
      ) : null}

      {isManageOpen ? (
        <div id={`${titleId}-library`} className="mt-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#64748B]">Available sounds</p>
            <div className="shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.aac,.flac,.m4a,.mp3,.ogg,.wav,.webm"
                className="sr-only"
                aria-label="Import audio file"
                onChange={handleImportChange}
                disabled={disabled || importing}
              />
              <button
                type="button"
                className={`${compactButtonClass} border-[#1A4E8D] bg-[#1A4E8D] text-white hover:bg-[#143F73]`}
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || importing}
                aria-label="Import audio"
              >
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Upload className="h-3.5 w-3.5" aria-hidden="true" />}
                {importing ? 'Compressing…' : 'Import audio'}
              </button>
            </div>
          </div>

          <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {soundCatalog.map((sound) => {
              const isSelected = selectedSoundId === sound.id;
              const isDownloaded = sound.isDefault || sound.isImported || downloaded.has(sound.id);
              const isDownloading = downloadId === sound.id;
              const isPreviewing = String(previewingSoundId || '').trim() === sound.id;

              return (
                <div
                  key={sound.id}
                  className={`min-w-0 rounded-lg border px-3 py-3 transition ${isSelected ? 'border-[#1A4E8D] bg-blue-50/50' : 'border-slate-200 bg-slate-50/30'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-extrabold text-[#0F172A]">{sound.label}</p>
                    </div>
                    {isSelected ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#1A4E8D] px-2 py-1 text-[10px] font-extrabold text-white">
                        <Check className="h-3 w-3" aria-hidden="true" />
                        Selected
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`${compactButtonClass} border-slate-300 bg-white text-[#1A4E8D] hover:border-[#1A4E8D]`}
                      aria-label={`${isPreviewing ? 'Stop preview' : 'Preview'} ${sound.label}`}
                      onClick={() => { void onPreview(sound.id); }}
                      disabled={disabled || !isDownloaded || isDownloading}
                    >
                      {isPreviewing ? <Square className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
                      {isPreviewing ? 'Stop preview' : 'Preview'}
                    </button>

                    {sound.id === ORDER_ALERT_SOUND_DEFAULT_ID ? (
                      <>
                        <span className="inline-flex min-h-8 items-center rounded-lg bg-slate-100 px-2.5 text-[11px] font-bold text-[#64748B]">Always available</span>
                        {!isSelected ? (
                          <button
                            type="button"
                            className={`${compactButtonClass} border-[#1A4E8D] bg-[#1A4E8D] text-white hover:bg-[#143F73]`}
                            aria-label="Use Device default"
                            onClick={() => onSoundSelect(sound.id)}
                            disabled={disabled}
                          >
                            Use default
                          </button>
                        ) : null}
                      </>
                    ) : isDownloaded ? (
                      <button
                        type="button"
                        className={`${compactButtonClass} ${isSelected ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-[#1A4E8D] bg-[#1A4E8D] text-white hover:bg-[#143F73]'}`}
                        aria-label={`Use ${sound.label}`}
                        onClick={() => onSoundSelect(sound.id)}
                        disabled={disabled || isSelected}
                      >
                        {isSelected ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                        {isSelected ? 'Using' : 'Use sound'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`${compactButtonClass} border-[#1A4E8D] bg-[#1A4E8D] text-white hover:bg-[#143F73]`}
                        aria-label={`Download ${sound.label}`}
                        onClick={() => { void onDownload(sound.id); }}
                        disabled={disabled || isDownloading}
                      >
                        {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Download className="h-3.5 w-3.5" aria-hidden="true" />}
                        {isDownloading ? 'Downloading…' : 'Download'}
                      </button>
                    )}
                  </div>

                  <p className="mt-2 text-[10px] font-semibold text-[#64748B]">
                    {sound.isDefault ? 'Uses the current device sound.' : (isDownloaded ? (sound.isImported ? 'Imported on this device.' : 'Saved on this device.') : 'Not downloaded yet.')}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
