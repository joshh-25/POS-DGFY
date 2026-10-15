import React, { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, ExternalLink, Link2, Loader2, Plus, QrCode as QrCodeIcon, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../../../../packages/web-core/src/services/api.js';

const DEFAULT_DESIGN = Object.freeze({
    foreground: '#0f172a',
    background: '#ffffff',
    width: 320,
    margin: 2,
    error_correction_level: 'M'
});

const unwrap = (response) => response?.data?.data ?? response?.data ?? {};

const errorMessage = (error, fallback) => (
    error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback
);

const resolvePublicStorefrontOrigin = () => {
    const configured = String(import.meta.env.VITE_PUBLIC_STOREFRONT_ORIGIN || '').trim().replace(/\/+$/, '');
    if (configured) return configured;
    if (typeof window !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
        return `${window.location.protocol}//${window.location.hostname}:5175`;
    }
    return 'https://dgfy.ph';
};

export const buildStorefrontQrTargetUrl = ({ storeSlug, qrToken, locationId, origin = resolvePublicStorefrontOrigin() } = {}) => {
    const slug = String(storeSlug || '').trim().toLowerCase();
    const token = String(qrToken || '').trim();
    if (!slug || !token) return '';
    const url = new URL(`${origin.replace(/\/+$/, '')}/tenant-store/${encodeURIComponent(slug)}/categories`);
    url.searchParams.set('location_id', String(locationId));
    url.searchParams.set('qr_token', token);
    return url.toString();
};

const normalizeDesign = (design = {}) => ({
    ...DEFAULT_DESIGN,
    ...(design && typeof design === 'object' ? design : {})
});

const initialForm = (locationId = '') => ({
    location_id: locationId,
    target_type: 'catalog',
    folder_id: '',
    label: '',
    design: { ...DEFAULT_DESIGN }
});

const QrPreview = ({ url, design }) => {
    const [dataUrl, setDataUrl] = useState('');
    const [error, setError] = useState('');
    const normalizedDesign = normalizeDesign(design);

    useEffect(() => {
        let cancelled = false;
        if (!url) return undefined;
        QRCode.toDataURL(url, {
            width: Number(normalizedDesign.width) || DEFAULT_DESIGN.width,
            margin: Number(normalizedDesign.margin) || 0,
            errorCorrectionLevel: normalizedDesign.error_correction_level || DEFAULT_DESIGN.error_correction_level,
            color: {
                dark: normalizedDesign.foreground || DEFAULT_DESIGN.foreground,
                light: normalizedDesign.background || DEFAULT_DESIGN.background
            }
        }).then((nextDataUrl) => {
            if (!cancelled) {
                setError('');
                setDataUrl(nextDataUrl);
            }
        }).catch(() => {
            if (!cancelled) setError('Preview unavailable');
        });
        return () => { cancelled = true; };
    }, [normalizedDesign.background, normalizedDesign.error_correction_level, normalizedDesign.foreground, normalizedDesign.margin, normalizedDesign.width, url]);

    if (!url) return <div className="flex h-44 w-44 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-500">Enter a destination to preview</div>;
    if (error) return <div className="flex h-44 w-44 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-500">{error}</div>;
    if (!dataUrl) return <div className="flex h-44 w-44 items-center justify-center rounded-xl bg-slate-100"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
    return <img src={dataUrl} alt="Storefront QR code preview" className="h-44 w-44 rounded-xl border border-slate-200 p-2" />;
};

const FieldLabel = ({ children }) => <label className="mb-1 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">{children}</label>;

const QrCodeManagementPage = () => {
    const [locations, setLocations] = useState([]);
    const [folders, setFolders] = useState([]);
    const [qrCodes, setQrCodes] = useState([]);
    const [storeSlug, setStoreSlug] = useState('');
    const [form, setForm] = useState(initialForm());
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [locationResponse, folderResponse, qrResponse] = await Promise.all([
                api.get('/tenant-locations', { params: { include_inactive: false } }),
                api.get('/items/folders'),
                api.get('/storefront-qr-codes')
            ]);
            const locationData = unwrap(locationResponse);
            const folderData = unwrap(folderResponse);
            const qrData = unwrap(qrResponse);
            const nextLocations = Array.isArray(locationData)
                ? locationData
                : (Array.isArray(locationData?.locations) ? locationData.locations : []);
            setLocations(nextLocations);
            setFolders(Array.isArray(folderData?.folders) ? folderData.folders : (Array.isArray(folderData) ? folderData : []));
            setQrCodes(Array.isArray(qrData?.qr_codes) ? qrData.qr_codes : []);
            setStoreSlug(String(qrData?.store_slug || '').trim());
            setForm((current) => current.location_id || !nextLocations.length
                ? current
                : { ...current, location_id: String(nextLocations[0].location_id) });
        } catch (loadError) {
            setError(errorMessage(loadError, 'QR codes could not be loaded.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const activeFolders = useMemo(
        () => folders.filter((folder) => folder?.is_active !== false),
        [folders]
    );

    const setDesignField = (key, value) => {
        setForm((current) => ({ ...current, design: { ...current.design, [key]: value } }));
    };

    const resetForm = () => {
        setEditingId(null);
        setForm(initialForm(locations[0]?.location_id ? String(locations[0].location_id) : ''));
    };

    const submit = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError('');
        try {
            const body = {
                location_id: Number(form.location_id),
                target_type: form.target_type,
                folder_id: form.target_type === 'category' ? Number(form.folder_id) : null,
                label: form.label,
                design: normalizeDesign(form.design)
            };
            const response = editingId
                ? await api.patch(`/storefront-qr-codes/${editingId}`, {
                    label: body.label,
                    design: body.design
                })
                : await api.post('/storefront-qr-codes', body);
            const saved = unwrap(response);
            setQrCodes((current) => editingId
                ? current.map((qrCode) => qrCode.storefront_qr_code_id === editingId ? saved : qrCode)
                : [saved, ...current]);
            setStoreSlug(String(saved?.store_slug || storeSlug).trim());
            toast.success(editingId ? 'QR code updated.' : 'QR code created.');
            resetForm();
        } catch (saveError) {
            setError(errorMessage(saveError, 'QR code could not be saved.'));
        } finally {
            setSaving(false);
        }
    };

    const startEdit = (qrCode) => {
        setEditingId(qrCode.storefront_qr_code_id);
        setForm({
            location_id: String(qrCode.location_id),
            target_type: qrCode.target_type,
            folder_id: qrCode.folder_id == null ? '' : String(qrCode.folder_id),
            label: qrCode.label || '',
            design: normalizeDesign(qrCode.design)
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const deactivate = async (qrCode) => {
        if (!window.confirm(`Deactivate “${qrCode.label || 'this QR code'}”? Printed copies will stop opening the catalog.`)) return;
        try {
            const response = await api.delete(`/storefront-qr-codes/${qrCode.storefront_qr_code_id}`);
            const updated = unwrap(response);
            setQrCodes((current) => current.map((entry) => entry.storefront_qr_code_id === qrCode.storefront_qr_code_id ? updated : entry));
            toast.success('QR code deactivated.');
        } catch (deactivateError) {
            setError(errorMessage(deactivateError, 'QR code could not be deactivated.'));
        }
    };

    const copyUrl = async (url) => {
        try {
            await navigator.clipboard.writeText(url);
            toast.success('Storefront link copied.');
        } catch {
            setError('The link could not be copied.');
        }
    };

    const downloadQr = async (qrCode, url) => {
        try {
            const dataUrl = await QRCode.toDataURL(url, {
                width: Number(qrCode.design?.width) || DEFAULT_DESIGN.width,
                margin: Number(qrCode.design?.margin) || 0,
                errorCorrectionLevel: qrCode.design?.error_correction_level || DEFAULT_DESIGN.error_correction_level,
                color: { dark: qrCode.design?.foreground || DEFAULT_DESIGN.foreground, light: qrCode.design?.background || DEFAULT_DESIGN.background }
            });
            const anchor = document.createElement('a');
            anchor.href = dataUrl;
            anchor.download = `${String(qrCode.label || 'storefront-qr').trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'storefront-qr'}.png`;
            anchor.click();
        } catch (downloadError) {
            setError(errorMessage(downloadError, 'The QR image could not be downloaded.'));
        }
    };

    return (
        <div className="space-y-5" data-testid="qr-code-management-page">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-[#1A4E8D]"><QrCodeIcon className="h-5 w-5" /><span className="text-xs font-black uppercase tracking-[0.18em]">Storefront publishing</span></div>
                    <h1 className="mt-1 text-2xl font-black text-slate-950">QR codes</h1>
                    <p className="mt-1 max-w-3xl text-sm text-slate-600">Create branch-specific links for the full catalog or a category. The link stays stable while OPIS keeps product details, pricing, and category membership synchronized.</p>
                </div>
                <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
            </div>

            {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

            <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div><h2 className="text-lg font-black text-slate-950">{editingId ? 'Edit QR code' : 'Create QR code'}</h2><p className="mt-1 text-xs text-slate-500">Every code is scoped to one active branch.</p></div>
                    {editingId ? <button type="button" onClick={resetForm} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600"><RotateCcw className="h-4 w-4" /> Cancel edit</button> : null}
                </div>
                <div className="grid gap-4 lg:grid-cols-4">
                    <div><FieldLabel>Branch</FieldLabel><select required value={form.location_id} disabled={Boolean(editingId)} onChange={(event) => setForm((current) => ({ ...current, location_id: event.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold"><option value="">Select a branch</option>{locations.map((location) => <option key={location.location_id} value={location.location_id}>{location.name}</option>)}</select></div>
                    <div><FieldLabel>Destination</FieldLabel><select required value={form.target_type} disabled={Boolean(editingId)} onChange={(event) => setForm((current) => ({ ...current, target_type: event.target.value, folder_id: '' }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold"><option value="catalog">All products</option><option value="category">Category</option></select></div>
                    <div><FieldLabel>Category</FieldLabel><select required={form.target_type === 'category'} disabled={form.target_type !== 'category' || Boolean(editingId)} value={form.folder_id} onChange={(event) => setForm((current) => ({ ...current, folder_id: event.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold"><option value="">Select a category</option>{activeFolders.map((folder) => <option key={folder.folder_id} value={folder.folder_id}>{folder.name}</option>)}</select></div>
                    <div><FieldLabel>Label</FieldLabel><input value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder={form.target_type === 'category' ? 'e.g. Breakfast menu' : 'e.g. Main menu'} maxLength={120} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <div><FieldLabel>Foreground</FieldLabel><input type="color" value={form.design.foreground} onChange={(event) => setDesignField('foreground', event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white p-1" /></div>
                    <div><FieldLabel>Background</FieldLabel><input type="color" value={form.design.background} onChange={(event) => setDesignField('background', event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white p-1" /></div>
                    <div><FieldLabel>Size</FieldLabel><select value={form.design.width} onChange={(event) => setDesignField('width', Number(event.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="240">240 px</option><option value="320">320 px</option><option value="400">400 px</option><option value="600">600 px</option></select></div>
                    <div><FieldLabel>Margin</FieldLabel><select value={form.design.margin} onChange={(event) => setDesignField('margin', Number(event.target.value))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="0">None</option><option value="2">Standard</option><option value="4">Wide</option><option value="8">Extra wide</option></select></div>
                    <div><FieldLabel>Error correction</FieldLabel><select value={form.design.error_correction_level} onChange={(event) => setDesignField('error_correction_level', event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="L">Low</option><option value="M">Medium</option><option value="Q">Quartile</option><option value="H">High</option></select></div>
                </div>
                <div className="mt-5 flex justify-end"><button type="submit" disabled={saving || !locations.length} className="inline-flex items-center gap-2 rounded-lg bg-[#1A4E8D] px-4 py-2.5 text-sm font-black text-white hover:bg-[#143F73] disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />)} {editingId ? 'Save QR code' : 'Create QR code'}</button></div>
            </form>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="qr-code-list-title">
                <div className="mb-4"><h2 id="qr-code-list-title" className="text-lg font-black text-slate-950">Published QR codes</h2><p className="mt-1 text-xs text-slate-500">Scan or open a code to load the live storefront catalog for its assigned branch.</p></div>
                {loading ? <div className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading QR codes…</div> : null}
                {!loading && !qrCodes.length ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">No QR codes yet. Create the first branch-scoped catalog link above.</div> : null}
                <div className="grid gap-4 xl:grid-cols-2">
                    {qrCodes.map((qrCode) => {
                        const url = buildStorefrontQrTargetUrl({ storeSlug: qrCode.store_slug || storeSlug, qrToken: qrCode.public_token, locationId: qrCode.location_id });
                        const branchName = qrCode.location?.name || `Branch #${qrCode.location_id}`;
                        const targetLabel = qrCode.target_type === 'category' ? (qrCode.folder?.name || 'Category') : 'All products';
                        return <article key={qrCode.storefront_qr_code_id} className={`flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row ${qrCode.is_active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                            <div className="shrink-0"><QrPreview url={url} design={qrCode.design} /></div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="truncate text-base font-black text-slate-950">{qrCode.label || targetLabel}</h3><p className="mt-1 text-xs font-bold text-slate-500">{branchName} · {targetLabel}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${qrCode.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{qrCode.is_active ? 'Active' : 'Inactive'}</span></div>
                                <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500"><Link2 className="h-4 w-4 shrink-0" /><span className="truncate">{url || 'Storefront URL unavailable until the business slug is loaded.'}</span></div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <button type="button" disabled={!url} onClick={() => copyUrl(url)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><Copy className="h-3.5 w-3.5" /> Copy link</button>
                                    <button type="button" disabled={!url} onClick={() => downloadQr(qrCode, url)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><Download className="h-3.5 w-3.5" /> Download PNG</button>
                                    {url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700"><ExternalLink className="h-3.5 w-3.5" /> Open</a> : null}
                                    {qrCode.is_active ? <><button type="button" onClick={() => startEdit(qrCode)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A4E8D] px-3 py-2 text-xs font-bold text-white"><Check className="h-3.5 w-3.5" /> Edit design</button><button type="button" onClick={() => deactivate(qrCode)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700"><Trash2 className="h-3.5 w-3.5" /> Deactivate</button></> : null}
                                </div>
                            </div>
                        </article>;
                    })}
                </div>
            </section>
        </div>
    );
};

export default QrCodeManagementPage;
