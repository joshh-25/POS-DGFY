import React, { useState } from 'react';
import { Eye } from 'lucide-react';
import AdminBranchMonitorHeader from './AdminBranchMonitorHeader.jsx';
import PosMobileDataCard from './PosMobileDataCard.jsx';
import PosMobileDataDetails from './PosMobileDataDetails.jsx';
import PosShiftStateNotice from './PosShiftStateNotice.jsx';
import PosShiftTableScrollHint from './PosShiftTableScrollHint.jsx';
import PosTableActionButton from './PosTableActionButton.jsx';

export default function AdminBranchOrdersMonitor({
  orders = [],
  branchName = '',
  loading = false,
  errorMessage = '',
  formatDateTime = (value) => value || '—',
  refreshAction = null
}) {
  const [expandedOrderKey, setExpandedOrderKey] = useState('');
  const branchOrders = Array.isArray(orders) ? orders : [];
  const monitoredBranchName = String(branchName || '').trim() || 'Selected branch';

  return (
    <section
      aria-labelledby="pos-admin-branch-order-monitor-heading"
      data-testid="pos-admin-branch-order-monitor"
      className="min-w-0"
      aria-busy={loading || undefined}
    >
      <AdminBranchMonitorHeader
        headingId="pos-admin-branch-order-monitor-heading"
        title="Active Orders"
        subtitle={(
          <>
            <span className="font-bold text-[#334155]">{monitoredBranchName}</span> · View-only online orders.
          </>
        )}
        subtitleClassName="mt-1 text-sm text-[#3568B8]"
        action={refreshAction}
      />

      {errorMessage ? (
        <PosShiftStateNotice
          variant="error"
          title={branchOrders.length > 0 ? 'Refresh failed — showing last results' : ''}
          message={errorMessage}
          compact
          className="mt-3"
        />
      ) : null}
      {!errorMessage && loading && branchOrders.length === 0 ? (
        <PosShiftStateNotice variant="loading" message="Loading orders…" compact className="mt-3" />
      ) : null}
      {!errorMessage && !loading && branchOrders.length === 0 ? (
        <PosShiftStateNotice
          variant="empty"
          message={`No active online orders for ${monitoredBranchName}.`}
          compact
          className="mt-3"
        />
      ) : null}
      {branchOrders.length > 0 ? (
        <>
          <ul
            className="pos-shift-mobile-view mt-3 grid min-w-0 gap-2 min-[768px]:hidden"
            aria-label={`Active online orders for ${monitoredBranchName}`}
            data-testid="pos-admin-branch-orders-mobile-view"
          >
            {branchOrders.map((order, index) => {
              const orderKey = `${order.pos_transaction_id ?? index}-${index}`;
              const expanded = expandedOrderKey === orderKey;
              const detailsId = `admin-branch-order-mobile-details-${index}`;
              const fulfillment = String(order.fulfillment_status || 'placed').replace(/_/g, ' ');
              const orderMethod = String(order.order_method || '-').replace(/_/g, ' ');
              const paymentStatus = String(order.payment_status || 'unpaid').replace(/_/g, ' ');
              const orderReference = order.tracking_pin || `Order #${order.pos_transaction_id}`;

              return (
                <li key={`mobile-${orderKey}`} className="min-w-0">
                  <PosMobileDataCard
                    titleLabel={orderReference}
                    title={order.customer_name || 'Guest Buyer'}
                    fields={[
                      {
                        key: 'fulfillment',
                        label: 'Fulfillment',
                        value: (
                          <span className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold capitalize text-[#1A4E8D]">
                            {fulfillment}
                          </span>
                        ),
                        align: 'right'
                      },
                      { key: 'payment', label: 'Payment', value: paymentStatus, align: 'right' }
                    ]}
                    action={(
                      <PosTableActionButton
                        icon={Eye}
                        onClick={() => setExpandedOrderKey((current) => current === orderKey ? '' : orderKey)}
                        aria-expanded={expanded}
                        aria-controls={detailsId}
                        aria-label={`${expanded ? 'Hide' : 'Show'} details for ${orderReference}`}
                        title={`${expanded ? 'Hide' : 'Show'} order details`}
                      />
                    )}
                    expanded={expanded}
                    detailsId={detailsId}
                    detailsLabel={`Additional details for ${orderReference}`}
                    details={(
                      <PosMobileDataDetails
                        fields={[
                          { key: 'method', label: 'Method', value: orderMethod },
                          { key: 'created-at', label: 'Created at', value: formatDateTime(order.created_at) }
                        ]}
                      />
                    )}
                  />
                </li>
              );
            })}
          </ul>

          <div
            className="mt-3 hidden overflow-x-auto rounded-xl border border-blue-100 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D] min-[768px]:block"
            role="region"
            aria-label="Branch orders table"
            tabIndex={0}
          >
            <PosShiftTableScrollHint />
            <table
              className="w-full min-w-[780px] border-collapse text-left text-sm"
              aria-label={`Active online orders for ${monitoredBranchName}`}
            >
            <caption className="sr-only">
              Active online orders for {monitoredBranchName}, including customer, fulfillment and payment status, order method, and order time.
            </caption>
            <thead className="bg-blue-50/70 text-xs font-bold text-[#1A4E8D]">
              <tr>
                <th scope="col" className="px-4 py-3">Order</th>
                <th scope="col" className="px-4 py-3">Fulfillment</th>
                <th scope="col" className="px-4 py-3">Method</th>
                <th scope="col" className="px-4 py-3">Payment</th>
                <th scope="col" className="px-4 py-3">Created At</th>
              </tr>
            </thead>
            <tbody>
              {branchOrders.map((order) => (
                <tr
                  key={`admin-branch-order-${order.pos_transaction_id}`}
                  className="border-t border-blue-50 text-[#0B1647] transition-colors hover:bg-blue-50/30"
                >
                  <td className="px-4 py-3.5">
                    <p className="font-extrabold">{order.customer_name || 'Guest Buyer'}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {order.tracking_pin || `Order #${order.pos_transaction_id}`}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold capitalize text-[#1A4E8D]">
                      {String(order.fulfillment_status || 'placed').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 capitalize text-slate-600">
                    {String(order.order_method || '-').replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3.5 capitalize text-slate-600">
                    {String(order.payment_status || 'unpaid').replace(/_/g, ' ')}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                    {formatDateTime(order.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
