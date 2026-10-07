import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    createCustomerDisplayTransport,
    CUSTOMER_DISPLAY_MESSAGE_TYPES,
    normalizeCustomerDisplaySessionId,
    normalizeCustomerDisplayTerminalId
} from '../services/customerDisplaySync.js';
import { CUSTOMER_DISPLAY_VIEW_STATES } from '../utils/customerDisplayProjection.js';

const CUSTOMER_DISPLAY_HEARTBEAT_MS = 4000;
const CUSTOMER_DISPLAY_TIMEOUT_MS = 12000;

const money = (value) => Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const currencySymbol = (currency) => String(currency || 'PHP').toUpperCase() === 'PHP' ? '₱' : String(currency || 'PHP').toUpperCase();

const connectionLabels = {
    waiting: 'Waiting for cashier',
    connected: 'Connected',
    disconnected: 'Connection lost',
    ended: 'Session ended'
};

const DisplaySummary = ({ snapshot }) => {
    if (!snapshot) return null;
    const symbol = currencySymbol(snapshot.currency);
    return (
        <aside data-testid="customer-display-summary" className="sticky bottom-0 min-w-0 rounded-3xl border border-white/10 bg-white p-[clamp(0.875rem,4vw,2rem)] text-slate-950 shadow-2xl shadow-black/30">
            <div className="min-w-0 space-y-3 text-[clamp(0.75rem,3.5vw,1.125rem)] font-semibold text-slate-600">
                <div className="flex min-w-0 items-center justify-between gap-3">
                    <span className="min-w-0 break-words">Subtotal</span>
                    <span className="min-w-0 max-w-[55%] break-words text-right tabular-nums">{symbol}{money(snapshot.subtotal)}</span>
                </div>
                {Number(snapshot.discount || 0) > 0 && (
                    <div className="flex min-w-0 items-center justify-between gap-3 text-rose-600">
                        <span className="min-w-0 break-words">Discount</span>
                        <span className="min-w-0 max-w-[55%] break-words text-right tabular-nums">-{symbol}{money(snapshot.discount)}</span>
                    </div>
                )}
                {Number(snapshot.serviceFees || 0) > 0 && (
                    <div className="flex min-w-0 items-center justify-between gap-3">
                        <span className="min-w-0 break-words">Service fees</span>
                        <span className="min-w-0 max-w-[55%] break-words text-right tabular-nums">{symbol}{money(snapshot.serviceFees)}</span>
                    </div>
                )}
            </div>
            <div className="mt-[clamp(1rem,4vw,1.25rem)] grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-3 border-t border-slate-200 pt-[clamp(1rem,4vw,1.25rem)]">
                <span className="min-w-0 break-words text-[clamp(0.8rem,3.8vw,1.25rem)] font-black uppercase tracking-[clamp(0.12em,0.8vw,0.18em)] text-slate-500">Total</span>
                <span data-testid="customer-display-total" className="min-w-0 max-w-full break-words text-right text-[clamp(1.75rem,9vw,3rem)] font-black tabular-nums text-[#1A4E8D]">
                    {symbol}{money(snapshot.total)}
                </span>
            </div>
        </aside>
    );
};

const DisplayItems = ({ snapshot }) => {
    if (!snapshot) return null;
    const symbol = currencySymbol(snapshot.currency);
    return (
        <section data-testid="customer-display-order" aria-label="Customer order" className="min-w-0 rounded-3xl border border-white/10 bg-slate-900/80 p-[clamp(0.875rem,4vw,1.75rem)]">
            <div className="max-h-[48vh] w-full max-w-full overflow-x-hidden overflow-y-auto">
                <table data-testid="customer-display-items" className="w-full table-fixed border-collapse text-left">
                    <caption className="sr-only">Current customer order items</caption>
                    <colgroup>
                        <col className="w-[60%]" />
                        <col className="w-[15%]" />
                        <col className="w-[25%]" />
                    </colgroup>
                    <thead>
                        <tr className="border-b border-white/15 text-[clamp(0.625rem,2.5vw,0.8rem)] font-extrabold uppercase tracking-[0.08em] text-slate-400">
                            <th scope="col" className="px-2 pb-3 pr-3">Item name</th>
                            <th scope="col" className="px-2 pb-3 text-center">Qty</th>
                            <th scope="col" className="px-2 pb-3 pl-3 text-right">Total price</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                        {snapshot.items.map((item) => (
                            <tr key={item.key} data-testid="customer-display-item" className="text-[clamp(0.75rem,3vw,1rem)]">
                                <td className="min-w-0 break-words py-3 pr-3 font-bold text-white [overflow-wrap:anywhere]">
                                    <p>{item.name}</p>
                                    {item.options.length > 0 && (
                                        <p className="mt-1 break-words text-[clamp(0.625rem,2.5vw,0.8rem)] font-semibold text-sky-200 [overflow-wrap:anywhere]">{item.options.join(' · ')}</p>
                                    )}
                                </td>
                                <td className="px-2 py-3 text-center font-semibold tabular-nums text-slate-300">{item.quantity}</td>
                                <td className="whitespace-nowrap py-3 pl-3 text-right text-[clamp(0.8rem,3.2vw,1.05rem)] font-extrabold tabular-nums text-white">{symbol}{money(item.lineTotal)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

const PAYMENT_METHOD_LABELS = {
    cash: 'Cash',
    card: 'Card',
    gcash: 'GCash',
    maya: 'Maya',
    bank_transfer: 'Bank transfer',
    employee_credit: 'Employee credit',
    qrph: 'QR Ph',
    grab_pay: 'GrabPay',
    shopeepay: 'ShopeePay',
    cheque: 'Cheque',
    split: 'Split payment'
};

const DisplayCompleted = ({ snapshot }) => {
    if (!snapshot) return null;
    const symbol = currencySymbol(snapshot.currency);
    const payment = snapshot.paymentSummary || {};
    const totalDue = Number.isFinite(Number(payment.totalDue)) ? Number(payment.totalDue) : Number(snapshot.total || 0);
    const amountPaid = Number.isFinite(Number(payment.amountPaid)) ? Number(payment.amountPaid) : totalDue;
    const changeAmount = Number.isFinite(Number(payment.changeAmount)) ? Number(payment.changeAmount) : 0;
    const paymentType = String(payment.paymentType || '').trim().toLowerCase();
    const paymentMethodLabel = PAYMENT_METHOD_LABELS[paymentType] || 'Payment';

    return (
        <section data-testid="customer-display-completed" className="flex min-h-[clamp(16rem,48vh,36rem)] min-w-0 flex-col justify-center rounded-3xl border border-emerald-300/20 bg-slate-900/80 p-[clamp(1rem,4vw,2rem)]">
            <div className="text-center">
                <p className="text-[clamp(0.625rem,2.5vw,0.8rem)] font-extrabold uppercase tracking-[0.2em] text-emerald-300">Payment confirmed</p>
                <h1 className="mt-3 break-words text-[clamp(1.75rem,7vw,3rem)] font-black tracking-tight text-white">Thank you!</h1>
                <p className="mt-2 break-words text-[clamp(0.75rem,3vw,1rem)] font-semibold text-slate-400">Your payment was received successfully.</p>
            </div>
            <dl data-testid="customer-display-payment-summary" className="mx-auto mt-[clamp(1.5rem,5vw,2.5rem)] w-full max-w-xl space-y-3 rounded-2xl border border-white/10 bg-white/[0.06] p-[clamp(0.875rem,4vw,1.5rem)] text-[clamp(0.75rem,3vw,1rem)]">
                <div className="flex items-center justify-between gap-3 text-slate-300">
                    <dt>Total due</dt>
                    <dd className="whitespace-nowrap text-right font-bold tabular-nums text-white">{symbol}{money(totalDue)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 text-slate-300">
                    <dt>Paid</dt>
                    <dd className="whitespace-nowrap text-right font-bold tabular-nums text-white">{symbol}{money(amountPaid)}</dd>
                </div>
                {payment.isCash === true && (
                    <div data-testid="customer-display-payment-change" className="flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-emerald-200">
                        <dt>Change</dt>
                        <dd className="whitespace-nowrap text-right text-[clamp(1rem,4vw,1.35rem)] font-black tabular-nums">{symbol}{money(changeAmount)}</dd>
                    </div>
                )}
                <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-slate-400">
                    <dt>Payment method</dt>
                    <dd className="text-right font-semibold text-slate-200">{paymentMethodLabel}</dd>
                </div>
            </dl>
        </section>
    );
};

function CustomerDisplaySession({ sessionId, terminalId }) {
    const [connection, setConnection] = useState(sessionId ? 'waiting' : 'disconnected');
    const [snapshot, setSnapshot] = useState(null);

    useEffect(() => {
        if (!sessionId) return undefined;

        let latestRevision = 0;
        let lastSeenAt = Date.now();
        let sessionEnded = false;
        let hasReceivedSnapshot = false;
        const updateConnection = (nextConnection) => {
            setConnection(nextConnection);
        };
        const transport = createCustomerDisplayTransport({
            role: 'display',
            sessionId,
            terminalId,
            targetWindow: typeof window !== 'undefined' ? window.opener : null,
            onMessage: (message) => {
                lastSeenAt = Date.now();
                if (message.messageType === CUSTOMER_DISPLAY_MESSAGE_TYPES.SNAPSHOT) {
                    if (message.revision <= latestRevision) return;
                    latestRevision = message.revision;
                    hasReceivedSnapshot = true;
                    setSnapshot(message.payload);
                    updateConnection('connected');
                    return;
                }
                if (message.messageType === CUSTOMER_DISPLAY_MESSAGE_TYPES.CLEAR) {
                    if (message.revision < latestRevision) return;
                    latestRevision = message.revision;
                    hasReceivedSnapshot = false;
                    setSnapshot(null);
                    updateConnection('connected');
                    return;
                }
                if (message.messageType === CUSTOMER_DISPLAY_MESSAGE_TYPES.CLOSE) {
                    sessionEnded = true;
                    updateConnection('ended');
                    return;
                }
                if (message.messageType === CUSTOMER_DISPLAY_MESSAGE_TYPES.HEARTBEAT) {
                    if (!sessionEnded) updateConnection('connected');
                }
            }
        });

        const sendReady = () => transport.send(CUSTOMER_DISPLAY_MESSAGE_TYPES.READY, {}, latestRevision);
        sendReady();
        const readyTimer = setInterval(() => {
            if (!hasReceivedSnapshot && !sessionEnded) sendReady();
        }, 3000);
        const heartbeatTimer = setInterval(() => {
            if (!sessionEnded) transport.send(CUSTOMER_DISPLAY_MESSAGE_TYPES.HEARTBEAT, {}, latestRevision);
        }, CUSTOMER_DISPLAY_HEARTBEAT_MS);
        const healthTimer = setInterval(() => {
            if (!sessionEnded && Date.now() - lastSeenAt > CUSTOMER_DISPLAY_TIMEOUT_MS) {
                // Allow the display to re-handshake after it has already
                // received a snapshot. Without resetting this flag, READY
                // messages stop permanently after the first snapshot.
                hasReceivedSnapshot = false;
                updateConnection('disconnected');
            }
        }, 1000);

        return () => {
            clearInterval(readyTimer);
            clearInterval(heartbeatTimer);
            clearInterval(healthTimer);
            transport.close();
        };
    }, [sessionId, terminalId]);

    const viewState = connection === 'ended'
        ? 'ended'
        : snapshot?.viewState || CUSTOMER_DISPLAY_VIEW_STATES.WAITING;
    const showCompleted = Boolean(snapshot) && viewState === CUSTOMER_DISPLAY_VIEW_STATES.COMPLETED;
    const showOrder = Boolean(snapshot) && [
        CUSTOMER_DISPLAY_VIEW_STATES.ACTIVE,
        CUSTOMER_DISPLAY_VIEW_STATES.PAYMENT
    ].includes(viewState);

    return (
        <main data-testid="customer-display" className="min-h-screen w-full min-w-0 overflow-x-hidden bg-[#07111f] text-white selection:bg-sky-300 selection:text-slate-950">
            <div className="mx-auto flex min-h-screen w-full min-w-0 max-w-[1500px] flex-col px-[clamp(1rem,4vw,2rem)] py-[clamp(1rem,4vw,1.75rem)]">
                <div data-testid="customer-display-connection" className="sr-only" role="status" aria-live="polite">
                    {connectionLabels[connection] || 'Waiting for cashier'}
                </div>

                {connection === 'disconnected' && (
                    <div data-testid="customer-display-disconnected" role="alert" className="mt-4 min-w-0 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-[clamp(0.75rem,4vw,1rem)] py-[clamp(0.625rem,3vw,0.75rem)] text-[clamp(0.75rem,3.2vw,1rem)] font-bold text-amber-100">
                        The cashier display connection was interrupted. Please ask the cashier to reconnect this screen.
                    </div>
                )}

                <div data-testid="customer-display-state" data-state={viewState} className="grid min-h-0 min-w-0 flex-1 gap-[clamp(1rem,4vw,1.75rem)] py-[clamp(1rem,4vw,1.75rem)] lg:grid-cols-[minmax(0,1fr)_minmax(20rem,34rem)] lg:items-start">
                    {showCompleted ? (
                        <DisplayCompleted snapshot={snapshot} />
                    ) : showOrder ? (
                        <DisplayItems snapshot={snapshot} />
                    ) : (
                        <section className="flex min-h-[clamp(16rem,48vh,36rem)] min-w-0 items-center justify-center rounded-3xl border border-white/10 bg-slate-900/80 p-[clamp(1.25rem,5vw,3rem)] text-center">
                            <div className="min-w-0 max-w-xl">
                                <p className="text-xs font-bold uppercase tracking-[0.24em] text-sky-300">{viewState === 'ended' ? 'Session closed' : 'Welcome'}</p>
                                <h1 className="mt-4 break-words text-[clamp(1.75rem,8vw,3.75rem)] font-black tracking-tight text-white">
                                    {viewState === 'ended' ? 'Display session ended' : 'Your order will appear here'}
                                </h1>
                                <p className="mt-5 break-words text-[clamp(0.875rem,3.6vw,1.25rem)] font-semibold leading-7 text-slate-400">
                                    {viewState === 'ended'
                                        ? 'This customer display is no longer connected to the cashier.'
                                        : 'Items added by the cashier will be shown on this screen.'}
                                </p>
                            </div>
                        </section>
                    )}

                    {(showOrder || showCompleted) && <DisplaySummary snapshot={snapshot} />}
                </div>
            </div>
        </main>
    );
}
export default function CustomerDisplayPage() {
    const [searchParams] = useSearchParams();
    const sessionId = normalizeCustomerDisplaySessionId(searchParams.get('sessionId'));
    const terminalId = normalizeCustomerDisplayTerminalId(searchParams.get('terminalId'));
    return <CustomerDisplaySession key={`${sessionId}:${terminalId}`} sessionId={sessionId} terminalId={terminalId} />;
}
