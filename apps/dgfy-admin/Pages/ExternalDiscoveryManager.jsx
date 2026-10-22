import React, { useCallback, useEffect, useState } from 'react';
import * as adminService from '@/services/adminService';

const emptyListing = {
  slug: '', title: '', external_provider: 'proventus', external_reference_id: '',
  external_record_origin: 'event_seed', latitude: '', longitude: '',
  address_line: '', description: '', is_visible: true
};

const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
const buttonClass = 'rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const errorText = (error) => error?.response?.data?.message || error?.message || 'Something went wrong.';

export default function ExternalDiscoveryManager() {
  const [data, setData] = useState({ sites: [], listings: [] });
  const [listing, setListing] = useState(emptyListing);
  const [siteDrafts, setSiteDrafts] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const result = await adminService.getExternalDiscovery();
    setData(result || { sites: [], listings: [] });
    setSiteDrafts(Object.fromEntries((result?.sites || []).map((site) => [site.site_key, {
      url_template: site.url_template || '', enabled: site.enabled === true
    }])));
  }, []);

  useEffect(() => { refresh().catch((reason) => setError(errorText(reason))); }, [refresh]);

  const run = async (action, successMessage) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await action();
      await refresh();
      setMessage(successMessage);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  };

  const saveSite = (siteKey) => run(
    () => adminService.saveExternalRedirectSite(siteKey, siteDrafts[siteKey]),
    `${siteKey} destination saved.`
  );

  const saveListing = (event) => {
    event.preventDefault();
    const slug = listing.slug.trim().toLowerCase();
    run(async () => {
      await adminService.saveExternalDiscoveryListing(slug, { ...listing, latitude: Number(listing.latitude), longitude: Number(listing.longitude) });
      setListing(emptyListing);
    }, 'External pin saved. Its DGFY link stays stable when the destination template changes.');
  };

  const removeListing = (slug) => {
    if (!window.confirm(`Remove external pin ${slug}? Its DGFY link will stop working.`)) return;
    run(() => adminService.removeExternalDiscoveryListing(slug), 'External pin removed.');
  };

  const clearTemporary = () => {
    const count = data.listings.filter((row) => row.external_record_origin === 'event_seed').length;
    if (!window.confirm(`Remove ${count} temporary event pins? Manual pins and redirect site settings will remain.`)) return;
    run(() => adminService.clearTemporaryExternalDiscoveryListings(), 'Temporary event pins removed.');
  };

  const updateListing = (key, value) => setListing((current) => ({ ...current, [key]: value }));

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 pb-12 md:p-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-950">External map pins</h1>
        <p className="mt-1 text-sm text-slate-600">Manage partner destinations and temporary listings. Customers open a stable DGFY link before leaving for a partner site.</p>
      </header>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{message}</p>}

      <section className="grid gap-4 md:grid-cols-2" aria-label="Partner destinations">
        {data.sites.map((site) => {
          const draft = siteDrafts[site.site_key] || { url_template: '', enabled: false };
          return (
            <div key={site.site_key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">{site.display_name}</h2>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${draft.enabled ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                  {draft.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <label className="mt-3 block text-sm font-medium text-slate-700" htmlFor={`template-${site.site_key}`}>HTTPS destination template</label>
              <input id={`template-${site.site_key}`} className={`${fieldClass} mt-1`} value={draft.url_template} placeholder="https://partner.example/item?id={id}" onChange={(event) => setSiteDrafts((current) => ({ ...current, [site.site_key]: { ...draft, url_template: event.target.value } }))} />
              <p className="mt-1 text-xs text-slate-500">Use exactly one {'{id}'} placeholder. Only a public HTTPS host is accepted.</p>
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={draft.enabled} onChange={(event) => setSiteDrafts((current) => ({ ...current, [site.site_key]: { ...draft, enabled: event.target.checked } }))} /> Enable redirects</label>
              {!draft.enabled && data.listings.some((row) => row.external_provider === site.site_key && row.is_visible) && (
                <p className="mt-2 text-xs text-amber-800">Visible pins for this partner will remain on the map, but their links will be unavailable until redirects are enabled.</p>
              )}
              <button type="button" disabled={busy} className={`${buttonClass} mt-3`} onClick={() => saveSite(site.site_key)}>Save destination</button>
            </div>
          );
        })}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="External pin editor">
        <h2 className="text-lg font-semibold text-slate-900">Add or update a pin</h2>
        <p className="mt-1 text-xs text-slate-500">The slug is the stable DGFY link ID. Keep it when updating imported records.</p>
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={saveListing}>
          {[
            ['slug', 'DGFY link ID', 'text'], ['title', 'Pin title', 'text'],
            ['external_reference_id', 'Partner record ID', 'text'], ['latitude', 'Latitude', 'number'],
            ['longitude', 'Longitude', 'number'], ['address_line', 'Address', 'text'],
            ['description', 'Short description', 'text']
          ].map(([key, label, type]) => (
            <label key={key} className="text-sm font-medium text-slate-700">{label}
              <input className={`${fieldClass} mt-1`} type={type} step={type === 'number' ? 'any' : undefined} value={listing[key]} onChange={(event) => updateListing(key, event.target.value)} required={['slug', 'title', 'external_reference_id', 'latitude', 'longitude'].includes(key)} />
            </label>
          ))}
          <label className="text-sm font-medium text-slate-700">Partner
            <select className={`${fieldClass} mt-1`} value={listing.external_provider} onChange={(event) => updateListing('external_provider', event.target.value)}>
              {data.sites.map((site) => <option key={site.site_key} value={site.site_key}>{site.display_name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Record origin
            <select className={`${fieldClass} mt-1`} value={listing.external_record_origin} onChange={(event) => updateListing('external_record_origin', event.target.value)}>
              <option value="event_seed">Temporary event data</option><option value="manual">Manual, keep after event</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={listing.is_visible} onChange={(event) => updateListing('is_visible', event.target.checked)} /> Visible on discovery map</label>
          <div className="flex items-center gap-2"><button className={buttonClass} disabled={busy} type="submit">Save pin</button><button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={() => setListing(emptyListing)}>Reset</button></div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="External pins">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-slate-900">Pins ({data.listings.length})</h2><button type="button" disabled={busy || !data.listings.some((row) => row.external_record_origin === 'event_seed')} onClick={clearTemporary} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Clear temporary event pins</button></div>
        {data.listings.length === 0 && <p className="mt-3 text-sm text-slate-500">No external pins yet. You can configure destinations before the JSON arrives.</p>}
        <div className="mt-3 space-y-2">
          {data.listings.map((row) => (
            <div key={row.slug} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
              <div><strong className="text-sm text-slate-900">{row.title}</strong><p className="text-xs text-slate-500">{row.external_provider} · {row.external_reference_id} · {row.external_record_origin} · {row.is_visible ? 'Visible' : 'Hidden'}</p><code className="text-xs text-slate-600">/e/{row.slug}</code></div>
              <div className="flex gap-2"><button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => setListing({ ...emptyListing, ...row })}>Edit</button><button type="button" className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700" onClick={() => removeListing(row.slug)}>Remove</button></div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
