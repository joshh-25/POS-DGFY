const base = [
  { id: 'placed', label: 'Order placed' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'preparing', label: 'Preparing' }
];

export function getOrderTrackingFlow(orderMethod = 'delivery', retail = false) {
  const packing = retail ? [{ id: 'packed', label: 'Packed' }] : [];
  if (orderMethod === 'pickup') return [
    ...base, ...packing,
    { id: 'ready_for_pickup', label: 'Ready for pickup' },
    { id: 'completed', label: 'Picked up' }
  ];
  if (orderMethod === 'takeout') return [
    ...base, { id: 'ready_for_pickup', label: 'Ready' },
    { id: 'completed', label: 'Completed' }
  ];
  if (orderMethod === 'dine_in') return [
    ...base, { id: 'ready_for_pickup', label: 'Ready' },
    { id: 'completed', label: 'Served' }
  ];
  return [
    ...base, ...packing,
    { id: 'ready_for_rider', label: 'Waiting for rider' },
    { id: 'rider_assigned', label: 'Rider assigned' },
    { id: 'picked_up', label: 'Picked up' },
    { id: 'completed', label: 'Delivered' }
  ];
}

export function getOrderTrackingTimeline(orderMethod, status, delivery = null, retail = false) {
  const method = String(orderMethod || 'delivery').toLowerCase();
  const current = String(status || 'placed').toLowerCase();
  const flow = getOrderTrackingFlow(method, retail);
  if (current === 'cancelled' || current === 'rejected') {
    return [...flow.filter((step) => step.id !== 'completed'),
      { id: current, label: current === 'cancelled' ? 'Cancelled' : 'Rejected' }]
      .map((step) => ({ ...step, state: step.id === current ? 'active' : 'pending' }));
  }
  let active = current;
  if (current === 'packed' && !retail) active = 'preparing';
  if (method === 'delivery') {
    if (current === 'ready_for_rider' && delivery?.stage === 'rider_assigned') active = 'rider_assigned';
    if (current === 'out_for_delivery') active = 'picked_up';
  }
  const activeIndex = Math.max(0, flow.findIndex((step) => step.id === active));
  return flow.map((step, index) => ({
    ...step,
    state: index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending'
  }));
}
