import { useEffect, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, Lock, Save } from 'lucide-react';
import { businessAdminApi, getBusinessAdminErrorMessage } from './businessAdminService.js';

export default function CanonicalBusinessNameEditor({
    currentName = '',
    canEdit = false,
    onSaved = async () => {}
}) {
    const [name, setName] = useState(String(currentName || ''));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        if (!saving) setName(String(currentName || ''));
    }, [currentName, saving]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        const nextName = String(name || '').trim();
        setError('');
        setSuccess('');

        if (nextName.length < 2 || nextName.length > 255) {
            setError('Business name must be between 2 and 255 characters.');
            return;
        }

        setSaving(true);
        try {
            const result = await businessAdminApi.updateCompanyName({ name: nextName });
            setName(String(result?.name || nextName));
            setSuccess(result?.changed === false
                ? 'The business name is already current.'
                : 'Business name updated in OPIS, POS, Storefront, and reports.');
            await onSaved?.(result);
        } catch (requestError) {
            setError(getBusinessAdminErrorMessage(requestError));
        } finally {
            setSaving(false);
        }
    };

    return (
        <section
            className="mb-5 rounded-2xl border border-[#CFE0F5] bg-white p-4 shadow-sm sm:p-5"
            data-testid="canonical-business-name-editor"
        >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF5FF] text-[#1A4E8D]">
                        <Building2 className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-[16px] font-extrabold text-[#0F172A]">Canonical business name</h2>
                        <p className="mt-1 max-w-2xl text-[12px] leading-5 text-[#64748B]">
                            This is the actual business identity used by OPIS, POS, account/business selection, Storefront discovery, and reports.
                            Storefront links and QR codes keep their existing addresses.
                        </p>
                    </div>
                </div>
                {!canEdit ? (
                    <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">
                        <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Admin only
                    </span>
                ) : null}
            </div>

            <form className="mt-4 flex flex-col gap-3 md:flex-row md:items-end" onSubmit={handleSubmit}>
                <div className="min-w-0 flex-1">
                    <label htmlFor="canonical-business-name" className="mb-1.5 block text-[12px] font-bold text-slate-700">
                        Business name
                    </label>
                    <input
                        id="canonical-business-name"
                        type="text"
                        value={name}
                        maxLength={255}
                        disabled={!canEdit || saving}
                        onChange={(event) => setName(event.target.value)}
                        className="h-10 w-full rounded-xl border border-slate-200 px-3 text-[13px] font-semibold text-[#0F172A] outline-none transition focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                    />
                    <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
                        This updates the POS business/display name too. Registered Name, TIN, and fiscal details stay unchanged.
                    </p>
                </div>
                <button
                    type="submit"
                    disabled={!canEdit || saving || !String(name || '').trim()}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#1A4E8D] px-4 text-[12px] font-extrabold text-white shadow-sm transition hover:bg-[#143F73] disabled:cursor-not-allowed disabled:opacity-50 md:w-auto md:shrink-0"
                >
                    <Save className="h-4 w-4" aria-hidden="true" />
                    {saving ? 'Saving…' : 'Save business name'}
                </button>
            </form>

            {error ? (
                <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] font-semibold text-rose-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                </div>
            ) : null}
            {success ? (
                <div role="status" className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[12px] font-semibold text-emerald-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{success}</span>
                </div>
            ) : null}
        </section>
    );
}
