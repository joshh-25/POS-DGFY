// Dummy data for the Inventory Management System

export const dummyItems = [
  {
    id: "item-001",
    sku_code: "ING-SUG-001",
    name: "Sugar",
    category: "raw_material",
    description: "Premium white granulated sugar",
    current_stock: 10,
    max_capacity: 25,
    min_threshold: 10,
    purchase_allowance: 5,
    unit_of_measure: "kg",
    cost_per_unit: 2.5,
    last_updated: "2025-01-18"
  },
  {
    id: "item-002",
    sku_code: "ING-SAL-001",
    name: "Salt",
    category: "raw_material",
    description: "Fine iodized salt",
    current_stock: 5,
    max_capacity: 15,
    min_threshold: 6,
    purchase_allowance: 3,
    unit_of_measure: "kg",
    cost_per_unit: 1.5,
    last_updated: "2025-01-17"
  },
  {
    id: "item-003",
    sku_code: "ING-GIN-001",
    name: "Ginger Powder",
    category: "raw_material",
    description: "Organic ground ginger powder",
    current_stock: 1,
    max_capacity: 5,
    min_threshold: 2,
    purchase_allowance: 1,
    unit_of_measure: "kg",
    cost_per_unit: 15.0,
    last_updated: "2025-01-15"
  },
  {
    id: "item-004",
    sku_code: "ING-TEA-001",
    name: "Tea Leaves",
    category: "raw_material",
    description: "Premium black tea leaves",
    current_stock: 8,
    max_capacity: 10,
    min_threshold: 4,
    purchase_allowance: 2,
    unit_of_measure: "kg",
    cost_per_unit: 20.0,
    last_updated: "2025-01-16"
  },
  {
    id: "item-005",
    sku_code: "PRD-GTM-001",
    name: "Ginger Tea Mix",
    category: "product",
    description: "Premium ginger tea blend - 500g packages",
    current_stock: 45,
    max_capacity: 100,
    min_threshold: 40,
    purchase_allowance: 20,
    unit_of_measure: "units",
    cost_per_unit: 8.5,
    last_updated: "2025-01-17",
    ingredients: [
      { item_id: "item-004", item_name: "Tea Leaves", quantity: 0.03 },
      { item_id: "item-003", item_name: "Ginger Powder", quantity: 0.015 },
      { item_id: "item-001", item_name: "Sugar", quantity: 0.005 }
    ]
  },
  {
    id: "item-006",
    sku_code: "PRD-HRB-001",
    name: "Herbal Blend",
    category: "product",
    description: "Mixed herbal tea blend - 250g packages",
    current_stock: 30,
    max_capacity: 80,
    min_threshold: 32,
    purchase_allowance: 16,
    unit_of_measure: "units",
    cost_per_unit: 6.0,
    last_updated: "2025-01-18",
    ingredients: [
      { item_id: "item-004", item_name: "Tea Leaves", quantity: 0.02 },
      { item_id: "item-003", item_name: "Ginger Powder", quantity: 0.005 }
    ]
  },
  {
    id: "item-007",
    sku_code: "PKG-BTL-001",
    name: "6-inch Glass Bottles",
    category: "packaging",
    description: "Clear glass bottles for tea products",
    current_stock: 150,
    max_capacity: 500,
    min_threshold: 200,
    purchase_allowance: 100,
    unit_of_measure: "units",
    cost_per_unit: 0.75,
    last_updated: "2025-01-14",
    packaging_specs: {
      height: "6 inches",
      width: "2 inches",
      thickness: "3mm",
      material: "Borosilicate Glass",
      design: "Clear with embossed logo",
      contents: "Tea products up to 500g"
    }
  },
  {
    id: "item-008",
    sku_code: "PKG-STK-001",
    name: "Sticker Labels",
    category: "packaging",
    description: "Product labels for bottles",
    current_stock: 500,
    max_capacity: 2000,
    min_threshold: 800,
    purchase_allowance: 400,
    unit_of_measure: "units",
    cost_per_unit: 0.05,
    last_updated: "2025-01-13",
    packaging_specs: {
      height: "3 inches",
      width: "2 inches",
      thickness: "0.1mm",
      material: "Vinyl waterproof",
      design: "Full color with brand logo",
      contents: "Product info and ingredients"
    }
  },
  {
    id: "item-009",
    sku_code: "PKG-BOX-001",
    name: "Cardboard Boxes",
    category: "packaging",
    description: "Shipping boxes for product bundles",
    current_stock: 75,
    max_capacity: 200,
    min_threshold: 80,
    purchase_allowance: 40,
    unit_of_measure: "units",
    cost_per_unit: 1.25,
    last_updated: "2025-01-12",
    packaging_specs: {
      height: "12 inches",
      width: "10 inches",
      thickness: "5mm",
      material: "Corrugated cardboard",
      design: "Printed with company branding",
      contents: "Holds 12 bottles"
    }
  }
];

export const dummySuppliers = [
  {
    id: "sup-001",
    name: "Supplier A - Premium Foods",
    contact_person: "John Smith",
    email: "john@premiumfoods.com",
    phone: "+1 555-0101",
    address: "123 Industrial Blvd, Suite 100, Metro City, MC 12345",
    items_supplied: [
      { item_id: "item-001", item_name: "Sugar", moq: 10, price_per_unit: 2.5 },
      { item_id: "item-002", item_name: "Salt", moq: 5, price_per_unit: 1.5 },
      { item_id: "item-004", item_name: "Tea Leaves", moq: 3, price_per_unit: 20.0 }
    ],
    quality_rating: 4.8,
    avg_delivery_days: 3,
    bulk_discounts: [
      { min_quantity: 10, discount_percent: 5 },
      { min_quantity: 25, discount_percent: 10 }
    ],
    last_delivery_date: "2025-01-18"
  },
  {
    id: "sup-002",
    name: "Supplier B - Organic Spices",
    contact_person: "Maria Garcia",
    email: "maria@organicspices.com",
    phone: "+1 555-0202",
    address: "456 Spice Lane, Flavor Town, FT 67890",
    items_supplied: [
      { item_id: "item-003", item_name: "Ginger Powder", moq: 2, price_per_unit: 15.0 },
      { item_id: "item-004", item_name: "Tea Leaves", moq: 2, price_per_unit: 22.0 }
    ],
    quality_rating: 4.2,
    avg_delivery_days: 5,
    bulk_discounts: [
      { min_quantity: 5, discount_percent: 3 },
      { min_quantity: 15, discount_percent: 8 }
    ],
    last_delivery_date: "2025-01-15"
  },
  {
    id: "sup-003",
    name: "Supplier C - PackagePro",
    contact_person: "David Chen",
    email: "david@packagepro.com",
    phone: "+1 555-0303",
    address: "789 Packaging Way, Box City, BC 11223",
    items_supplied: [
      { item_id: "item-007", item_name: "6-inch Glass Bottles", moq: 50, price_per_unit: 0.75 },
      { item_id: "item-008", item_name: "Sticker Labels", moq: 100, price_per_unit: 0.05 },
      { item_id: "item-009", item_name: "Cardboard Boxes", moq: 25, price_per_unit: 1.25 }
    ],
    quality_rating: 4.5,
    avg_delivery_days: 7,
    bulk_discounts: [
      { min_quantity: 100, discount_percent: 5 },
      { min_quantity: 500, discount_percent: 12 }
    ],
    last_delivery_date: "2025-01-14"
  }
];

export const dummyPurchaseOrders = [
  {
    id: "po-001",
    po_number: "PO-001",
    supplier_id: "sup-001",
    supplier_name: "Supplier A - Premium Foods",
    items: [
      { item_id: "item-001", item_name: "Sugar", quantity: 20, unit_price: 2.5, total_price: 50, quantity_received: 20, quality_check: "pass" },
      { item_id: "item-002", item_name: "Salt", quantity: 10, unit_price: 1.5, total_price: 15, quantity_received: 10, quality_check: "pass" }
    ],
    subtotal: 65,
    discount: 3.25,
    total_amount: 61.75,
    order_date: "2025-01-15",
    expected_delivery_date: "2025-01-18",
    received_date: "2025-01-18",
    status: "received",
    delivery_rating: 5,
    notes: "Excellent quality, delivered on time"
  },
  {
    id: "po-002",
    po_number: "PO-002",
    supplier_id: "sup-002",
    supplier_name: "Supplier B - Organic Spices",
    items: [
      { item_id: "item-003", item_name: "Ginger Powder", quantity: 3, unit_price: 15, total_price: 45, quantity_received: 3, quality_check: "pass" }
    ],
    subtotal: 45,
    discount: 0,
    total_amount: 45,
    order_date: "2025-01-12",
    expected_delivery_date: "2025-01-17",
    received_date: "2025-01-15",
    status: "received",
    delivery_rating: 4,
    notes: "Good quality ginger powder"
  },
  {
    id: "po-003",
    po_number: "PO-003",
    supplier_id: "sup-001",
    supplier_name: "Supplier A - Premium Foods",
    items: [
      { item_id: "item-001", item_name: "Sugar", quantity: 15, unit_price: 2.5, total_price: 37.5, quantity_received: 0, quality_check: null }
    ],
    subtotal: 37.5,
    discount: 0,
    total_amount: 37.5,
    order_date: "2025-01-19",
    expected_delivery_date: "2025-01-22",
    received_date: null,
    status: "pending",
    delivery_rating: null,
    notes: ""
  },
  {
    id: "po-004",
    po_number: "PO-004",
    supplier_id: "sup-003",
    supplier_name: "Supplier C - PackagePro",
    items: [
      { item_id: "item-007", item_name: "6-inch Glass Bottles", quantity: 100, unit_price: 0.75, total_price: 75, quantity_received: 50, quality_check: "pass" },
      { item_id: "item-008", item_name: "Sticker Labels", quantity: 500, unit_price: 0.05, total_price: 25, quantity_received: 500, quality_check: "pass" }
    ],
    subtotal: 100,
    discount: 5,
    total_amount: 95,
    order_date: "2025-01-10",
    expected_delivery_date: "2025-01-17",
    received_date: null,
    status: "partial",
    delivery_rating: null,
    notes: "Partial delivery - remaining bottles expected next week"
  }
];

export const dummyJobOrders = [
  {
    id: "jo-001",
    jo_number: "JO-001",
    product_id: "item-005",
    product_name: "Ginger Tea Mix",
    quantity_to_produce: 100,
    ingredients_consumed: [
      { item_id: "item-004", item_name: "Tea Leaves", quantity_required: 3, stock_before: 11, stock_after: 8 },
      { item_id: "item-003", item_name: "Ginger Powder", quantity_required: 1.5, stock_before: 2.5, stock_after: 1 },
      { item_id: "item-001", item_name: "Sugar", quantity_required: 0.5, stock_before: 10.5, stock_after: 10 }
    ],
    status: "completed",
    created_date: "2025-01-16",
    completion_date: "2025-01-17T14:15:00",
    responsible_user: "admin@company.com"
  },
  {
    id: "jo-002",
    jo_number: "JO-002",
    product_id: "item-006",
    product_name: "Herbal Blend",
    quantity_to_produce: 50,
    ingredients_consumed: [
      { item_id: "item-004", item_name: "Tea Leaves", quantity_required: 1, stock_before: 8, stock_after: 7 },
      { item_id: "item-003", item_name: "Ginger Powder", quantity_required: 0.25, stock_before: 1, stock_after: 0.75 }
    ],
    status: "in_progress",
    created_date: "2025-01-18",
    completion_date: null,
    responsible_user: "admin@company.com"
  },
  {
    id: "jo-003",
    jo_number: "JO-003",
    product_id: "item-005",
    product_name: "Ginger Tea Mix",
    quantity_to_produce: 75,
    ingredients_consumed: [
      { item_id: "item-004", item_name: "Tea Leaves", quantity_required: 2.25, stock_before: 8, stock_after: 5.75 },
      { item_id: "item-003", item_name: "Ginger Powder", quantity_required: 1.125, stock_before: 1, stock_after: -0.125 },
      { item_id: "item-001", item_name: "Sugar", quantity_required: 0.375, stock_before: 10, stock_after: 9.625 }
    ],
    status: "draft",
    created_date: "2025-01-19",
    completion_date: null,
    responsible_user: "admin@company.com"
  }
];

export const dummyStockMovements = [
  {
    id: "mov-001",
    item_id: "item-001",
    item_name: "Sugar",
    movement_type: "purchase_receipt",
    quantity: 20,
    from_location: null,
    to_location: "Main Warehouse",
    reference_id: "PO-001",
    user_responsible: "admin@company.com",
    notes: "Received from Supplier A",
    loss_reason: null,
    created_date: "2025-01-18T10:30:00"
  },
  {
    id: "mov-002",
    item_id: "item-003",
    item_name: "Ginger Powder",
    movement_type: "production_consumption",
    quantity: 1.5,
    from_location: "Main Warehouse",
    to_location: "Production Floor",
    reference_id: "JO-001",
    user_responsible: "admin@company.com",
    notes: "Consumed for Ginger Tea Mix production",
    loss_reason: null,
    created_date: "2025-01-17T14:15:00"
  },
  {
    id: "mov-003",
    item_id: "item-001",
    item_name: "Sugar",
    movement_type: "calculated_loss",
    quantity: 2,
    from_location: "Main Warehouse",
    to_location: null,
    reference_id: null,
    user_responsible: "admin@company.com",
    notes: "Found damaged packaging during inspection",
    loss_reason: "spoilage",
    created_date: "2025-01-16T09:45:00"
  },
  {
    id: "mov-004",
    item_id: "item-003",
    item_name: "Ginger Powder",
    movement_type: "purchase_receipt",
    quantity: 3,
    from_location: null,
    to_location: "Main Warehouse",
    reference_id: "PO-002",
    user_responsible: "admin@company.com",
    notes: "Received from Supplier B",
    loss_reason: null,
    created_date: "2025-01-15T15:20:00"
  },
  {
    id: "mov-005",
    item_id: "item-004",
    item_name: "Tea Leaves",
    movement_type: "production_consumption",
    quantity: 3,
    from_location: "Main Warehouse",
    to_location: "Production Floor",
    reference_id: "JO-001",
    user_responsible: "admin@company.com",
    notes: "Consumed for Ginger Tea Mix production",
    loss_reason: null,
    created_date: "2025-01-17T14:15:00"
  },
  {
    id: "mov-006",
    item_id: "item-005",
    item_name: "Ginger Tea Mix",
    movement_type: "purchase_receipt",
    quantity: 100,
    from_location: "Production Floor",
    to_location: "Main Warehouse",
    reference_id: "JO-001",
    user_responsible: "admin@company.com",
    notes: "Finished production batch",
    loss_reason: null,
    created_date: "2025-01-17T16:00:00"
  },
  {
    id: "mov-007",
    item_id: "item-007",
    item_name: "6-inch Glass Bottles",
    movement_type: "purchase_receipt",
    quantity: 50,
    from_location: null,
    to_location: "Main Warehouse",
    reference_id: "PO-004",
    user_responsible: "admin@company.com",
    notes: "Partial delivery from PackagePro",
    loss_reason: null,
    created_date: "2025-01-14T11:00:00"
  },
  {
    id: "mov-008",
    item_id: "item-008",
    item_name: "Sticker Labels",
    movement_type: "purchase_receipt",
    quantity: 500,
    from_location: null,
    to_location: "Main Warehouse",
    reference_id: "PO-004",
    user_responsible: "admin@company.com",
    notes: "Full delivery from PackagePro",
    loss_reason: null,
    created_date: "2025-01-14T11:00:00"
  },
  {
    id: "mov-009",
    item_id: "item-009",
    item_name: "Cardboard Boxes",
    movement_type: "transfer",
    quantity: 10,
    from_location: "Main Warehouse",
    to_location: "Shipping Area",
    reference_id: null,
    user_responsible: "admin@company.com",
    notes: "Transfer for order packing",
    loss_reason: null,
    created_date: "2025-01-13T09:30:00"
  },
  {
    id: "mov-010",
    item_id: "item-002",
    item_name: "Salt",
    movement_type: "return",
    quantity: 2,
    from_location: "Production Floor",
    to_location: "Main Warehouse",
    reference_id: null,
    user_responsible: "admin@company.com",
    notes: "Unused from production batch",
    loss_reason: null,
    created_date: "2025-01-12T16:45:00"
  }
];

export const getItemsStats = (items) => {
  const totalItems = items.length;
  // Only count as low stock if min_threshold is set (not null)
  const lowStockItems = items.filter(item =>
    item.min_threshold !== null && item.min_threshold !== undefined &&
    item.current_stock < item.min_threshold
  );
  const overStockItems = items.filter(item => item.current_stock > item.max_capacity);
  // Only count as healthy if min_threshold is set
  const healthyItems = items.filter(item =>
    (item.min_threshold === null || item.min_threshold === undefined)
      ? item.current_stock <= item.max_capacity
      : item.current_stock >= item.min_threshold && item.current_stock <= item.max_capacity
  );
  const totalValue = items.reduce((sum, item) => sum + (item.current_stock * item.cost_per_unit), 0);

  return {
    totalItems,
    lowStockCount: lowStockItems.length,
    overStockCount: overStockItems.length,
    healthyCount: healthyItems.length,
    totalValue,
    lowStockItems,
    overStockItems
  };
};

export const getStockStatus = (item) => {
  // If no threshold set (null or undefined), item is always "healthy" unless over capacity
  if (item.min_threshold === null || item.min_threshold === undefined) {
    if (item.current_stock > item.max_capacity) return 'surplus';
    return 'healthy';
  }
  if (item.current_stock < item.min_threshold) return 'critical';
  if (item.current_stock < item.min_threshold * 1.25) return 'warning';
  if (item.current_stock > item.max_capacity) return 'surplus';
  return 'healthy';
};

export const getQualityColor = (rating) => {
  if (rating >= 4.5) return 'text-emerald-600';
  if (rating >= 3.5) return 'text-amber-600';
  return 'text-red-600';
};

export const getQualityBgColor = (rating) => {
  if (rating >= 4.5) return 'bg-emerald-50 border-emerald-200';
  if (rating >= 3.5) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
};
