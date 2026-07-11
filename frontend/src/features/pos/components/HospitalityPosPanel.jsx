import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import { BedDouble, CreditCard, RefreshCw } from 'lucide-react';
import {
    addHospitalityFolioLine,
    createHospitalityFolio,
    listHospitalityFolios,
    listHospitalityReservations
} from '../../hospitality/api/hospitalityApi.js';

const lineTypes = [
    { value: 'room_charge', label: 'Room charge' },
    { value: 'amenity', label: 'Amenity / paid add-on' },
    { value: 'minibar', label: 'Minibar charge' },
    { value: 'retail', label: 'Retail charge' },
    { value: 'room_service', label: 'Room service' },
    { value: 'deposit', label: 'Deposit payment' },
    { value: 'payment', label: 'Payment' },
    { value: 'refund', label: 'Refund' },
    { value: 'adjustment', label: 'Adjustment' }
];

const money = (value) => Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const today = () => new Date().toISOString().slice(0, 10);

export default function HospitalityPosPanel() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [reservations, setReservations] = useState([]);
    const [folios, setFolios] = useState([]);
    const [selectedReservationId, setSelectedReservationId] = useState('');
    const [selectedFolioId, setSelectedFolioId] = useState('');
    const [lineForm, setLineForm] = useState({
        line_type: 'amenity',
        description: '',
        quantity: 1,
        unit_price: '',
        tax_amount: 0,
        notes: ''
    });

    const loadWorkspace = useCallback(async () => {
        setLoading(true);
        try {
            const [reservationData, folioData] = await Promise.all([
                listHospitalityReservations({ limit: 50, status: 'confirmed' }),
                listHospitalityFolios({ limit: 80 })
            ]);
            setReservations(Array.isArray(reservationData) ? reservationData : []);
            setFolios(Array.isArray(folioData) ? folioData : []);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to load Hospitality POS folios.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadWorkspace();
    }, [loadWorkspace]);

    const selectedFolio = useMemo(() => (
        folios.find((folio) => String(folio.folio_id) === String(selectedFolioId)) || null
    ), [folios, selectedFolioId]);

    const openFolio = async () => {
        if (!selectedReservationId) {
            toast.error('Select a reservation before opening a folio.');
            return;
        }
        setSaving(true);
        try {
            const folio = await createHospitalityFolio({
                reservation_id: Number(selectedReservationId),
                folio_type: 'guest',
                status: 'open',
                opened_at: today()
            });
            toast.success('Guest folio opened.');
            await loadWorkspace();
            setSelectedFolioId(String(folio?.folio_id || ''));
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to open folio.');
        } finally {
            setSaving(false);
        }
    };

    const postFolioLine = async (event) => {
        event.preventDefault();
        if (!selectedFolioId) {
            toast.error('Select or open a folio before posting a charge.');
            return;
        }
        const quantity = Number(lineForm.quantity || 1);
        const unitPrice = Number(lineForm.unit_price || 0);
        if (!lineForm.description.trim() || !Number.isFinite(unitPrice)) {
            toast.error('Description and amount are required.');
            return;
        }
        setSaving(true);
        try {
            await addHospitalityFolioLine(selectedFolioId, {
                line_type: lineForm.line_type,
                description: lineForm.description.trim(),
                quantity,
                unit_amount: unitPrice,
                tax_amount: Number(lineForm.tax_amount || 0),
                total_amount: quantity * unitPrice + Number(lineForm.tax_amount || 0),
                posting_date: today(),
                notes: lineForm.notes || null
            });
            toast.success('Hospitality folio line posted.');
            setLineForm({ line_type: 'amenity', description: '', quantity: 1, unit_price: '', tax_amount: 0, notes: '' });
            await loadWorkspace();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Unable to post folio line.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="rounded-lg border border-sky-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                    <BedDouble className="h-5 w-5 text-sky-700" />
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Hospitality Front Desk POS</h2>
                        <p className="text-sm text-slate-500">Charge to room, collect deposits or balances, post refunds, and keep guest folios current.</p>
                    </div>
                </div>
                <button type="button" onClick={loadWorkspace} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                </button>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
                <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold text-slate-900">Open folio from reservation</h3>
                            <span className="text-xs text-slate-500">{reservations.length} active</span>
                        </div>
                        <select value={selectedReservationId} onChange={(event) => setSelectedReservationId(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                            <option value="">Select reservation</option>
                            {reservations.map((reservation) => (
                                <option key={reservation.reservation_id} value={reservation.reservation_id}>
                                    {reservation.public_reference} - {reservation.customer_name}
                                </option>
                            ))}
                        </select>
                        <button type="button" onClick={openFolio} disabled={saving || !selectedReservationId} className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                            Open Folio
                        </button>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold text-slate-900">Active folios</h3>
                            <span className="text-xs text-slate-500">{folios.length} total</span>
                        </div>
                        <select value={selectedFolioId} onChange={(event) => setSelectedFolioId(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                            <option value="">Select folio</option>
                            {folios.map((folio) => (
                                <option key={folio.folio_id} value={folio.folio_id}>
                                    Folio #{folio.folio_id} - {folio.status} - balance PHP {money(folio.balance)}
                                </option>
                            ))}
                        </select>
                        {selectedFolio && (
                            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                                <p><strong>Charges:</strong> PHP {money(selectedFolio.total_charges)}</p>
                                <p><strong>Payments:</strong> PHP {money(selectedFolio.total_payments)}</p>
                                <p><strong>Balance:</strong> PHP {money(selectedFolio.balance)}</p>
                            </div>
                        )}
                    </div>
                </div>

                <form onSubmit={postFolioLine} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-3 flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-sky-700" />
                        <h3 className="text-sm font-semibold text-slate-900">Post folio line</h3>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-xs font-semibold text-slate-600">
                            Type
                            <select value={lineForm.line_type} onChange={(event) => setLineForm({ ...lineForm, line_type: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                {lineTypes.map((lineType) => <option key={lineType.value} value={lineType.value}>{lineType.label}</option>)}
                            </select>
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                            Amount
                            <input type="number" min="0" step="0.01" value={lineForm.unit_price} onChange={(event) => setLineForm({ ...lineForm, unit_price: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                            Quantity
                            <input type="number" min="1" step="1" value={lineForm.quantity} onChange={(event) => setLineForm({ ...lineForm, quantity: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                            Tax
                            <input type="number" min="0" step="0.01" value={lineForm.tax_amount} onChange={(event) => setLineForm({ ...lineForm, tax_amount: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                        </label>
                        <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                            Description
                            <input value={lineForm.description} onChange={(event) => setLineForm({ ...lineForm, description: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Spa add-on, minibar item, deposit, refund..." />
                        </label>
                        <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                            Notes
                            <textarea value={lineForm.notes} onChange={(event) => setLineForm({ ...lineForm, notes: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={2} />
                        </label>
                    </div>
                    <button type="submit" disabled={saving || loading || !selectedFolioId} className="mt-3 rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                        Post to Folio
                    </button>
                </form>
            </div>
        </section>
    );
}
