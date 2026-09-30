// #2159: transitional Legacy Promos surface for OPIS. Legacy promo codes still live in the
// `storefront_promo` / `storefront_promos` system settings; the old settings editor was frozen
// (#695/#988) and the redemption path is retired separately under #991. This page exists so an
// operator with `vouchers:manage` can inspect what remains and revoke an individual code.
//
// Deliberately read/revoke only: no create, edit, counter reset, or reactivation controls. A
// revoked entry stays visible here (with actor/time) but can no longer be redeemed or advertised.

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { usePermission } from '@/hooks/usePermission';
import { businessAdminApi, getBusinessAdminErrorMessage } from './businessAdminService.js';

const SOURCE_LABELS = Object.freeze({
    storefront_promo: 'Singular (compatibility)',
    storefront_promos: 'Plural (configured)'
});

const STATE_LABELS = Object.freeze({
    available: 'Available',
    exhausted: 'Exhausted',
    expired: 'Expired',
    not_started: 'Scheduled',
    inactive: 'Inactive',
    invalid: 'Invalid',
    revoked: 'Revoked'
});

const formatDiscount = (value) => {
    const percent = Number(value);
    return Number.isFinite(percent) && percent > 0 ? `${percent}%` : '—';
};

const formatWindow = (promo) => {
    const from = String(promo?.valid_from || '').trim();
    const until = String(promo?.valid_until || '').trim();
    const timeStart = String(promo?.valid_time_start || '').trim();
    const timeEnd = String(promo?.valid_time_end || '').trim();
    const datePart = from || until
        ? `${from || 'Any date'} → ${until || 'No end'}`
        : '';
    const timePart = timeStart || timeEnd ? `${timeStart || 'Any'} → ${timeEnd || 'Any'}` : '';
    return [datePart, timePart].filter(Boolean).join(' • ') || 'Always';
};

const formatUsage = (promo) => {
    const used = Number(promo?.used_count || 0);
    const limit = promo?.usage_limit;
    return Number.isFinite(Number(limit)) && Number(limit) > 0 ? `${used} / ${limit}` : `${used} / unlimited`;
};

export const buildLegacyPromoRevokePayload = (promo) => {
    const payload = { source_key: promo.source_key };
    if (promo.promo_id) payload.promo_id = promo.promo_id;
    if (promo.promo_code) payload.promo_code = promo.promo_code;
    if (Number.isInteger(promo.source_index)) payload.source_index = promo.source_index;
    return payload;
};

const LegacyPromosPage = () => {
    const { can } = usePermission();
    const canManage = can('vouchers:manage');
    const [promos, setPromos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [accessDenied, setAccessDenied] = useState(false);
    const [confirming, setConfirming] = useState(null);
    const [revoking, setRevoking] = useState(false);
    const [revokeError, setRevokeError] = useState('');

    const loadPromos = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        setAccessDenied(false);
        try {
            const data = await businessAdminApi.legacyPromos();
            setPromos(Array.isArray(data?.promos) ? data.promos : []);
        } catch (error) {
            if (error?.response?.status === 403) {
                setAccessDenied(true);
            } else {
                setLoadError(getBusinessAdminErrorMessage(error));
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPromos();
    }, [loadPromos]);

    const openRevokeConfirm = (promo) => {
        setRevokeError('');
        setConfirming(promo);
    };

    const closeRevokeConfirm = () => {
        if (revoking) return;
        setConfirming(null);
        setRevokeError('');
    };

    const submitRevoke = async (event) => {
        event.preventDefault();
        if (!confirming) return;
        setRevoking(true);
        setRevokeError('');
        try {
            const result = await businessAdminApi.revokeLegacyPromo(buildLegacyPromoRevokePayload(confirming));
            const code = confirming.promo_code || confirming.promo_id || 'Legacy promo';
            if (result?.idempotent_replay) {
                toast.success(`${code} was already revoked.`);
            } else {
                toast.success(`${code} revoked. New redemptions are blocked.`);
            }
            setConfirming(null);
            await loadPromos();
        } catch (error) {
            setRevokeError(getBusinessAdminErrorMessage(error));
        } finally {
            setRevoking(false);
        }
    };

    if (accessDenied) {
        return (
            <section className="business-admin-card" aria-label="Vouchers">
                <div className="business-admin-card-header">
                    <div>
                        <h2 className="business-admin-card-title">Vouchers</h2>
                        <p className="business-admin-card-subtitle">Legacy promo codes remaining in storefront settings.</p>
                    </div>
                </div>
                <div className="business-admin-card-body">
                    <p className="business-admin-alert error" role="alert">
                        Your account does not have permission to view legacy promos.
                    </p>
                </div>
            </section>
        );
    }

    return (
        <section className="business-admin-card" aria-label="Vouchers">
            <div className="business-admin-card-header">
                <div>
                    <h2 className="business-admin-card-title">Vouchers</h2>
                    <p className="business-admin-card-subtitle">
                        Legacy promo codes remaining in <code>storefront_promo</code> / <code>storefront_promos</code>.
                        Revoking a code blocks new Storefront and POS redemptions while preserving usage counters,
                        completed orders, and redemption history.
                    </p>
                </div>
                <button
                    type="button"
                    className="business-admin-button"
                    onClick={loadPromos}
                    disabled={loading}
                >
                    <RefreshCw size={14} />
                    {loading ? 'Loading…' : 'Refresh'}
                </button>
            </div>
            <div className="business-admin-card-body flush">
                {loading ? (
                    <p className="business-admin-empty">Loading legacy promos…</p>
                ) : loadError ? (
                    <p className="business-admin-alert error" role="alert">{loadError}</p>
                ) : promos.length === 0 ? (
                    <div className="business-admin-empty">
                        <Ticket size={18} />
                        <p>No legacy promo entries remain in this business&apos;s storefront settings.</p>
                    </div>
                ) : (
                    <div className="business-admin-table-wrap">
                        <table className="business-admin-table">
                            <thead>
                                <tr>
                                    <th scope="col">Code</th>
                                    <th scope="col">Source</th>
                                    <th scope="col">Discount</th>
                                    <th scope="col">Validity</th>
                                    <th scope="col">Usage</th>
                                    <th scope="col">State</th>
                                    <th scope="col">Revocation</th>
                                    <th scope="col">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {promos.map((promo, index) => {
                                    const state = String(promo.effective_state || 'invalid');
                                    const rowKey = promo.promo_id
                                        || promo.promo_code
                                        || `${promo.source_key}:${promo.source_index ?? index}`;
                                    const revocable = canManage && state === 'available';
                                    return (
                                        <tr key={rowKey}>
                                            <td>
                                                <strong>{promo.promo_code || '(no code)'}</strong>
                                                {promo.title ? <div className="legacy-promo-muted">{promo.title}</div> : null}
                                            </td>
                                            <td>{SOURCE_LABELS[promo.source_key] || promo.source_key}</td>
                                            <td>{formatDiscount(promo.discount_percent)}</td>
                                            <td>{formatWindow(promo)}</td>
                                            <td>{formatUsage(promo)}</td>
                                            <td>
                                                <span className={`legacy-promo-state is-${state}`}>
                                                    {STATE_LABELS[state] || state}
                                                </span>
                                            </td>
                                            <td>
                                                {promo.revoked
                                                    ? `${promo.revoked_by || 'Unknown operator'} • ${promo.revoked_at || 'time not recorded'}`
                                                    : '—'}
                                            </td>
                                            <td>
                                                {revocable ? (
                                                    <button
                                                        type="button"
                                                        className="business-admin-button danger"
                                                        aria-label={`Revoke ${promo.promo_code || promo.promo_id || 'legacy promo'}`}
                                                        onClick={() => openRevokeConfirm(promo)}
                                                    >
                                                        Revoke
                                                    </button>
                                                ) : (
                                                    <span className="legacy-promo-muted">
                                                        {canManage ? 'Not revocable' : 'Requires vouchers:manage'}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {confirming ? (
                <div className="business-admin-expense-modal-backdrop" role="presentation">
                    <form
                        className="business-admin-expense-modal"
                        onSubmit={submitRevoke}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="legacy-promo-revoke-title"
                    >
                        <div className="business-admin-card-title" id="legacy-promo-revoke-title">
                            Revoke legacy promo
                        </div>
                        <p className="business-admin-expense-modal-copy">
                            <strong>{confirming.promo_code || confirming.promo_id}</strong> will no longer be
                            redeemable in Storefront or POS, and will stop appearing in public discovery.
                            Its usage count, completed orders, and redemption history are preserved.
                        </p>
                        <div className="business-admin-expense-modal-record">
                            <strong>{SOURCE_LABELS[confirming.source_key] || confirming.source_key}</strong>
                            <span>{formatUsage(confirming)} used • {formatDiscount(confirming.discount_percent)} discount</span>
                        </div>
                        {revokeError ? (
                            <p className="business-admin-alert error" role="alert">{revokeError}</p>
                        ) : null}
                        <div className="legacy-promo-modal-actions">
                            <button
                                type="button"
                                className="business-admin-button"
                                onClick={closeRevokeConfirm}
                                disabled={revoking}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="business-admin-button danger"
                                disabled={revoking}
                            >
                                {revoking ? 'Revoking…' : 'Revoke code'}
                            </button>
                        </div>
                    </form>
                </div>
            ) : null}
        </section>
    );
};

export default LegacyPromosPage;
