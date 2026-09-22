import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Plus, Search, Filter, Eye, Package, CheckCircle, Clock, FileEdit, XCircle, Archive, ArchiveRestore, QrCode, ClipboardList, Wallet } from 'lucide-react';
import { usePurchaseOrders, useCreatePurchaseOrder, useReceivePurchaseOrder, useArchivePurchaseOrder, useRestorePurchaseOrder } from '@/hooks/usePurchaseOrders.js';
import { useSuppliers } from '@/hooks/useSuppliers.js';
import { useItems } from '@/hooks/useItems.js';
import * as purchaseOrderService from '@/services/purchaseOrderService.js';
import POCreateWizard from '@/components/po/POCreateWizard';
import PODetailsModal from '@/components/po/PODetailsModal';
import POReceiptModal from '@/components/po/POReceiptModal';
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog';
import { toast } from 'sonner';
import { formatPeso } from '@/lib/numberUtils.js';
import { usePermission } from '@/hooks/usePermission';
import QRCodeModal from '@/components/common/QRCodeModal';
import { generateReceiveToken } from '@/services/receiveTokenService.js';
import { normalizeApiError } from '@/src/utils/errorHandler.js';

const statusConfig = {
  draft: { label: "Draft", tone: "", icon: FileEdit },
  pending: { label: "Pending", tone: "warning", icon: Clock },
  partial: { label: "Partial", tone: "", icon: Package },
  received: { label: "Received", tone: "completed", icon: CheckCircle },
  cancelled: { label: "Cancelled", tone: "critical", icon: XCircle }
};

const formatStatusLabel = (status) => String(status || 'unknown')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const getStatusConfig = (status) => statusConfig[status] || {
  label: formatStatusLabel(status),
  tone: '',
  icon: Clock
};

const formatCount = (value) => Number(value || 0).toLocaleString('en-US');

const PurchaseOrderStatus = ({ status }) => {
  const config = getStatusConfig(status);
  const StatusIcon = config.icon;
  return (
    <span className={`business-admin-status ${config.tone}`}>
      <StatusIcon size={12} />
      {config.label}
    </span>
  );
};

const PurchaseOrderSummaryMetric = ({ icon: Icon, label, value, detail, tone = '' }) => (
  <div className={`business-admin-card business-admin-purchase-orders-metric ${tone}`}>
    <div className="business-admin-purchase-orders-metric-icon"><Icon size={18} /></div>
    <div className="business-admin-purchase-orders-metric-copy">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  </div>
);

const PurchaseOrdersSectionCard = ({ title, subtitle, action, children }) => (
  <section className="business-admin-card business-admin-purchase-orders-section">
    <div className="business-admin-card-header">
      <div>
        <div className="business-admin-card-title">{title}</div>
        {subtitle ? <div className="business-admin-card-subtitle">{subtitle}</div> : null}
      </div>
      {action || null}
    </div>
    <div className="business-admin-card-body flush">{children}</div>
  </section>
);

const PurchaseOrderActions = ({
  po,
  archived,
  canReceive,
  canArchive,
  restoring,
  onView,
  onReceive,
  onGenerateQR,
  onArchive,
  onRestore
}) => (
  <div className="business-admin-purchase-orders-actions">
    <button
      type="button"
      className="business-admin-button business-admin-purchase-orders-action"
      onClick={() => onView(po)}
      aria-label={`View purchase order ${po.po_number}`}
      title="View details"
    >
      <Eye size={14} /><span className="business-admin-purchase-orders-action-label">View</span>
    </button>
    {!archived && po.status !== 'received' && canReceive ? (
      <button
        type="button"
        className="business-admin-button primary business-admin-purchase-orders-action"
        onClick={() => onReceive(po)}
        aria-label={`Receive purchase order ${po.po_number}`}
      >
        <Package size={14} /><span className="business-admin-purchase-orders-action-label">Receive</span>
      </button>
    ) : null}
    {!archived && (po.status === 'pending' || po.status === 'partial') ? (
      <button
        type="button"
        className="business-admin-button business-admin-purchase-orders-action"
        onClick={() => onGenerateQR(po)}
        aria-label={`Generate receiving QR code for ${po.po_number}`}
        title="Generate receiving QR code"
      >
        <QrCode size={14} /><span className="business-admin-purchase-orders-action-label">QR</span>
      </button>
    ) : null}
    {!archived && canArchive ? (
      <button
        type="button"
        className="business-admin-button business-admin-purchase-orders-action"
        onClick={() => onArchive(po)}
        aria-label={`Archive purchase order ${po.po_number}`}
        title="Archive purchase order"
      >
        <Archive size={14} /><span className="business-admin-purchase-orders-action-label">Archive</span>
      </button>
    ) : null}
    {archived && canArchive ? (
      <button
        type="button"
        className="business-admin-button business-admin-purchase-orders-action"
        onClick={() => onRestore(po)}
        disabled={restoring}
        aria-label={`Restore purchase order ${po.po_number}`}
      >
        <ArchiveRestore size={14} /><span className="business-admin-purchase-orders-action-label">Restore</span>
      </button>
    ) : null}
  </div>
);

const PurchaseOrderMobileCard = ({ po, ...actionProps }) => {
  const supplier = po.supplier_name || po.Supplier?.name || 'Supplier not recorded';
  return (
    <article className="business-admin-purchase-order-card">
      <div className="business-admin-purchase-order-card-heading">
        <div className="business-admin-purchase-order-card-identity">
          <div className="business-admin-purchase-order-card-icon"><ClipboardList size={16} /></div>
          <div className="business-admin-purchase-order-card-copy">
            <strong>{po.po_number}</strong>
            <span>{supplier}</span>
          </div>
        </div>
        <PurchaseOrderStatus status={po.status} />
      </div>
      <div className="business-admin-purchase-order-card-facts">
        <div><span>Items</span><strong>{formatCount(po.item_count)} items</strong></div>
        <div><span>Total</span><strong>{formatPeso(po.total_amount)}</strong></div>
        <div><span>Ordered</span><strong>{po.order_date || '—'}</strong></div>
        <div><span>Expected</span><strong>{po.expected_delivery_date || '—'}</strong></div>
      </div>
      <PurchaseOrderActions po={po} {...actionProps} />
    </article>
  );
};

const resolveWeightedAvgCost = (itemData = {}) => Number(
  itemData.weighted_avg_cost
  ?? itemData?.cost_metrics?.scoped?.weighted_avg_cost
  ?? itemData?.cost_metrics?.global?.weighted_avg_cost
  ?? itemData.cost_per_unit
  ?? 0
);

const transformPurchaseOrderForModal = (fullPO, fallbackPo = {}) => {
  const lineItems = fullPO.lineItems || fullPO.LineItems || [];
  const items = lineItems.map((lineItem) => {
    const lineItemData = lineItem.toJSON ? lineItem.toJSON() : lineItem;
    const itemData = lineItemData.item || lineItemData.Item || {};
    const itemName = itemData.name || itemData.item_name || lineItemData.item_name;
    const weightedAvgCost = resolveWeightedAvgCost(itemData);

    return {
      line_item_id: lineItemData.line_item_id,
      item_id: lineItemData.item_id,
      item_name: itemName,
      quantity: lineItemData.quantity_ordered,
      quantity_received: lineItemData.quantity_received || 0,
      unit_price: lineItemData.unit_price,
      total_price: lineItemData.total_price,
      expiry_date: lineItemData.expiry_date,
      fifo_enabled: Boolean(itemData.fifo_enabled),
      shelf_life_days: itemData.shelf_life_days ?? null,
      cost_metrics: itemData.cost_metrics || null,
      weighted_avg_cost: weightedAvgCost > 0 ? weightedAvgCost : null,
      quality_check: lineItemData.quality_check_status === 'passed' ? 'pass'
        : lineItemData.quality_check_status === 'failed' ? 'fail' : 'pass'
    };
  });

  const poData = fullPO.toJSON ? fullPO.toJSON() : fullPO;
  const supplierData = poData.supplier || poData.Supplier || {};
  return {
    ...poData,
    items,
    supplier_name: supplierData.name || fallbackPo.supplier_name,
    po_number: poData.po_number || fallbackPo.po_number
  };
};

export default function PurchaseOrders() {
  const [showArchivedTab, setShowArchivedTab] = useState(false);
  const {
    purchaseOrders,
    loading,
    error,
    refetch,
    hasLoaded: purchaseOrdersLoaded
  } = usePurchaseOrders({ archived: showArchivedTab ? 'true' : 'false' });
  const { suppliers, loading: suppliersLoading } = useSuppliers();
  const [valuationLocationId, setValuationLocationId] = useState('');
  const itemQuery = useMemo(() => ({
    limit: 1000,
    fields: 'dropdown',
    ...(valuationLocationId ? { valuation_location_id: valuationLocationId } : {})
  }), [valuationLocationId]);
  const { items, loading: itemsLoading } = useItems(itemQuery);
  const [supportingDataReady, setSupportingDataReady] = useState(false);
  const { createPurchaseOrder } = useCreatePurchaseOrder();
  const { receivePurchaseOrder } = useReceivePurchaseOrder();
  const { archivePurchaseOrder, loading: archiving } = useArchivePurchaseOrder();
  const { restorePurchaseOrder, loading: restoring } = useRestorePurchaseOrder();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedPO, setSelectedPO] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showCreateWizard, setShowCreateWizard] = useState(() => (
    new URLSearchParams(window.location.search).get('action') === 'create'
  ));
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [initialItemId, setInitialItemId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') !== 'create') return null;
    return params.get('itemId');
  });
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [poToArchive, setPoToArchive] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrPO, setQrPO] = useState(null);
  const [receiptLocationRefreshing, setReceiptLocationRefreshing] = useState(false);
  const receiptFetchRequestRef = useRef(0);
  const { canCreate, canDelete, can } = usePermission();

  useEffect(() => {
    if (!suppliersLoading && !itemsLoading) setSupportingDataReady(true);
  }, [itemsLoading, suppliersLoading]);

  // Check URL params for deep linking
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'create') {
      // Clean up URL without reload.
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const filteredPOs = useMemo(() => {
    if (!purchaseOrders) return [];
    return purchaseOrders.filter(po => {
      const matchesSearch =
        po.po_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (po.supplier_name || po.Supplier?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || po.status === statusFilter;
      return matchesSearch && matchesStatus;
    }).sort((a, b) => new Date(b.order_date) - new Date(a.order_date));
  }, [purchaseOrders, searchQuery, statusFilter]);

  const purchaseOrderSummary = useMemo(() => {
    const awaitingReceipt = filteredPOs.filter((po) => po.status === 'pending' || po.status === 'partial').length;
    const received = filteredPOs.filter((po) => po.status === 'received').length;
    const totalValue = filteredPOs.reduce((total, po) => total + (Number(po.total_amount) || 0), 0);
    return { awaitingReceipt, received, totalValue };
  }, [filteredPOs]);

  const buildValuationParams = (locationId = valuationLocationId) => (
    locationId ? { valuation_location_id: locationId } : {}
  );

  const handleView = async (po) => {
    try {
      const fullPO = await purchaseOrderService.getPurchaseOrderById(
        po.po_id || po.id,
        buildValuationParams()
      );
      setSelectedPO(transformPurchaseOrderForModal(fullPO, po));
      setShowDetailsModal(true);
    } catch (error) {
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error('Failed to load purchase order details');
      }
    }
  };

  const handleReceive = async (po) => {
    try {
      const fullPO = await purchaseOrderService.getPurchaseOrderById(
        po.po_id || po.id,
        buildValuationParams()
      );
      setSelectedPO(transformPurchaseOrderForModal(fullPO, po));
      setShowReceiptModal(true);
    } catch (error) {
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error('Failed to load purchase order details');
      }
    }
  };

  const handleReceiptLocationChange = async (locationId) => {
    const poId = selectedPO?.po_id || selectedPO?.id;
    const normalizedLocationId = Number.parseInt(locationId, 10);
    if (!poId || !Number.isInteger(normalizedLocationId) || normalizedLocationId <= 0) {
      return;
    }

    const requestId = receiptFetchRequestRef.current + 1;
    receiptFetchRequestRef.current = requestId;
    setReceiptLocationRefreshing(true);

    try {
      const fullPO = await purchaseOrderService.getPurchaseOrderById(
        poId,
        { valuation_location_id: normalizedLocationId }
      );
      if (receiptFetchRequestRef.current !== requestId) return;

      setSelectedPO((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...transformPurchaseOrderForModal(fullPO, prev)
        };
      });
      setValuationLocationId(String(normalizedLocationId));
    } catch (error) {
      if (receiptFetchRequestRef.current === requestId && !normalizeApiError(error).isGlobalCandidate) {
        toast.error('Failed to refresh location-based average cost');
      }
    } finally {
      if (receiptFetchRequestRef.current === requestId) {
        setReceiptLocationRefreshing(false);
      }
    }
  };

  const handleCreatePO = async (poData) => {
    try {
      await createPurchaseOrder(poData);
      toast.success('Purchase order created successfully');
      refetch();
      setShowCreateWizard(false);
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error("You do not have permission to create Purchase Orders.");
      } else {
        if (!normalizeApiError(error).isGlobalCandidate) {
          toast.error(error.message || 'Failed to create purchase order');
        }
      }
    }
  };

  const handleReceiptConfirm = async (receiptData) => {
    try {
      if (!receiptData.location_id) {
        toast.error('Please select a location before confirming receipt.');
        return;
      }
      // Transform receipt data to match backend expectations
      const line_items = (receiptData.items || []).map(item => {
        // Map quality_check ('pass'/'fail') to quality_check_status ('passed'/'failed')
        const quality_check_status = item.quality_check === 'pass' ? 'passed' :
          item.quality_check === 'fail' ? 'failed' : 'pending';

        return {
          line_item_id: item.line_item_id || item.item_id, // Use line_item_id if available, fallback to item_id
          quantity_received: item.quantity_received || item.quantity || 0,
          quality_check_status: quality_check_status
        };
      });

      const transformedData = {
        location_id: receiptData.location_id,
        line_items: line_items,
        delivery_rating: receiptData.delivery_rating,
        notes: receiptData.notes
      };

      await receivePurchaseOrder(selectedPO.po_id || selectedPO.id, transformedData);
      setValuationLocationId(String(receiptData.location_id));
      toast.success('Purchase order received successfully');
      refetch();
      setShowReceiptModal(false);
      setSelectedPO(null);
      setReceiptLocationRefreshing(false);
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error("You do not have permission to receive Purchase Orders.");
      } else {
        if (!normalizeApiError(error).isGlobalCandidate) {
          toast.error(error.message || 'Failed to receive purchase order');
        }
      }
    }
  };

  const handleArchiveClick = (po) => {
    setPoToArchive(po);
    setShowArchiveDialog(true);
  };

  const handleConfirmArchive = async () => {
    if (!poToArchive) return;

    try {
      await archivePurchaseOrder(poToArchive.po_id || poToArchive.id);
      toast.success('Purchase Order archived successfully');
      setShowArchiveDialog(false);
      setPoToArchive(null);
      refetch();
    } catch (error) {
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error(error.response?.data?.message || error.message);
      }
      setShowArchiveDialog(false);
      setPoToArchive(null);
    }
  };

  const handleRestore = async (po) => {
    try {
      await restorePurchaseOrder(po.po_id || po.id);
      toast.success('Purchase Order restored successfully');
      refetch();
    } catch (error) {
      if (!normalizeApiError(error).isGlobalCandidate) {
        toast.error(error.response?.data?.message || error.message);
      }
    }
  };

  const canArchive = canDelete('purchase_orders');

  const handleGenerateQR = (po) => {
    setQrPO(po);
    setShowQRModal(true);
  };

  const handleQRTokenGenerate = async (orderType, orderId) => {
    return await generateReceiveToken(orderType, orderId);
  };

  const isInitialLoading = !purchaseOrdersLoaded || !supportingDataReady;
  const isRefreshing = loading && purchaseOrdersLoaded;

  if (isInitialLoading && !error) {
    return (
      <div className="business-admin-loading"><span className="business-admin-spinner" /> Loading purchase orders...</div>
    );
  }

  if (error && !purchaseOrdersLoaded) {
    return (
      <div className="business-admin-alert error"><XCircle size={17} /><div><strong>Error loading purchase orders</strong><div>{error}</div></div></div>
    );
  }

  const hasPurchaseOrders = Array.isArray(purchaseOrders) && purchaseOrders.length > 0;
  const emptyMessage = hasPurchaseOrders
    ? 'No purchase orders match the current search and status filters.'
    : (showArchivedTab ? 'No archived purchase orders are available.' : 'No active purchase orders are available.');

  return (
    <div className="business-admin-purchase-orders-workspace" data-testid="business-admin-purchase-orders-workspace">
      <div className="business-admin-purchase-orders-toolbar">
        <div className="business-admin-purchase-orders-toolbar-copy">
          <div className="business-admin-kicker">Procurement workspace</div>
          <span>Track supplier commitments, receipts, and purchase-order history.</span>
        </div>
        {canCreate('purchase_orders') ? (
          <button type="button" className="business-admin-button primary" onClick={() => setShowCreateWizard(true)}>
            <Plus size={15} /> Create purchase order
          </button>
        ) : null}
      </div>

      <div className="business-admin-purchase-orders-summary" aria-label="Purchase order summary">
        <PurchaseOrderSummaryMetric
          icon={ClipboardList}
          label="Orders in view"
          value={formatCount(filteredPOs.length)}
          detail={showArchivedTab ? 'Archived records' : 'Active records'}
        />
        <PurchaseOrderSummaryMetric
          icon={Clock}
          label="Awaiting receipt"
          value={formatCount(purchaseOrderSummary.awaitingReceipt)}
          detail="Pending or partial"
          tone={purchaseOrderSummary.awaitingReceipt ? 'warning' : 'teal'}
        />
        <PurchaseOrderSummaryMetric
          icon={CheckCircle}
          label="Received orders"
          value={formatCount(purchaseOrderSummary.received)}
          detail="Completed receipts"
          tone="teal"
        />
        <PurchaseOrderSummaryMetric
          icon={Wallet}
          label="Order value"
          value={formatPeso(purchaseOrderSummary.totalValue)}
          detail="Filtered purchase value"
        />
      </div>

      <div className="business-admin-purchase-orders-context" role="note">
        <ClipboardList size={17} />
        <div>
          <strong>Canonical purchasing records</strong>
          <span>Create, receive, archive, and review purchase orders here. Inventory changes are applied when receipts are confirmed.</span>
        </div>
      </div>

      <div className="business-admin-card business-admin-purchase-orders-filter-card">
        <div className="business-admin-purchase-orders-filter-heading">
          <div>
            <div className="business-admin-kicker">Purchase order view</div>
            <strong>{showArchivedTab ? 'Archived records' : 'Active records'}</strong>
          </div>
          <div className="business-admin-purchase-orders-view-switch" role="group" aria-label="Purchase order view">
            <button
              type="button"
              className={`business-admin-purchase-orders-view-button ${!showArchivedTab ? 'active' : ''}`}
              onClick={() => setShowArchivedTab(false)}
              aria-pressed={!showArchivedTab}
            >
              <ClipboardList size={14} /> Active purchase orders
            </button>
            <button
              type="button"
              className={`business-admin-purchase-orders-view-button ${showArchivedTab ? 'active archived' : ''}`}
              onClick={() => setShowArchivedTab(true)}
              aria-pressed={showArchivedTab}
            >
              <Archive size={14} /> Archived
            </button>
          </div>
        </div>
        <div className="business-admin-purchase-orders-filter-row">
          <label className="business-admin-purchase-orders-field" htmlFor="purchase-orders-search">
            <span>Search</span>
            <div className="business-admin-purchase-orders-input-wrap">
              <Search size={15} />
              <input
                id="purchase-orders-search"
                type="search"
                placeholder="PO number or supplier"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          </label>
          <label className="business-admin-purchase-orders-field" htmlFor="purchase-orders-status">
            <span>Status</span>
            <div className="business-admin-purchase-orders-select-wrap">
              <Filter size={14} />
              <select id="purchase-orders-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="pending">Pending</option>
                <option value="partial">Partial</option>
                <option value="received">Received</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </label>
        </div>
      </div>

      <PurchaseOrdersSectionCard
        title={showArchivedTab ? 'Archived purchase orders' : 'Active purchase orders'}
        subtitle={`${formatCount(filteredPOs.length)} ${filteredPOs.length === 1 ? 'order' : 'orders'} in the current view`}
        action={<span className="business-admin-purchase-orders-count">{formatCount(filteredPOs.length)} shown</span>}
      >
        <div
          className={`business-admin-purchase-orders-results ${isRefreshing ? 'is-refreshing' : ''}`}
          aria-busy={isRefreshing}
        >
          <div className="business-admin-purchase-orders-results-content">
            {error ? (
              <div className="business-admin-alert error business-admin-purchase-orders-panel-error">
                <XCircle size={17} />
                <div><strong>Error loading purchase orders</strong><div>{error}</div></div>
              </div>
            ) : filteredPOs.length ? (
              <>
                <div className="business-admin-purchase-orders-table-view">
                  <div className="business-admin-table-wrap">
                    <table className="business-admin-table">
                      <thead>
                        <tr>
                          <th>PO number</th>
                          <th>Supplier</th>
                          <th>Items</th>
                          <th>Total</th>
                          <th>Order date</th>
                          <th>Expected</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPOs.map((po) => (
                          <tr key={po.po_id || po.id}>
                            <td><strong>{po.po_number}</strong></td>
                            <td>{po.supplier_name || po.Supplier?.name || 'Supplier not recorded'}</td>
                            <td>{formatCount(po.item_count)} items</td>
                            <td><strong>{formatPeso(po.total_amount)}</strong></td>
                            <td>{po.order_date || '—'}</td>
                            <td>{po.expected_delivery_date || '—'}</td>
                            <td><PurchaseOrderStatus status={po.status} /></td>
                            <td>
                              <PurchaseOrderActions
                                po={po}
                                archived={showArchivedTab}
                                canReceive={can('po:receive')}
                                canArchive={canArchive}
                                restoring={restoring}
                                onView={handleView}
                                onReceive={handleReceive}
                                onGenerateQR={handleGenerateQR}
                                onArchive={handleArchiveClick}
                                onRestore={handleRestore}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="business-admin-purchase-orders-mobile-view">
                  <div className="business-admin-purchase-order-card-list">
                    {filteredPOs.map((po) => (
                      <PurchaseOrderMobileCard
                        key={po.po_id || po.id}
                        po={po}
                        archived={showArchivedTab}
                        canReceive={can('po:receive')}
                        canArchive={canArchive}
                        restoring={restoring}
                        onView={handleView}
                        onReceive={handleReceive}
                        onGenerateQR={handleGenerateQR}
                        onArchive={handleArchiveClick}
                        onRestore={handleRestore}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : <div className="business-admin-empty">{emptyMessage}</div>}
          </div>
          {isRefreshing ? (
            <div className="business-admin-purchase-orders-loading" role="status" aria-live="polite">
              <span className="business-admin-spinner" />
              Loading {showArchivedTab ? 'archived' : 'active'} purchase orders...
            </div>
          ) : null}
        </div>
      </PurchaseOrdersSectionCard>

      {/* Modals */}
      {
        showCreateWizard && (
          <POCreateWizard
            open={showCreateWizard}
            onClose={() => {
              setShowCreateWizard(false);
              setInitialItemId(null);
            }}
            onSubmit={handleCreatePO}
            suppliers={suppliers?.filter(s => s.status === 'active') || []}
            items={items || []}
            initialItemId={initialItemId}
          />
        )
      }

      <PODetailsModal
        po={selectedPO}
        open={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
      />

      {
        showReceiptModal && selectedPO && (
          <POReceiptModal
            po={selectedPO}
            open={showReceiptModal}
            onClose={() => {
              receiptFetchRequestRef.current += 1;
              setReceiptLocationRefreshing(false);
              setShowReceiptModal(false);
            }}
            onConfirm={handleReceiptConfirm}
            onLocationChange={handleReceiptLocationChange}
            locationUpdating={receiptLocationRefreshing}
          />
        )
      }

      {/* QR Code Modal */}
      {
        showQRModal && qrPO && (
          <QRCodeModal
            open={showQRModal}
            onClose={() => {
              setShowQRModal(false);
              setQrPO(null);
            }}
            orderType="PO"
            orderId={qrPO.po_id || qrPO.id}
            orderNumber={qrPO.po_number}
            onGenerateToken={handleQRTokenGenerate}
          />
        )
      }

      {/* Archive Confirmation Dialog */}
      <DeleteConfirmDialog
        open={showArchiveDialog}
        onClose={() => {
          setShowArchiveDialog(false);
          setPoToArchive(null);
        }}
        onConfirm={handleConfirmArchive}
        title="Archive Purchase Order"
        description={
          poToArchive
            ? `Are you sure you want to archive Purchase Order ${poToArchive.po_number}? You can restore it later from the Archived tab.`
            : ''
        }
        confirmText="Archive Purchase Order"
        variant="destructive"
        loading={archiving}
      />
    </div >
  );
}
