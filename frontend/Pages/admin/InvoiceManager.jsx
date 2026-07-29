import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import * as adminService from '@/services/adminService';

const peso = (centavos) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format((Number(centavos) || 0) / 100);
const toCentavos = (value) => {
  const parsed = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};
const toPesoField = (centavos) => ((Number(centavos) || 0) / 100).toFixed(2);
const INITIAL_FORM = { registration_application_id: '', gross_pesos: '', buyer_address: '', buyer_tin: '' };

export default function InvoiceManager() {
  const [invoices, setInvoices] = useState([]);
  const [eligibleApplications, setEligibleApplications] = useState([]);
  const [form, setForm] = useState(INITIAL_FORM);
  const [showBuyerDetails, setShowBuyerDetails] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState(null);
  const [actionForm, setActionForm] = useState({ gross_pesos: '', cash_pesos: '', reason: '', change_returned_confirmed: false });

  const selectedApplication = useMemo(() => eligibleApplications.find((entry) => entry.id === form.registration_application_id) || null, [eligibleApplications, form.registration_application_id]);
  const selectedCompanyName = selectedApplication?.tenant?.name || '';
  const selectedEmail = selectedApplication?.registration_email_snapshot || '';
  const load = useCallback(async () => {
    const [invoiceResponse, eligibleResponse] = await Promise.all([adminService.listPlatformInvoices(), adminService.listEligiblePlatformInvoiceApplications()]);
    setInvoices(invoiceResponse.data || []);
    setEligibleApplications(eligibleResponse.data || []);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try { await load(); }
      catch (err) { if (active) setError(err.response?.data?.message || 'Unable to load invoices.'); }
    })();
    return () => { active = false; };
  }, [load]);

  const createDraft = async (event) => {
    event.preventDefault();
    const gross_centavos = toCentavos(form.gross_pesos);
    if (!selectedApplication || gross_centavos <= 0) { setError('Choose an approved company and enter an amount greater than zero.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await adminService.createPlatformInvoiceDraft({
        registration_application_id: selectedApplication.id,
        gross_centavos,
        buyer: { legal_name: selectedCompanyName, address: form.buyer_address, tin: form.buyer_tin, contact_email: selectedEmail },
        billing_frequency: 'one_time', payment_method: 'cash'
      });
      setNotice(`QA draft created: ${response.data?.id || 'invoice'}.`);
      setForm(INITIAL_FORM); setShowBuyerDetails(false); await load();
    } catch (err) { setError(err.response?.data?.message || 'Unable to create the draft.'); } finally { setBusy(false); }
  };

  const openAction = (type, invoice) => {
    setError('');
    setAction({ type, invoice });
    setActionForm({ gross_pesos: toPesoField(invoice.gross_centavos), cash_pesos: type === 'issue' ? toPesoField(invoice.gross_centavos) : '', reason: '', change_returned_confirmed: false });
  };
  const closeAction = () => { if (!busy) setAction(null); };
  const actionTitle = { edit: 'Edit QA draft', issue: 'Record cash and issue', payment: 'Record cash payment', discard: 'Discard QA draft', credit: 'Record full credit', replacement: 'Create replacement draft' }[action?.type] || '';
  const actionInvoice = action?.invoice;
  const cashCentavos = toCentavos(actionForm.cash_pesos);
  const actionGrossCentavos = toCentavos(actionForm.gross_pesos);
  const changeDue = actionInvoice && ['issue', 'payment'].includes(action?.type) ? Math.max(cashCentavos - (action?.type === 'payment' ? Number(actionInvoice.gross_centavos) - (actionInvoice.payments || []).reduce((sum, payment) => sum + Number(payment.amount_applied_centavos || 0), 0) : Number(actionInvoice.gross_centavos)), 0) : 0;

  const submitAction = async (event) => {
    event.preventDefault();
    if (!actionInvoice) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (action.type === 'edit') await adminService.updatePlatformInvoiceDraft(actionInvoice.id, { gross_centavos: actionGrossCentavos, buyer: actionInvoice.buyer_snapshot || {} });
      if (action.type === 'issue') await adminService.issuePlatformInvoice(actionInvoice.id, { cash_tendered_centavos: cashCentavos, change_returned_confirmed: changeDue === 0 || actionForm.change_returned_confirmed });
      if (action.type === 'payment') await adminService.recordPlatformInvoiceCashPayment(actionInvoice.id, { cash_tendered_centavos: cashCentavos, change_returned_confirmed: changeDue === 0 || actionForm.change_returned_confirmed });
      if (action.type === 'discard') await adminService.discardPlatformInvoiceDraft(actionInvoice.id);
      if (action.type === 'credit') await adminService.creditPlatformInvoice(actionInvoice.id, { reason: actionForm.reason, confirmed: true });
      if (action.type === 'replacement') await adminService.createPlatformInvoiceReplacementDraft(actionInvoice.id, { gross_centavos: actionGrossCentavos, buyer: actionInvoice.buyer_snapshot || {} });
      setNotice({ edit: 'Draft updated. No sequence number was allocated.', issue: 'QA invoice issued with a TEST ONLY watermark.', payment: 'Cash payment recorded.', discard: 'Draft discarded.', credit: 'Full credit recorded. The original document remains unchanged.', replacement: 'Replacement QA draft created.' }[action.type]);
      setAction(null); await load();
    } catch (err) { setError(err.response?.data?.message || 'Unable to complete this invoice action.'); } finally { setBusy(false); }
  };
  const download = async (invoice) => { setBusy(true); setError(''); try { const response = await adminService.downloadPlatformInvoiceArtifact(invoice.id); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = `DGFY-${invoice.invoice_number}.pdf`; link.click(); URL.revokeObjectURL(url); setNotice('Downloaded the immutable issued PDF.'); } catch (err) { setError(err.response?.data?.message || 'Unable to download the invoice PDF.'); } finally { setBusy(false); } };
  const email = async (invoice) => { setBusy(true); setError(''); try { await adminService.deliverPlatformInvoiceEmail(invoice.id); setNotice(`Invoice email submitted for ${invoice.recipient_email_snapshot}.`); await load(); } catch (err) { setError(err.response?.data?.message || 'Unable to send the invoice email.'); } finally { setBusy(false); } };
  const actionsFor = (invoice) => <div className="flex flex-wrap gap-2">{invoice.invoice_status === 'draft' && <><Button size="sm" variant="outline" disabled={busy} onClick={() => openAction('edit', invoice)}>Edit</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => openAction('discard', invoice)}>Discard</Button><Button size="sm" disabled={busy} onClick={() => openAction('issue', invoice)}>Record cash & issue</Button></>}{invoice.invoice_status === 'issued' && invoice.payment_status !== 'paid' && <Button size="sm" disabled={busy} onClick={() => openAction('payment', invoice)}>Record cash payment</Button>}{invoice.invoice_status === 'issued' && <><Button size="sm" variant="outline" disabled={busy || !(invoice.artifacts || []).length} onClick={() => download(invoice)}>PDF</Button><Button size="sm" variant="outline" disabled={busy || !(invoice.artifacts || []).length} onClick={() => email(invoice)}>Email</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => openAction('credit', invoice)}>Full credit</Button></>}{invoice.invoice_status === 'fully_credited' && <Button size="sm" variant="outline" disabled={busy} onClick={() => openAction('replacement', invoice)}>Replacement draft</Button>}</div>;

  return <section className="mx-auto max-w-6xl space-y-5 pb-24"><header><p className="text-sm font-medium text-[#1A4E8D]">QA-only landlord billing</p><h1 className="text-3xl font-semibold text-slate-900">Platform invoices</h1><p className="mt-2 text-sm text-slate-600">Create TEST-only one-time cash records. This is not a live fiscal invoicing tool.</p></header>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}{notice && <p className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    <aside className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p className="font-semibold">TEST ONLY — fiscal seller details still incomplete</p><p className="mt-1">Sieitz Solutions OPC and the supplied logo are included. ATP/OCN, BIR permit, approved series, and CAS/EIS authority appear in red on every PDF until genuine records are provided.</p></aside>
    <form onSubmit={createDraft} className="space-y-4 rounded-xl border bg-white p-4 shadow-sm"><div className="grid gap-3 md:grid-cols-2"><label className="space-y-1 text-sm font-medium text-slate-700"><span>Approved company</span><select required className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base" value={form.registration_application_id} onChange={(event) => setForm({ ...form, registration_application_id: event.target.value })}><option value="">Choose an approved company</option>{eligibleApplications.map((application) => <option key={application.id} value={application.id}>{application.tenant?.name || application.id}</option>)}</select></label><label className="space-y-1 text-sm font-medium text-slate-700"><span>Amount (PHP)</span><Input required inputMode="decimal" placeholder="0.00" value={form.gross_pesos} onChange={(event) => setForm({ ...form, gross_pesos: event.target.value })} /></label></div>
      {selectedApplication && <div className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-semibold text-slate-900">{selectedCompanyName}</p><p className="mt-1 text-slate-600">Registration email: {selectedEmail || 'No registration email available'}</p></div>}
      <button type="button" className="text-sm font-medium text-[#1A4E8D] underline" onClick={() => setShowBuyerDetails(!showBuyerDetails)}>{showBuyerDetails ? 'Hide optional buyer tax details' : 'Add optional buyer tax details'}</button>
      {showBuyerDetails && <div className="grid gap-3 md:grid-cols-2"><Input placeholder="Buyer registered address" value={form.buyer_address} onChange={(event) => setForm({ ...form, buyer_address: event.target.value })}/><Input placeholder="Buyer TIN" value={form.buyer_tin} onChange={(event) => setForm({ ...form, buyer_tin: event.target.value })}/></div>}
      <Button className="sticky bottom-3 w-full md:static md:w-auto" disabled={busy} type="submit">Create QA draft</Button>
    </form>
    <div className="space-y-3 md:hidden">{invoices.map((invoice) => <article key={invoice.id} className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{invoice.invoice_number || 'Draft'}</p><p className="text-xs text-amber-700">TEST ONLY{invoice.invoice_kind === 'replacement' ? ' · replacement' : ''}</p></div><p className="font-semibold">{peso(invoice.gross_centavos)}</p></div><dl className="mt-3 space-y-1 text-sm text-slate-600"><div>Buyer: {invoice.buyer_snapshot?.legal_name}</div><div>Status: {invoice.invoice_status} / {invoice.payment_status}</div><div>Delivery: {invoice.deliveries?.length ? invoice.deliveries.at(-1)?.status : 'Not sent'}</div></dl><div className="mt-4">{actionsFor(invoice)}</div></article>)}{!invoices.length && <p className="rounded-xl border bg-white p-6 text-sm text-slate-500">No platform invoices yet.</p>}</div>
    <div className="hidden overflow-x-auto rounded-xl border bg-white md:block"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-slate-600"><tr><th className="p-3">Invoice</th><th className="p-3">Buyer</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Delivery</th><th className="p-3">Action</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id} className="border-t"><td className="p-3 font-medium">{invoice.invoice_number || 'Draft'}<div className="text-xs text-amber-700">TEST ONLY</div></td><td className="p-3">{invoice.buyer_snapshot?.legal_name}</td><td className="p-3">{peso(invoice.gross_centavos)}</td><td className="p-3">{invoice.invoice_status} / {invoice.payment_status}</td><td className="p-3">{invoice.deliveries?.length ? invoice.deliveries.at(-1)?.status : 'Not sent'}</td><td className="p-3">{actionsFor(invoice)}</td></tr>)}{!invoices.length && <tr><td className="p-6 text-slate-500" colSpan="6">No platform invoices yet.</td></tr>}</tbody></table></div>
    <Dialog open={Boolean(action)} onOpenChange={(open) => !open && closeAction()}><DialogContent><form onSubmit={submitAction}><DialogHeader><DialogTitle>{actionTitle}</DialogTitle><DialogDescription>{action?.type === 'discard' ? 'No invoice number has been allocated. This removes only the unissued draft.' : action?.type === 'credit' ? 'This creates an immutable full-credit record. The original invoice is not changed.' : 'Review the values before continuing.'}</DialogDescription></DialogHeader><div className="space-y-3 px-6">{['edit', 'replacement'].includes(action?.type) && <label className="block text-sm font-medium">Amount (PHP)<Input required inputMode="decimal" value={actionForm.gross_pesos} onChange={(event) => setActionForm({ ...actionForm, gross_pesos: event.target.value })}/></label>}{['issue', 'payment'].includes(action?.type) && <><p className="text-sm text-slate-600">Invoice amount: {peso(actionInvoice?.gross_centavos)}</p><label className="block text-sm font-medium">Cash received (PHP)<Input required inputMode="decimal" value={actionForm.cash_pesos} onChange={(event) => setActionForm({ ...actionForm, cash_pesos: event.target.value })}/></label>{changeDue > 0 && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={actionForm.change_returned_confirmed} onChange={(event) => setActionForm({ ...actionForm, change_returned_confirmed: event.target.checked })}/> I returned {peso(changeDue)} in change.</label>}</>}{action?.type === 'credit' && <label className="block text-sm font-medium">Reason<Input required value={actionForm.reason} onChange={(event) => setActionForm({ ...actionForm, reason: event.target.value })}/></label>}</div><DialogFooter className="gap-2"><Button type="button" variant="outline" onClick={closeAction} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy || (changeDue > 0 && !actionForm.change_returned_confirmed)}>{busy ? 'Working...' : actionTitle}</Button></DialogFooter></form></DialogContent></Dialog>
  </section>;
}
