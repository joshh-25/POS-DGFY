import React, { useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, ExternalLink, Info, Package, Trash2, X, CalendarDays } from "lucide-react";

function formatDrawerDate(value) {
  if (!value) return "Today";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Today";
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (isToday) return "Today, " + timeStr;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday, " + timeStr;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " + timeStr;
}

function resolveStatusStyle(raw) {
  const s = String(raw || "").toLowerCase().replace(/[^a-z ]/g, "").trim();
  if (s.includes("confirm")) return { bg: "#f0fdf4", border: "#86efac", color: "#15803d", dot: "#22c55e", label: "Confirmed by store" };
  if (s.includes("prepar")) return { bg: "#fff7ed", border: "#fdba74", color: "#c2410c", dot: "#f97316", label: "Preparing" };
  if (s.includes("pickup") || s.includes("ready")) return { bg: "#faf5ff", border: "#d8b4fe", color: "#7e22ce", dot: "#a855f7", label: "Ready for Pickup" };
  if (s.includes("delivered") && !s.includes("out")) return { bg: "#f0fdf4", border: "#86efac", color: "#15803d", dot: "#22c55e", label: "Delivered" };
  if (s.includes("out")) return { bg: "#eff6ff", border: "#93c5fd", color: "#1d4ed8", dot: "#3b82f6", label: "Out for delivery" };
  if (s.includes("cancel")) return { bg: "#fff1f2", border: "#fca5a5", color: "#b91c1c", dot: "#ef4444", label: "Cancelled" };
  if (s.includes("placed") || s.includes("pending")) return { bg: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8", dot: "#3b82f6", label: "Order placed" };
  return { bg: "#f8fafc", border: "#cbd5e1", color: "#475569", dot: "#94a3b8", label: raw || "In Progress" };
}

function GuestTrackingDrawerCard({
  entry,
  entryPin,
  expanded,
  onToggle,
  onViewOrder,
  selectedStore,
  withAssetOrigin,
  money,
  getTrackingFlowForOrderMethod,
}) {
  const rawStatus = String(entry.status_label || entry.status || "").trim();
  const status = resolveStatusStyle(rawStatus);
  const storeName = entry.store_name || selectedStore?.tenant_name || "Storefront";
  const logoSource = entry.store_logo || selectedStore?.storefront_profile_image_url;
  const dateLabel = formatDrawerDate(entry.created_at);
  const totalAmount = money(entry.total_amount || 0);
  const detailedOrderItems = Array.isArray(entry.items)
    ? entry.items.filter((item) => String(item?.name || "").trim())
    : [];
  const fallbackOrderItems = detailedOrderItems.length === 0 && String(entry.item_name || "").trim()
    ? [{
      name: String(entry.item_name || "").trim(),
      qty: Number.isFinite(Number(entry.item_count)) ? Math.max(1, Number(entry.item_count)) : 1,
      amount: Number.isFinite(Number(entry.total_amount)) ? Number(entry.total_amount) : null,
      subtitle: detailedOrderItems.length === 0 && Number(entry.item_count || 1) > 1
        ? `${Math.max(1, Number(entry.item_count || 1))} items in this order`
        : "Order summary"
    }]
    : [];
  const orderItems = detailedOrderItems.length > 0 ? detailedOrderItems : fallbackOrderItems;
  const subtotal = entry.subtotal != null ? money(entry.subtotal) : null;
  const deliveryFee = entry.delivery_fee != null ? money(entry.delivery_fee) : null;
  const serviceFee = entry.service_fee != null ? money(entry.service_fee) : null;

  return (
    <div
      style={{
        flexShrink: 0,
        border: expanded ? "1.5px solid #93c5fd" : "1px solid #e2e8f0",
        borderRadius: 16,
        background: "#fff",
        overflow: "hidden",
        boxShadow: expanded
          ? "0 8px 28px rgba(26,78,141,0.10)"
          : "0 2px 6px rgba(15,23,42,0.04)",
        transition: "border-color 160ms ease, box-shadow 160ms ease",
      }}
    >
      {/* Header row - always visible */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle(); }}
        style={{
          padding: "16px",
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          cursor: "pointer",
          background: expanded ? "#f8fbff" : "#fff",
          userSelect: "none",
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "#1a1a2e",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            flexShrink: 0,
            border: "1px solid #e2e8f0",
          }}
        >
          {logoSource ? (
            <img
              src={withAssetOrigin(logoSource)}
              alt={storeName}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <Package size={20} color="#fff" />
          )}
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, display: "flex", justifyContent: "space-between", gap: 8, minWidth: 0 }}>
          
          {/* Left: Store info */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {storeName}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>
              #{entryPin}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94a3b8", fontWeight: 600, marginTop: 4 }}>
              <CalendarDays size={12} /> {dateLabel}
            </div>
          </div>

          {/* Right: Status and Amount */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12, flexShrink: 0 }}>
            
            {/* Status pill with Chevron */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 11,
                fontWeight: 700,
                color: status.color,
                background: status.bg,
                border: "1px solid " + status.border,
                borderRadius: 999,
                padding: "4px 8px 4px 10px",
                whiteSpace: "nowrap",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: status.dot,
                  flexShrink: 0,
                }}
              />
              {status.label}
              {expanded ? (
                <ChevronUp size={14} style={{ marginLeft: 2, color: status.color }} />
              ) : (
                <ChevronDown size={14} style={{ marginLeft: 2, color: status.color }} />
              )}
            </span>

            {/* Amount */}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{totalAmount}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginTop: 2 }}>
                Total Amount
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: "1px solid #e8f0f8" }}>
          {/* Product table */}
          <div style={{ padding: "0 16px 16px" }}>
            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) 56px 80px",
                gap: 8,
                padding: "10px 0 8px",
                borderBottom: "1px solid #e2e8f0",
                marginBottom: 4,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Products
              </div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" }}>
                QTY
              </div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "right" }}>
                Subtotal
              </div>
            </div>

            {/* Item rows */}
            {orderItems.length > 0 ? (
              orderItems.map((item, i) => {
                const itemLogo = item.image_url || item.thumbnail;
                const variantLabel = String(item.variant || item.size || item.variant_name || "").trim();
                const itemQty = item.qty || item.quantity || 1;
                const itemAmount = item.amount != null ? money(item.amount) : null;
                return (
                  <div
                    key={entryPin + "-item-" + i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0,1fr) 56px 80px",
                      gap: 8,
                      alignItems: "center",
                      padding: "10px 0",
                      borderBottom: i < orderItems.length - 1 ? "1px dashed #f1f5f9" : "none",
                    }}
                  >
                    {/* Name + thumbnail */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 10,
                          background: "#f1f5f9",
                          overflow: "hidden",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {itemLogo ? (
                          <img
                            src={withAssetOrigin(itemLogo)}
                            alt={item.name}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <Package size={16} color="#94a3b8" />
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", lineHeight: 1.3, wordBreak: "break-word" }}>
                          {item.name}
                        </div>
                        {variantLabel && (
                          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginTop: 2 }}>
                            {variantLabel}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Qty */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", textAlign: "center" }}>
                      {itemQty}x
                    </div>
                    {/* Subtotal */}
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", textAlign: "right" }}>
                      {itemAmount || "-"}
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: "16px 0", fontSize: 12, color: "#64748b", textAlign: "center" }}>
                Line items are available in the full tracking view.
              </div>
            )}

            {/* Order totals */}
            {(subtotal || deliveryFee || serviceFee) && (
              <div
                style={{
                  marginTop: 12,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  display: "grid",
                  gap: 8,
                }}
              >
                {subtotal && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                    <span>Subtotal</span><span style={{ fontWeight: 700, color: "#334155" }}>{subtotal}</span>
                  </div>
                )}
                {deliveryFee && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                    <span>Delivery Fee</span><span style={{ fontWeight: 700, color: "#334155" }}>{deliveryFee}</span>
                  </div>
                )}
                {serviceFee && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                    <span>Service Fee</span><span style={{ fontWeight: 700, color: "#334155" }}>{serviceFee}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 900, color: "#0f172a", paddingTop: 8, borderTop: "1px solid #e2e8f0" }}>
                  <span>Total</span><span>{totalAmount}</span>
                </div>
              </div>
            )}
          </div>

          {/* View order details link */}
          <div
            style={{
              borderTop: "1px solid #e8f0f8",
              padding: "12px 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onViewOrder(); }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: "none",
                background: "transparent",
                color: "#1a4e8d",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
              }}
            >
              <ExternalLink size={14} />
              View order details
            </button>
            <ChevronRight size={16} color="#94a3b8" />
          </div>
        </div>
      )}
    </div>
  );
}

function TrackingEmptyState({ isAccountTracking }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "56px 24px",
        textAlign: "center",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "#eff6ff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Package size={32} color="#93c5fd" />
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>
          No active orders found.
        </div>
        <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, maxWidth: 260 }}>
          {isAccountTracking
            ? "No in-progress account orders yet. Enter a tracking PIN to load a specific order."
            : "Track an order using your order reference."}
        </div>
      </div>
    </div>
  );
}

export function GuestTrackingDrawer({
  isOpen,
  isMobileViewport,
  trackingPinInput,
  onTrackingPinInputChange,
  onTrack,
  trackingError = "",
  selectedStore,
  guestTrackedOrders,
  expandedGuestDrawerPins,
  onExpandedGuestDrawerPinsChange,
  onClose,
  openFullTrackingForPin,
  withAssetOrigin,
  money,
  formatTicketDate,
  getTrackingFlowForOrderMethod,
  isAccountTracking = false,
  onClearAllOrders,
}) {
  if (!isOpen) return null;

  const drawerWidth = isMobileViewport ? "min(96vw, 480px)" : 500;

  const filteredOrders = Array.isArray(guestTrackedOrders) ? guestTrackedOrders : [];
  const expandedPins = Array.isArray(expandedGuestDrawerPins) ? expandedGuestDrawerPins : [];

  return (
    <React.Fragment>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close tracking drawer"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2498,
          border: "none",
          background: "rgba(15,23,42,0.30)",
          cursor: "pointer",
        }}
      />

      {/* Drawer */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          zIndex: 2499,
          width: drawerWidth,
          maxWidth: "100vw",
          height: "100dvh",
          background: "#f0f4f8",
          borderLeft: "1px solid #dbe5ee",
          boxShadow: "-20px 0 56px rgba(15,23,42,0.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          overscrollBehavior: "contain",
          fontFamily: "inherit",
        }}
      >
        {/* ── Sticky Header ── */}
        <div
          style={{
            background: "#fff",
            borderBottom: "1px solid #e8f0f8",
            padding: isMobileViewport ? "16px 16px" : "20px 22px",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#0f172a", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                In Progress Orders
              </div>
              <div style={{ marginTop: 4, fontSize: 13, color: "#64748b", fontWeight: 600 }}>
                {isAccountTracking
                  ? "Active orders linked to your DGFY account."
                  : "Active guest orders saved on this device."}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                background: "#fff",
                color: "#64748b",
                padding: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Scrollable Orders ── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            overscrollBehavior: "contain",
            padding: isMobileViewport ? "16px 14px" : "20px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {filteredOrders.length === 0 ? (
            <TrackingEmptyState isAccountTracking={isAccountTracking} />
          ) : (
            filteredOrders.map((entry) => {
              const entryPin = String(entry.tracking_pin || "").trim().toUpperCase();
              return (
                <GuestTrackingDrawerCard
                  key={"guest-track-drawer-" + entryPin}
                  entry={entry}
                  entryPin={entryPin}
                  expanded={expandedPins.includes(entryPin)}
                  onToggle={() => {
                    const nextExpandedPins = expandedPins.includes(entryPin)
                      ? expandedPins.filter((pin) => pin !== entryPin)
                      : [...expandedPins, entryPin];
                    onExpandedGuestDrawerPinsChange(nextExpandedPins);
                  }}
                  onViewOrder={() => openFullTrackingForPin(entryPin)}
                  selectedStore={selectedStore}
                  withAssetOrigin={withAssetOrigin}
                  money={money}
                  formatTicketDate={formatTicketDate}
                  getTrackingFlowForOrderMethod={getTrackingFlowForOrderMethod}
                />
              );
            })
          )}
        </div>

        {/* ── Sticky Footer ── */}
        <div
          style={{
            background: "#fff",
            borderTop: "1px solid #e8f0f8",
            padding: isMobileViewport ? "12px 16px" : "14px 22px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 11, color: "#94a3b8", fontWeight: 600, lineHeight: 1.5, flex: 1 }}>
            <Info size={12} style={{ flexShrink: 0, marginTop: 1 }} />
            Only showing active orders. Completed orders are not displayed.
          </div>
          {onClearAllOrders && Array.isArray(guestTrackedOrders) && guestTrackedOrders.length > 0 && (
            <button
              type="button"
              onClick={onClearAllOrders}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                border: "1px solid #fca5a5",
                borderRadius: 8,
                background: "#fff",
                color: "#b91c1c",
                fontSize: 12,
                fontWeight: 700,
                padding: "6px 10px",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              <Trash2 size={12} />
              Clear all orders
            </button>
          )}
        </div>
      </aside>
    </React.Fragment>
  );
}
