# API Specification & Frontend-Backend Integration Plan

## Table of Contents

> **Navigation Tip:** Click a section link to jump directly to that part of the API documentation.

### API Reference
- [API Overview](#api-overview)
- [Authentication Endpoints](#authentication-endpoints)
- [User Management Endpoints](#user-management-endpoints)
- [Items (SKU Master) Endpoints](#items-sku-master-endpoints)
- [Suppliers Endpoints](#suppliers-endpoints)
- [Purchase Orders Endpoints](#purchase-orders-endpoints)
- [Job Orders Endpoints](#job-orders-endpoints)
- [Stock Movements Endpoints](#stock-movements-endpoints)
- [Dispatch Orders Endpoints](#dispatch-orders-endpoints)
- [POS Endpoints](#pos-endpoints)
- [Unified Sales Endpoints](#unified-sales-endpoints)
- [Reports Endpoints](#reports-endpoints)
- [AI Assistant Endpoints](#ai-assistant-endpoints)
- [Admin Tenant Management Endpoints](#admin-tenant-management-endpoints)

### Integration
- [Frontend-Backend Integration Points](#frontend-backend-integration-points)
- [Data Synchronization Strategy](#data-synchronization-strategy)
- [API Rate Limiting](#api-rate-limiting)
- [Security Considerations](#security-considerations)

---

# API Specification & Frontend-Backend Integration Plan

## API Overview

### Base URL
```
Development: http://localhost:5000/api/v1
Production: https://api.sku-inventory.com/api/v1
```

### API Version
- Current Version: v1
- Versioning Strategy: URL-based versioning (/api/v1, /api/v2, etc.)

### Authentication
- **Method**: JWT (JSON Web Tokens) + Tenant Identification
- **Auth Header**: `Authorization: Bearer <token>`
- **Tenant Header**: `x-company-token: <company-token>` (REQUIRED)
- **Token Expiry**: 24 hours
- **Refresh Token**: 7 days

### Response Format
All responses follow a consistent JSON structure:

```json
{
  "success": true,
  "data": {},
  "message": "Operation successful",
  "timestamp": "2024-01-15T10:30:00Z",
  "errors": null
}
```

### Error Responses
```json
{
  "success": false,
  "data": null,
  "message": "Error description",
  "timestamp": "2024-01-15T10:30:00Z",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### HTTP Status Codes
| Code | Meaning |
|------|---------|
| 200 | OK - Request successful |
| 201 | Created - Resource created successfully |
| 204 | No Content - Successful but no content |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource not found |
| 409 | Conflict - Resource already exists |
| 422 | Unprocessable Entity - Validation failed |
| 500 | Internal Server Error |

### Soft Delete Contract (Manual-Only)
- Applies to `items`, `suppliers`, and `users`.
- Records are retained with audit fields (`deleted_at`, `deleted_by`), not physically removed.
- Default API resource behavior for soft-deleted targets is `404 Not Found`.
- `410 Gone` is reserved for future privileged admin/audit endpoints and is not used by default routes.
- Authentication/session checks for removed users may return `401` (account no longer allowed to authenticate).

---

## Authentication & Multi-Tenancy

### Multi-Tenant Header Requirement
All API requests (except for root `/admin` registration) must include the `x-company-token` header. This token determines which isolated database context is used for the request.

---

## Authentication Endpoints

### POST /auth/register
Register a new user

**Request**
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "SecurePassword123!",
  "role": "staff"
}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "user_id": 1,
    "username": "john_doe",
    "email": "john@example.com",
    "role": "staff",
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  },
  "message": "User registered successfully"
}
```

### POST /auth/login
Authenticate user and get JWT token

**Request**
```json
{
  "email": "john@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "user_id": 1,
    "username": "john_doe",
    "email": "john@example.com",
    "role": "staff",
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 86400
  },
  "message": "Login successful"
}
```

### POST /auth/refresh-token
Refresh JWT token

**Request**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 86400
  }
}
```

### POST /auth/logout
Logout user (invalidate tokens)

**Response (200)**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

---

## User Management Endpoints

### GET /users/me
Get current authenticated user profile

**Headers**
```
Authorization: Bearer <token>
x-company-token: <company-token>
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "user_id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "role": "admin",
    "is_active": true,
    "permissions": ["items:view", "items:create"],
    "is_master_admin": true,
    "last_login": "2024-01-15T10:00:00Z"
  }
}
```

### GET /users
Get all users (Admin/Manager only). Excludes soft-deleted users.

**Headers**
```
Authorization: Bearer <token>
x-company-token: <company-token>
```

**Response (200)**
```json
{
  "success": true,
  "data": [
    {
      "user_id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "role": "admin",
      "is_active": true,
      "permissions": [],
      "is_master_admin": true,
      "last_login": "2024-01-15T10:00:00Z",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

**Supported Roles (Current Contract)**
- `admin`
- `manager`
- `staff`
- `cashier`
- `po`
- `do`
- `jo`

### PUT /users/:user_id/role
Update user role (Admin only)

**Request Body**
```json
{
  "role": "manager"
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "user_id": 2,
    "username": "staff1",
    "role": "manager",
    "permissions": ["items:view", "items:create", "..."]
  }
}
```

### PUT /users/:user_id/status
Update user active status (Admin only)

**Request Body**
```json
{
  "is_active": false
}
```

### PUT /users/:user_id/permissions
Update user permissions (Master Admin only)

**Request Body**
```json
{
  "permissions": ["items:view", "items:create", "po:view"],
  "is_master_admin": false
}
```

### DELETE /users/:user_id
Remove user from company (soft delete). Requires Admin or Manager role with hierarchical access control.

**Access Control Rules:**
- Master Admin can remove: Admin, Manager, Staff
- Admin can remove: Manager, Staff
- Manager can remove: Staff only
- Cannot remove yourself
- Cannot remove Master Admin

**Headers**
```
Authorization: Bearer <token>
x-company-token: <company-token>
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "user_id": 5,
    "username": "removed_user",
    "email": "removed@example.com",
    "role": "staff",
    "removed_at": "2026-02-06T12:00:00Z"
  },
  "message": "User has been removed from the company"
}
```

**Error Responses:**
- `400` - Cannot remove yourself
- `403` - Cannot remove Master Admin / Insufficient hierarchy level
- `404` - User not found (including already removed users)

---

## Items (SKU Master) Endpoints

### GET /items
Get all items with pagination and filtering

**Query Parameters**
```
?page=1
&limit=20
&category=ingredient
&search=flour
&sortBy=name
&sortOrder=asc
&status=active
&fields=dropdown     # Lightweight projection: returns only item_id, sku_code, name, unit_of_measure, category, current_stock. Skips all JOINs. Use for dropdowns.
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "item_id": 1,
        "sku_code": "ING-001",
        "name": "All-Purpose Flour",
        "category": "ingredient",
        "current_stock": 150.50,
        "max_capacity": 500,
        "min_threshold": 200,
        "purchase_allowance": 100,
        "unit_of_measure": "kg",
        "cost_per_unit": 25.50,
        "fifo_enabled": true,
        "is_active": true,
        "created_at": "2024-01-01T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8
    }
  }
}
```

**Notes:**
- Default listing excludes soft-deleted rows (`deleted_at IS NULL`).
- Inactive items are excluded by default unless explicitly queried by status where permitted.

> **Performance note — `fields=dropdown`**: When `fields=dropdown` is passed, the endpoint returns a lightweight projection (6 fields, no JOINs) intended for populating dropdowns. The full pagination wrapper is preserved but `total` reflects only the returned count. Do not use `fields=dropdown` when you need `ProductComposition`, `ItemFolder`, or any join data.

### GET /items/:item_id
Get single item details

**Response (200)**
```json
{
  "success": true,
  "data": {
    "item_id": 1,
    "sku_code": "ING-001",
    "name": "All-Purpose Flour",
    "category": "ingredient",
    "description": "High-quality all-purpose flour",
    "current_stock": 150.50,
    "max_capacity": 500,
    "min_threshold": 200,
    "purchase_allowance": 100,
    "unit_of_measure": "kg",
    "cost_per_unit": 25.50,
    "fifo_enabled": true,
    "batch_size": 50,
    "yield_percentage": 98.5,
    "processing_loss": 1.5,
    "nutrition": {
      "calories": 364,
      "protein": 10,
      "fat": 1,
      "carbohydrates": 76
    },
    "allergens": ["wheat"],
    "shelf_life": {
      "duration_days": 365,
      "storage_temperature": "20-25°C",
      "storage_conditions": "Dry, cool place"
    },
    "fifo_batches": [
      {
        "batch_id": 1,
        "location_id": 3,
        "location": {
          "location_id": 3,
          "name": "Villa Store"
        },
        "quantity": 100,
        "cost_per_unit": 25.00,
        "received_date": "2024-01-10",
        "expiry_date": "2025-01-10",
        "quantity_consumed": 10
      }
    ],
    "item_location_stocks": [
      {
        "item_location_stock_id": 45,
        "item_id": 1,
        "location_id": 3,
        "location_name": "Villa Store",
        "quantity_on_hand": 140.5
      }
    ],
    "suppliers": [
      {
        "supplier_id": 1,
        "name": "Flour Supplier Inc",
        "moq": 50,
        "price_per_unit": 25.50
      }
    ]
  }
}
```

**Notes:**
- `current_stock` remains compatibility aggregate; authoritative per-location balances are in `item_location_stocks`.
- FIFO batches include optional location metadata to support location-scoped FIFO consumption.

### POST /items
Create new item

**Request**
```json
{
  "sku_code": "ING-001",
  "name": "All-Purpose Flour",
  "category": "ingredient",
  "description": "High-quality all-purpose flour",
  "current_stock": 100,
  "location_id": 3,
  "max_capacity": 500,
  "min_threshold": 200,
  "purchase_allowance": 100,
  "unit_of_measure": "kg",
  "cost_per_unit": 25.50,
  "fifo_enabled": true,
  "batch_size": 50,
  "yield_percentage": 98.5,
  "processing_loss": 1.5
}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "item_id": 1,
    "sku_code": "ING-001",
    "name": "All-Purpose Flour",
    "category": "ingredient"
  },
  "message": "Item created successfully"
}
```

**Notes:**
- `fifo_enabled` defaults to `true` when omitted.
- `sku_code` is trimmed server-side before persistence.
- Active SKU uniqueness is case/whitespace-insensitive. Conflicts return `409` with `Item with this SKU code already exists`.
- When `current_stock` is provided with `location_id`, opening/adjustment stock is recorded for that location ledger.

### PUT /items/:item_id
Update item

**Request**
```json
{
  "name": "Premium All-Purpose Flour",
  "cost_per_unit": 26.00,
  "max_capacity": 600
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "item_id": 1,
    "sku_code": "ING-001",
    "name": "Premium All-Purpose Flour",
    "cost_per_unit": 26.00,
    "max_capacity": 600
  },
  "message": "Item updated successfully"
}
```

**Notes:**
- SKU updates are normalized (trimmed) before persistence.
- In multi-location tenants, stock adjustments with `location_id` use that location's stock baseline (not global aggregate baseline).

### DELETE /items/:item_id
Delete item (soft delete)

**Response (200)**
```json
{
  "success": true,
  "message": "Item deleted successfully"
}
```
**Notes:**
- Sets `status` to 'inactive'
- Sets `deleted_at` timestamp and `deleted_by` user ID
- Subsequent detail/update/delete calls for that item return `404`
- `410` is not returned by default item endpoints

### GET /items/:item_id/stock-history
Get stock movement history for an item
...

### GET /items/:item_id/batches
Get available FIFO batches for an item.

**Query Parameters**
```
?location_id=3
```

**Notes:**
- Returns only batches with available quantity (`quantity > quantity_consumed`).
- `location_id` is optional; when supplied, only batches for that location are returned.
- Response rows include optional location metadata (`location.location_id`, `location.name`).

### GET /items/supplier-coverage
Get item-supplier coverage statistics showing which items have/lack supplier assignments

**Response (200)**
```json
{
  "success": true,
  "data": {
    "items_with_supplier": [
      {
        "item_id": 1,
        "name": "All-Purpose Flour",
        "sku_code": "ING-001",
        "category": "raw_material",
        "current_stock": 150.50,
        "min_threshold": 200,
        "unit_of_measure": "kg",
        "supplier_count": 2
      }
    ],
    "items_without_supplier": [
      {
        "item_id": 5,
        "name": "Black Square Bottle 350ml",
        "sku_code": "PKG-003",
        "category": "packaging",
        "current_stock": 50,
        "min_threshold": 100,
        "unit_of_measure": "pcs"
      }
    ],
    "summary": {
      "total_purchasable_items": 64,
      "items_with_supplier": 45,
      "items_without_supplier": 19,
      "coverage_percentage": 70.31
    }
  }
}
```

**Notes:**
- Only returns purchasable items (categories: raw_material, packaging, supplies)
- Products are excluded as they are manufactured, not purchased
- Used by the PO Wizard to validate item selection
- Used by the Item Coverage Panel on the Suppliers page

### GET /items/folders
List inventory folders.

**Response (200)**
```json
{
  "success": true,
  "data": [
    {
      "folder_id": 12,
      "name": "Beverages",
      "description": "",
      "item_count": 8,
      "show_in_pos_filter": true
    }
  ]
}
```

### POST /items/folders
Create a new inventory folder.

**Request**
```json
{
  "name": "Beverages",
  "description": "Finished goods drinks"
}
```

### PATCH /items/folders/:folder_id
Update folder metadata.

**Request**
```json
{
  "show_in_pos_filter": false
}
```

**Notes:**
- `show_in_pos_filter` controls whether the folder appears as a POS category filter chip.
- This flag does not change item sellability; item-level `pos_visible` is still authoritative.

### DELETE /items/folders/:folder_id
Delete a folder and unassign linked items.

---

## Purchase Orders Endpoints

...

### POST /purchase-orders/:po_id/archive
Archive a Purchase Order (hide from default lists)

**Response (200)**
```json
{
  "success": true,
  "message": "Purchase order archived"
}
```

### POST /purchase-orders/:po_id/restore
Restore an archived Purchase Order

**Response (200)**
```json
{
  "success": true,
  "message": "Purchase order restored"
}
```

---

## Job Orders Endpoints

...

### POST /job-orders/:jo_id/complete
Complete production and update inventory

**Request**
```json
{
  "actual_quantity_produced": 50,
  "notes": "Production went smoothly",
  "expiry_date_override": "2026-06-01" 
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "jo_id": 1,
    "status": "completed",
    "notes": "Production went smoothly"
  }
}
```

### POST /job-orders/:jo_id/archive
Archive a Job Order

**Response (200)**
```json
{
  "success": true,
  "message": "Job order archived"
}
```

### POST /job-orders/:jo_id/restore
Restore an archived Job Order

**Response (200)**
```json
{
  "success": true,
  "message": "Job order restored"
}
```

**Query Parameters**
```
?startDate=2024-01-01
&endDate=2024-01-31
&movementType=production_consumption
&limit=50
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "movements": [
      {
        "movement_id": 1,
        "item_id": 1,
        "movement_type": "production_consumption",
        "quantity": 25.5,
        "reference_id": "JO-001",
        "reference_type": "JO",
        "user_responsible": "john_doe",
        "timestamp": "2024-01-15T10:30:00Z"
      }
    ]
  }
}
```

---

## Suppliers Endpoints

### GET /suppliers
Get all suppliers

**Query Parameters**
```
?page=1
&limit=20
&search=supplier_name
&sortBy=quality_rating
&sortOrder=desc
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "suppliers": [
      {
        "supplier_id": 1,
        "name": "Flour Supplier Inc",
        "contact_person": "John Smith",
        "email": "contact@floursupplier.com",
        "phone": "+63-2-1234-5678",
        "address": "123 Main St, Manila",
        "quality_rating": 4.5,
        "avg_delivery_days": 3,
        "is_active": true,
        "last_delivery_date": "2024-01-14"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 25,
      "pages": 2
    }
  }
}
```

**Notes:**
- Default listing excludes soft-deleted/inactive suppliers.
- Detail or mutation requests on soft-deleted suppliers return `404`.

### GET /suppliers/:supplier_id
Get supplier details with items and pricing

**Response (200)**
```json
{
  "success": true,
  "data": {
    "supplier_id": 1,
    "name": "Flour Supplier Inc",
    "contact_person": "John Smith",
    "email": "contact@floursupplier.com",
    "phone": "+63-2-1234-5678",
    "address": "123 Main St, Manila",
    "quality_rating": 4.5,
    "avg_delivery_days": 3,
    "items": [
      {
        "item_id": 1,
        "item_name": "All-Purpose Flour",
        "moq": 50,
        "price_per_unit": 25.50,
        "last_price_update": "2024-01-10T00:00:00Z"
      }
    ],
    "bulk_discounts": [
      {
        "min_quantity": 100,
        "discount_percent": 5
      },
      {
        "min_quantity": 500,
        "discount_percent": 10
      }
    ]
  }
}
```

### POST /suppliers
Create new supplier

**Request**
```json
{
  "name": "Flour Supplier Inc",
  "contact_person": "John Smith",
  "email": "contact@floursupplier.com",
  "phone": "+63-2-1234-5678",
  "address": "123 Main St, Manila"
}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "supplier_id": 1,
    "name": "Flour Supplier Inc"
  },
  "message": "Supplier created successfully"
}
```

### PUT /suppliers/:supplier_id
Update supplier

**Response (200)**
```json
{
  "success": true,
  "data": {
    "supplier_id": 1,
    "name": "Flour Supplier Inc",
    "quality_rating": 4.7
  },
  "message": "Supplier updated successfully"
}
```

### POST /suppliers/:supplier_id/items
Add item to supplier's catalog

**Request**
```json
{
  "item_id": 1,
  "moq": 50,
  "price_per_unit": 25.50
}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "supplier_item_id": 1,
    "item_id": 1,
    "moq": 50,
    "price_per_unit": 25.50
  }
}
```

---

## Purchase Orders Endpoints

### GET /purchase-orders
Get all purchase orders

**Query Parameters**
```
?page=1
&limit=20
&status=pending
&supplier_id=1
&startDate=2024-01-01
&endDate=2024-01-31
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "purchase_orders": [
      {
        "po_id": 1,
        "po_number": "PO-2024-001",
        "supplier_id": 1,
        "supplier_name": "Flour Supplier Inc",
        "order_date": "2024-01-10",
        "expected_delivery_date": "2024-01-13",
        "received_date": null,
        "status": "pending",
        "total_amount": 5100.00,
        "created_by": "john_doe"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "pages": 3
    }
  }
}
```

### GET /purchase-orders/:po_id
Get detailed PO with line items

**Response (200)**
```json
{
  "success": true,
  "data": {
    "po_id": 1,
    "po_number": "PO-2024-001",
    "supplier_id": 1,
    "supplier_name": "Flour Supplier Inc",
    "order_date": "2024-01-10",
    "expected_delivery_date": "2024-01-13",
    "received_date": null,
    "status": "pending",
    "line_items": [
      {
        "line_item_id": 1,
        "item_id": 1,
        "item_name": "All-Purpose Flour",
        "quantity_ordered": 200,
        "quantity_received": 0,
        "unit_price": 25.50,
        "total_price": 5100.00,
        "quality_check_status": "pending"
      }
    ],
    "subtotal": 5100.00,
    "discount": 0,
    "total_amount": 5100.00,
    "notes": "Urgent order"
  }
}
```

### POST /purchase-orders
Create new purchase order

**Request**
```json
{
  "supplier_id": 1,
  "order_date": "2024-01-10",
  "expected_delivery_date": "2024-01-13",
  "line_items": [
    {
      "item_id": 1,
      "quantity": 200,
      "unit_price": 25.50
    }
  ],
  "discount": 0,
  "notes": "Urgent order"
}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "po_id": 1,
    "po_number": "PO-2024-001",
    "status": "pending",
    "total_amount": 5100.00
  },
  "message": "Purchase order created successfully"
}
```

### POST /purchase-orders/:po_id/receive
Record PO receipt and update inventory

**Request**
```json
{
  "received_date": "2024-01-13",
  "line_items": [
    {
      "line_item_id": 1,
      "quantity_received": 200,
      "quality_check_status": "passed"
    }
  ],
  "notes": "All items received in good condition"
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "po_id": 1,
    "status": "received",
    "received_date": "2024-01-13"
  },
  "message": "PO receipt recorded successfully"
}
```

---

## Job Orders Endpoints

### GET /job-orders
Get all job orders

**Query Parameters**
```
?page=1
&limit=20
&status=in_progress
&product_id=5
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "job_orders": [
      {
        "jo_id": 1,
        "jo_number": "JO-2024-001",
        "product_id": 5,
        "product_name": "Chocolate Cake",
        "quantity_to_produce": 50,
        "status": "in_progress",
        "created_date": "2024-01-15T08:00:00Z",
        "responsible_user": "baker_john"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 30,
      "pages": 2
    }
  }
}
```

### GET /job-orders/:jo_id
Get detailed job order with ingredients

**Response (200)**
```json
{
  "success": true,
  "data": {
    "jo_id": 1,
    "jo_number": "JO-2024-001",
    "product_id": 5,
    "product_name": "Chocolate Cake",
    "quantity_to_produce": 50,
    "status": "in_progress",
    "created_date": "2024-01-15T08:00:00Z",
    "completion_date": null,
    "responsible_user": "baker_john",
    "ingredients": [
      {
        "jo_ingredient_id": 1,
        "item_id": 1,
        "item_name": "All-Purpose Flour",
        "quantity_required": 100,
        "quantity_consumed": 100,
        "stock_before": 250,
        "stock_after": 150
      },
      {
        "jo_ingredient_id": 2,
        "item_id": 3,
        "item_name": "Cocoa Powder",
        "quantity_required": 20,
        "quantity_consumed": 20,
        "stock_before": 50,
        "stock_after": 30
      }
    ],
    "notes": "Standard batch production"
  }
}
```

### POST /job-orders
Create new job order

**Request**
```json
{
  "product_id": 5,
  "quantity_to_produce": 50,
  "responsible_user": "baker_john",
  "notes": "Standard batch production"
}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "jo_id": 1,
    "jo_number": "JO-2024-001",
    "status": "draft"
  },
  "message": "Job order created successfully"
}
```

### PUT /job-orders/:jo_id/start
Start production (transition from draft to in_progress)

**Response (200)**
```json
{
  "success": true,
  "data": {
    "jo_id": 1,
    "status": "in_progress"
  },
  "message": "Production started"
}
```

### PUT /job-orders/:jo_id/complete
Complete production and update inventory

**Request**
```json
{
  "actual_quantity_produced": 50,
  "notes": "Production completed successfully"
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "jo_id": 1,
    "status": "completed",
    "completion_date": "2024-01-15T16:00:00Z"
  },
  "message": "Job order completed successfully"
}
```

---

## Stock Movements Endpoints

### GET /stock-movements
Get all stock movements

**Query Parameters**
```
?page=1
&limit=50
&item_id=1
&movement_type=production_consumption
&location_id=3
&source_location_id=3
&destination_location_id=5
&startDate=2024-01-01
&endDate=2024-01-31
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "movements": [
      {
        "movement_id": 1,
        "item_id": 1,
        "item_name": "All-Purpose Flour",
        "movement_type": "production_consumption",
        "quantity": 100,
        "location_id": 3,
        "source_location_id": null,
        "destination_location_id": null,
        "location": {
          "location_id": 3,
          "name": "Villa Store"
        },
        "sourceLocation": null,
        "destinationLocation": null,
        "reference_id": "JO-2024-001",
        "reference_type": "JO",
        "user_responsible": "baker_john",
        "timestamp": "2024-01-15T10:30:00Z",
        "notes": "Used in chocolate cake production"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 250,
      "pages": 5
    }
  }
}
```

**Notes:**
- `location_id`, `source_location_id`, and `destination_location_id` filters are optional and can be combined with date filters.
- Transfer rows carry source/destination location objects; single-location rows carry `location`.

### POST /stock-movements
Record manual stock movement

**Request**
```json
{
  "item_id": 1,
  "movement_type": "calculated_loss",
  "quantity": 5.5,
  "location_id": 3,
  "loss_reason": "spoilage",
  "notes": "Flour damaged due to moisture"
}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "movement_id": 1,
    "item_id": 1,
    "quantity": 5.5,
    "timestamp": "2024-01-15T11:00:00Z"
  },
  "message": "Stock movement recorded successfully"
}
```

**Transfer Request Contract**
```json
{
  "item_id": 1,
  "movement_type": "transfer",
  "quantity": 10,
  "source_location_id": 3,
  "destination_location_id": 5,
  "notes": "Rebalancing stock"
}
```

**Validation Notes:**
- `quantity` must be `> 0`.
- For `movement_type=transfer`, both `source_location_id` and `destination_location_id` are required and must be different.
- For `movement_type=calculated_loss`, `loss_reason` is required.
- Optional batch targeting uses `batch_id`; if omitted on deduction flows, FIFO oldest batch is used.

### POST /stock-movements/:id/void
Void a specific stock movement

**Request**
```json
{
  "reason": "Duplicate entry error"
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "movement_id": 95,
    "item_id": 1,
    "movement_type": "adjustment",
    "quantity": -10,
    "reference_type": "MANUAL",
    "notes": "Void of movement #94: Duplicate entry error"
  },
  "message": "Movement voided successfully"
}
```

### GET /stock-movements/export
Export stock movements as CSV

**Query Parameters**
```
?format=csv
&startDate=2024-01-01
&endDate=2024-01-31
&item_id=1
&movement_type=all
```

**Response (200)**
Content-Type: text/csv
Content-Disposition: attachment; filename="stock_movements_2024-01-16.csv"
```csv
Movement ID,Date,Item Name,SKU,Type,Quantity,Location ID,Location,Source Location ID,Source Location,Destination Location ID,Destination Location,Current Stock,Reference,Batch ID,User,Notes
94,"1/16/2026, 3:43:53 PM","Calamansi Label 330ml","PKG-005","transfer","1.00","","","3","Villa Store","5","Bernwood Tower","","N/A","N/A","admin",""
```

---

## Dispatch Orders Endpoints

Dispatch Orders (DO) are first-class outbound documents for finished goods. They trigger `goods_issue` stock movements and support partial dispatch (ship now, ship later). Requires `do:view`, `do:create`, `do:dispatch`, or `do:delete` permissions.

### GET /dispatch-orders
List Dispatch Orders (paginated, filterable).

**Query Params**
| Param | Type | Description |
|-------|------|-------------|
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Results per page (default: 50, max: 200) |
| `status` | string | Filter by status: `draft`, `confirmed`, `partial`, `completed`, `cancelled` |
| `recipient_name` | string | Search by recipient name (partial match) |
| `from_date` | date | Filter dispatch_date >= this date |
| `to_date` | date | Filter dispatch_date <= this date |

**Response (200)**
```json
{
  "success": true,
  "data": {
    "rows": [
      {
        "do_id": 1,
        "do_number": "DO-2026-0001",
        "recipient_name": "Metro Supermarket",
        "recipient_type": "external",
        "dispatch_date": "2026-03-02",
        "status": "confirmed",
        "reference_jo": "JO-2026-0012",
        "reference_po": null,
        "notes": "Rush delivery",
        "line_count": 3,
        "created_at": "2026-03-02T08:00:00Z"
      }
    ],
    "count": 1,
    "page": 1,
    "totalPages": 1
  }
}
```

---

### GET /dispatch-orders/stats
Summary counts grouped by status. Used by the Dispatch Orders page stats cards and Dashboard "Pending Dispatches" card.

**Response (200)**
```json
{
  "success": true,
  "data": {
    "draft": 2,
    "confirmed": 5,
    "partial": 3,
    "completed": 41,
    "cancelled": 1
  }
}
```

---

### GET /dispatch-orders/export
Export Dispatch Orders list as CSV. Applies formula injection protection on all text cells.

**Query Params**: Same filters as GET /dispatch-orders.

**Response (200)**
```
Content-Type: text/csv
Content-Disposition: attachment; filename="dispatch-orders-2026-03-02.csv"
```
```csv
DO Number,Recipient,Recipient Type,Dispatch Date,Status,Reference JO,Reference PO,Lines,Notes,Created At
DO-2026-0001,Metro Supermarket,external,2026-03-02,confirmed,JO-2026-0012,,3,Rush delivery,2026-03-02T08:00:00.000Z
```

---

### GET /dispatch-orders/:id
Get a single Dispatch Order with all lines and associated stock movements.

**Response (200)**
```json
{
  "success": true,
  "data": {
    "do_id": 1,
    "do_number": "DO-2026-0001",
    "recipient_name": "Metro Supermarket",
    "recipient_type": "external",
    "dispatch_date": "2026-03-02",
    "status": "partial",
    "reference_jo": "JO-2026-0012",
    "reference_po": null,
    "notes": null,
    "created_by": 1,
    "confirmed_by": 2,
    "archived_at": null,
    "lines": [
      {
        "line_id": 1,
        "do_id": 1,
        "item_id": 5,
        "qty_ordered": 100,
        "qty_dispatched": 50,
        "qty_voided": 0,
        "unit_of_measure": "pcs",
        "cost_per_unit": "15.5000",
        "notes": null,
        "Item": {
          "item_id": 5,
          "name": "Bottled Juice 330ml",
          "sku_code": "FG-001",
          "current_stock": 200
        }
      }
    ],
    "movements": [
      {
        "movement_id": 88,
        "movement_type": "goods_issue",
        "quantity": -50,
        "reference_type": "DO",
        "reference_id": "1",
        "notes": "Dispatched 50 pcs to Metro Supermarket (DO-2026-0001)",
        "created_at": "2026-03-02T09:15:00Z"
      }
    ],
    "creator": { "user_id": 1, "username": "admin" },
    "confirmer": { "user_id": 2, "username": "manager1" }
  }
}
```

---

### POST /dispatch-orders
Create a new Dispatch Order (status = `draft`). No stock is deducted at this step.

**Permission**: `do:create`

**Request Body**
```json
{
  "recipient_name": "Metro Supermarket",
  "recipient_type": "external",
  "dispatch_date": "2026-03-05",
  "reference_jo": "JO-2026-0012",
  "reference_po": null,
  "notes": "Rush delivery",
  "lines": [
    { "item_id": 5, "qty_ordered": 100, "notes": null },
    { "item_id": 8, "qty_ordered": 50, "notes": "Check expiry first" }
  ]
}
```

**Validation Rules**
- `recipient_name`: required, max 200 chars
- `recipient_type`: `external` | `internal`
- `dispatch_date`: required, valid date
- `lines`: required, non-empty array; each line must have `item_id` and `qty_ordered > 0`

**Response (201)**
```json
{
  "success": true,
  "data": { "do_id": 3, "do_number": "DO-2026-0003", "status": "draft", ... },
  "message": "Dispatch Order DO-2026-0003 created"
}
```

---

### PUT /dispatch-orders/:id
Update a Dispatch Order. Only allowed when status is `draft`.

**Permission**: `do:create`

**Request Body**: Same schema as POST. All fields optional (partial update).

**Response (200)**
```json
{ "success": true, "data": { ...updatedDO }, "message": "Dispatch Order updated" }
```

---

### POST /dispatch-orders/:id/confirm
Confirm a Dispatch Order: `draft` → `confirmed`. Locks the header; items are reserved for dispatch. No stock change yet.

**Permission**: `do:create`

**Response (200)**
```json
{ "success": true, "data": { "status": "confirmed", ... }, "message": "Dispatch Order confirmed" }
```

---

### POST /dispatch-orders/:id/dispatch
Execute a dispatch run. Deducts stock from `fifo_batches` and creates `goods_issue` StockMovement records. Transitions status: `confirmed` → `partial` or `completed`.

**Permission**: `do:dispatch`

**Request Body**
```json
{
  "lines": [
    { "line_id": 1, "qty_to_dispatch": 50 },
    { "line_id": 2, "qty_to_dispatch": 30 }
  ]
}
```

**Behavior**:
- FIFO used for non-perishable items (`shelf_life_days = null`)
- FEFO used for perishable items (`shelf_life_days IS NOT NULL`) — batches sorted by `expiry_date ASC`
- Partial dispatch: if `qty_to_dispatch < qty_remaining` on all lines, status = `partial`
- Full dispatch: if all lines are now fully dispatched, status = `completed`
- Creates one `StockMovement` per line dispatched: `movement_type = 'goods_issue'`, `reference_type = 'DO'`, `reference_id = line_id`

**Response (200)**
```json
{
  "success": true,
  "data": {
    "do_id": 1,
    "status": "partial",
    "lines_dispatched": 2,
    "movements_created": 2
  },
  "message": "Dispatched 2 line(s) successfully"
}
```

**Error (400)** — Insufficient stock:
```json
{
  "success": false,
  "message": "Insufficient stock for Bottled Juice 330ml. Available: 30, Requested: 50"
}
```

---

### POST /dispatch-orders/:id/cancel
Cancel a Dispatch Order. Only allowed from `draft` or `confirmed` status.

**Permission**: `do:delete`

**Request Body**
```json
{ "reason": "Customer cancelled order" }
```

**Response (200)**
```json
{ "success": true, "data": { "status": "cancelled" }, "message": "Dispatch Order cancelled" }
```

---

### POST /dispatch-orders/:id/archive
Archive a completed or cancelled Dispatch Order. Sets `archived_at` timestamp.

**Permission**: `do:delete`

**Response (200)**
```json
{ "success": true, "message": "Dispatch Order archived" }
```

---

## POS Endpoints

Point-of-Sale (POS) handles real-time cashier transactions for POS-visible active items. POS writes create `goods_issue` stock movements using `reference_type='POS'`.

Gating notes:
- Plan gate uses `requirePremium`.
- Permission gate uses `checkPermission` (for example `pos:view`, `pos:transact`).
- In billing-paused mode (`PAYMENTS_ENABLED=false`), `requirePremium` is plan-driven (`plan === premium`) and does not block on `subscription_status`.
- In live billing mode (`PAYMENTS_ENABLED=true`), `requirePremium` also enforces active/grace subscription state.

### GET /pos/catalog
List sellable POS catalog items.

**Permission**: `pos:view`  
**Plan Gate**: Premium (`requirePremium`)

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `search` | string | Optional item name/SKU search |
| `limit` | number | Max rows (default 100, capped at 500) |
| `folder_id` | number | Optional folder filter (`item_folders.folder_id`) |

**Notes:**
- Response enforces `pos_visible !== false`.
- Response includes out-of-stock rows; POS clients should display unavailable state for `current_stock <= 0`.
- POS folder chips should only show folders where `show_in_pos_filter = true`.
- Hidden folders (`show_in_pos_filter = false`) are not listed as POS filters, but their eligible items remain discoverable in unfiltered/search catalog results.
- Default visibility policy when no override row exists:
  - `category=product` + `product_type=finished_goods`: visible by default
  - other categories/types: hidden until explicitly enabled (`pos_visible=true`)

### GET /pos/catalog-overrides
List POS catalog overrides for admin inventory/POS configuration screens.

**Permission**: `pos:view`  
**Plan Gate**: Premium (`requirePremium`)

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `search` | string | Optional item name/SKU search |
| `limit` | number | Max rows (default 200, capped at 1000) |

**Response Notes**
- Includes normalized `pos_readiness` object for guided UX:
  - `ready`, `state`, `score`
  - `checks` map
  - `missing_requirements[]` with `code`, `label`, `fix_hint`
- Readiness is used by IMS setup flows to resolve POS blockers before cashier checkout.

### PATCH /pos/catalog-overrides/:item_id
Create/update POS catalog override for an item.

**Permission**: `items:edit`  
**Plan Gate**: Premium (`requirePremium`)

**Request Body**
```json
{
  "pos_visible": true
}
```

### POST /pos/catalog-overrides/:item_id/image
Upload/replace POS catalog image override (multipart file upload).

**Permission**: `items:edit`  
**Plan Gate**: Premium (`requirePremium`)

**Request**: `multipart/form-data` with `image` file field.

**Validation Contract**
- Endpoint accepts image files only.
- Unsupported upload types are rejected with `422 Validation failed`.
- Existing image is replaced atomically when a valid new image is uploaded.

**Image URL Contract**
- Backend stores and returns `pos_image_url` as a path under `/uploads/...`.
- Local frontend dev/prod-preview surfaces must proxy `/uploads` to backend target (same as `/api`) so catalog/terminal/storefront images render correctly from local app hosts (for example `localhost:5173`, `localhost:5174`, `localhost:5175`).
- If `/uploads` proxy is missing, images appear as broken placeholders even when upload succeeds.
- Frontend clients must treat returned `/uploads/...` paths as backend assets; when API origin differs from app origin, resolve these paths with this precedence:
  1. `VITE_ASSET_BASE_URL`
  2. `VITE_API_BASE_URL`
  3. absolute `VITE_API_URL` (ignore relative values such as `/api/v1`)

### DELETE /pos/catalog-overrides/:item_id/image
Remove POS image override and revert to default item image behavior.

**Permission**: `items:edit`  
**Plan Gate**: Premium (`requirePremium`)

### POST /pos/checkouts
Execute a POS checkout transaction (atomic). Creates:
1. `pos_transactions` header
2. `pos_transaction_lines` with immutable VAT snapshots
3. `stock_movements` entries (`movement_type='goods_issue'`, `reference_type='POS'`)

Order-method fee policy (current contract):
- Tenant config key: `pos_order_method_fees` (JSON matrix for `dine_in`, `takeout`, `pickup`, `delivery`; legacy `online` key is read-compatible only).
- Optional payload field: `service_fee_amount` (cashier override).
- Service fee is stored as immutable snapshots on transaction header:
  - `service_fee_amount`
  - `service_fee_label_snapshot`
  - `service_fee_method_snapshot`
  - `service_fee_overridden`

Discount policy (current contract):
- Non-zero discount requires `discount_profile_name` from tenant-configured `pos_discount_profiles`.
- Backend recomputes discount from the saved preset percentage and ignores client-side tampering.
- POS transaction stores immutable snapshots:
  - `discount_label_snapshot`
  - `discount_rate_snapshot` (percentage, `0.0000` to `100.0000`)
- Special-discount identity evidence:
  - For discount labels that map to `senior`, `pwd`, or `national_athlete`, request must include:
    - `discount_beneficiary.category`
    - `discount_beneficiary.name`
    - `discount_beneficiary.id_number`
  - Evidence is stored in immutable transaction metadata and exposed in compliance package exports.

Payment handoff policy (current contract):
- Optional request field: `payment_handoff_mode` (`external` | `internal`).
- Default behavior:
  - `cash` -> `internal`
  - non-cash (`gcash`, `maya`, `card`, `bank_transfer`) -> `external`
- When BSP OPS controls are incomplete, internal non-cash flows are denied with reason-coded compliance errors; external handoff remains allowed.

**Permission**: `pos:transact`  
**Plan Gate**: Premium (`requirePremium`)

**Compliance Gate (dual-mode, fail-closed for compliant mode)**  
Checkout is evaluated by the compliance policy engine:
1. `compliance_mode_choice_required=true` blocks checkout and terminal operations (`LEGACY_MODE_SELECTION_REQUIRED`).
2. `non_compliant_active` allows checkout with non-fiscal receipt contract only (`document_type=non_fiscal_slip`).
3. `compliant_pending` allows operations, but fiscal output remains blocked until activation checklist is complete.
4. `compliant_active` fails closed when checklist controls are unmet:
   - incomplete profile/settings (`COMPLIANCE_PROFILE_INCOMPLETE`)
   - unverified/missing artifacts (`COMPLIANCE_ARTIFACTS_INCOMPLETE`)
   - missing terminal-qualified accredited peripherals (`TERMINAL_DEVICE_MISMATCH` or `ACCREDITED_PERIPHERAL_REQUIRED`)

Compliance checklist contract (used by Settings > Compliance and Admin review):
- `GET /api/v1/compliance/checklist` includes legacy missing arrays plus guided UX fields:
  - `requirements[]` (`code`, `label`, `section`, `status`, `action_target`)
  - `section_progress`
  - `activation_blockers[]`
  - `next_blocking_step`
  - `documentary_readiness` (`complete`, `total`, `missing`, `ready`, `items[]`)
    - `items[]` includes `quality_ok`, `quality_issues[]`, `fresh`, and `age_days` for deterministic documentary evidence gating
  - `evidence.encryption_policy_prerequisites_ready`
  - `evidence.encryption_policy_checks`
  - `evidence.encryption_policy_issues[]`
- `POST /api/v1/compliance/activate` requires body payload:
  - `{ "confirmation_text": "ACTIVATE COMPLIANT" }`

Final Review documentary (tenant self-serve):
- `GET /api/v1/compliance/final-review/documents`
  - Returns tenant documentary records plus sign-off metadata.
- `POST /api/v1/compliance/final-review/documents`
  - Create or update a requirement submission (source type `upload` or `external_url`).
- `POST /api/v1/compliance/final-review/documents/:document_id/upload`
  - Attach or replace uploaded file (multipart form field `file`).
- `PUT /api/v1/compliance/final-review/signoff-metadata`
  - Store tenant sign-off metadata (`engineering_approver`, `compliance_approver`, `filing_batch_id`, signed-at dates).
- `POST /api/v1/compliance/final-review/documents/:document_id/review`
  - Platform-admin only review/revoke/restore (tenant path supports only platform admin actors).

**Calculation Contract**
1. `items_subtotal = sum(line qty * line sale_price)`
2. `discount_amount = selected_discount_percentage * items_subtotal`
3. `net_items_total = items_subtotal - discount_amount`
4. `service_fee_amount = configured method fee or validated override`
5. `total_amount = net_items_total + service_fee_amount`

**VAT Rule**
- VAT buckets are computed from discounted item lines only.
- `service_fee_amount` is treated as non-VAT for POS VAT buckets.

### GET /pos/transactions
List POS transactions with cashier metadata and pagination.

**Permission**: `pos:view`  
**Plan Gate**: Premium (`requirePremium`)

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `page` | number | Page number (default 1) |
| `limit` | number | Rows per page (default 20, max 200) |
| `search` | string | Invoice number search |
| `status` | string | `completed` or `voided` |
| `cashier_id` | number | Filter by cashier user id |
| `payment_type` | string | `cash`, `gcash`, `maya`, `card`, `bank_transfer` |
| `order_method` | string | `dine_in`, `takeout`, `pickup`, `delivery` (legacy `online` accepted for historical filters) |
| `order_source` | string | `in_store`, `online_store` |
| `date_from` | ISO date | Inclusive start date filter |
| `date_to` | ISO date | Inclusive end date filter |

### GET /pos/transactions/:id
Get full POS transaction details (header + lines + item snapshots).

**Permission**: `pos:view`  
**Plan Gate**: Premium (`requirePremium`)

### GET /pos/terminal/shifts/current
Get the current open shift and cash summary for a terminal.

**Permission**: `pos:view`  
**Plan Gate**: Premium (`requirePremium`)

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `terminal_id` | string | Terminal identifier (e.g. `COUNTER-01`) |

### POST /pos/terminal/shifts/open
Open a terminal shift for cashier operations.

**Permission**: `pos:transact`  
**Plan Gate**: Premium (`requirePremium`)

**Request Body**
```json
{
  "idempotency_key": "shift-open-20260409-counter-01",
  "terminal_id": "COUNTER-01",
  "opening_float_amount": 500.0,
  "opening_note": "Start of day float"
}
```

**Response Notes**
- Successful responses include:
  - `data.idempotent_replay` (`true` for replay hit, otherwise `false`)
  - `data.replay_outcome` (`processed` or `idempotent_replay`)
  - `data.terminal_identity_policy` with mode/registry context and optional warning metadata
- Idempotency conflict/blocked outcomes return error payloads with `errors.idempotency.outcome` (`conflict` or `blocked`).
- Frontend contract: terminal unlock/sign-in must collect user-selected `terminal_id` and forward it to shift/dashboard/checkout flows (UI should not rely on hard-coded terminal identity).
- Registry policy is mode-driven:
  - `warn`: operation continues with warning reason codes (`TERMINAL_ID_MISSING_WARN`, `TERMINAL_ID_UNREGISTERED_WARN`)
  - `enforce`: operation is denied when registry controls fail (`TERMINAL_REGISTRY_REQUIRED`, `TERMINAL_ID_REQUIRED_FOR_ENFORCED_REGISTRY`, `TERMINAL_ID_NOT_REGISTERED`)

### POST /pos/terminal/shifts/:id/cash-events
Record a cash drawer adjustment event for an active shift.

**Permission**: `pos:cash_drawer_adjust`  
**Plan Gate**: Premium (`requirePremium`)

**Request Body**
```json
{
  "idempotency_key": "cash-event-20260409-001",
  "event_type": "cash_in",
  "amount": 100.0,
  "reason": "Petty cash top-up"
}
```

**Response Notes**
- Successful responses include `data.idempotent_replay` and `data.replay_outcome` with the same contract as shift-open.

### POST /pos/terminal/shifts/:id/close
Close a terminal shift and lock in shift-level cash variance data.

**Permission**: `pos:close_day`  
**Plan Gate**: Premium (`requirePremium`)

**Request Body**
```json
{
  "idempotency_key": "shift-close-20260409-001",
  "closing_cash_amount": 1200.0,
  "closing_note": "End of shift handover"
}
```

**Response Notes**
- Successful responses include `data.idempotent_replay` and `data.replay_outcome` with the same contract as shift-open.

### GET /pos/terminal/dashboard/today
Get today dashboard totals for terminal operations.

**Permission**: `pos:view`  
**Plan Gate**: Premium (`requirePremium`)

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `terminal_id` | string | Terminal identifier (e.g. `COUNTER-01`) |

### GET /pos/incoming-orders
List incoming online orders for POS fulfillment queue.

**Permission**: `pos:view`  
**Plan Gate**: Premium (`requirePremium`)

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `location_id` | number | Optional active location filter |
| `limit` | number | Optional row limit (default 200, max 500) |

**Response Notes**
1. Returns orders still in operational queue (`placed`, `confirmed`, `preparing`, `ready_for_pickup`, `out_for_delivery`).
2. Completed, cancelled, and rejected orders are excluded from this queue endpoint.

### PATCH /pos/orders/:id/status
Update online order fulfillment status from POS terminal operations.

**Permission**: `pos:transact`  
**Plan Gate**: Premium (`requirePremium`)

**Request Body**
```json
{
  "idempotency_key": "order-status-20260409-789-completed",
  "fulfillment_status": "confirmed"
}
```

**Supported Status Values**
- `placed`
- `confirmed`
- `preparing`
- `ready_for_pickup`
- `out_for_delivery`
- `completed`
- `cancelled`
- `rejected`

**Transition Notes**
1. Allowed transitions are lifecycle-validated server-side.
2. Delivery orders must progress to `out_for_delivery` (not `ready_for_pickup`).
3. Non-delivery orders must use `ready_for_pickup` where applicable.
4. Successful responses include `data.idempotent_replay` and `data.replay_outcome` (`processed` or `idempotent_replay`); conflicts/blocked replays surface in error payload idempotency details.

### POST /pos/z-reading/close-day
Generate same-day Z-reading summary for completed POS transactions.

**Permission**: `pos:close_day`  
**Plan Gate**: Premium (`requirePremium`)

**Extended Response Fields (non-breaking)**
- `snapshot_persisted` (`boolean`)
- `reading_identifier` (`string`, stable per persisted close-day snapshot)
- `counters`:
  - `z_counter`
  - `reset_counter`
  - `lifetime_grand_total_cents`
  - `lifetime_grand_total`

### GET /pos/z-reading/:date
Retrieve Z-reading summary for a specific business date (`YYYY-MM-DD`).

**Permission**: `pos:view`  
**Plan Gate**: Premium (`requirePremium`)

When a persisted snapshot exists for the requested date, response uses the stored snapshot payload.
When no snapshot exists, response is computed on demand with `snapshot_persisted=false`.

Z-reading summary includes:
- `transaction_count`
- `subtotal_amount`
- `discount_amount`
- `service_fee_total`
- VAT buckets and `total_amount`
- `payment_breakdown[]`

### GET /pos/x-reading/current
Retrieve an in-progress (on-demand) X-reading snapshot for a business date and optional terminal.

**Permission**: `pos:view`  
**Plan Gate**: Premium (`requirePremium`)

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `business_date` | ISO date | Optional business date (`YYYY-MM-DD`, defaults to today in Manila business timezone) |
| `terminal_id` | string | Optional terminal filter |

**Response Notes**
- Always computed on-demand (`snapshot_persisted=false`).
- Includes `reading_identifier` with `XR-` prefix.
- Includes current counters (`z_counter`, `reset_counter`, `lifetime_grand_total_cents`, `lifetime_grand_total`).

### POST /pos/z-reading/governed-reset
Record a governed reset-counter increment event with immutable event metadata.

**Permission**: `pos:close_day`  
**Plan Gate**: Premium (`requirePremium`)

**Request Body**
```json
{
  "reason": "Audit reset event after regulator validation",
  "evidence_ref": "AUDIT-2026-04-08-001",
  "confirmation_text": "INCREMENT RESET COUNTER"
}
```

**Response Notes**
- Increments `reset_counter`.
- Persists a reset event snapshot (`reading_identifier` with `RST-` prefix) for audit traceability.
- Returns updated counters and `reset_event_identifier`.

### GET /reports/compliance-package
Return compliance books package with stable schema contracts for:
1. `sales_journal`
2. `purchase_journal`
3. `inventory_book`
4. `special_discount_journal`

**Permission**: `reports:view` (same report-surface policy as other report endpoints)  
**Plan Gate**: Existing report gates

**Response Fields**
- `schema_version` (`compliance-books.v1`)
- `generated_at`
- `date_range`
- `sales_journal.columns[]`, `sales_journal.rows[]`
- `purchase_journal.columns[]`, `purchase_journal.rows[]`
- `inventory_book.columns[]`, `inventory_book.rows[]`
- `special_discount_journal.columns[]`, `special_discount_journal.rows[]`
- `record_counts`
- `submission_manifest` (`version`, `filing_profile`, `generated_at`, `checksums`, `instructions_ref`)
  - `checksums` includes journal hashes plus documentary artifact hashes:
    - `system_flow_diagram_sha256`
    - `system_flow_diagram_image_sha256`
    - `software_specification_sha256`
    - `backup_disaster_recovery_plan_sha256`
    - `filing_instructions_sha256`
    - `restore_drill_evidence_sha256`
    - `encryption_verification_evidence_sha256`

**Security Signal Notes**
- Large exports (threshold-based) emit immutable compliance security signal audit events (`event_type=security_signal`, `operation=security.mass_export_threshold_reached`) for breach-readiness evidence.

### GET /reports/compliance-package/export
Return submission-ready compliance export bundle metadata and CSV file payloads for filing workflows.

**Permission**: `reports:view`  
**Plan Gate**: Existing report gates

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `startDate` | ISO datetime | Optional inclusive range start |
| `endDate` | ISO datetime | Optional inclusive range end |
| `filing_profile` | string | Optional filing profile token (`dgfy` default) |

**Response Fields**
- `bundle_name`
- `generated_at`
- `filing_profile`
- `submission_manifest`
- `record_counts`
- `files[]` (`name`, `mime_type`, `content`)

---

## Storefront Discovery And Guest Store Endpoints

### GET /storefront/discovery
List publicly discoverable stores for list/grid/map storefront views.

**Auth**: Public  
**Tenant Context**: Not required for this discovery endpoint

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `search` | string | Optional keyword against store name/slug/address/location or tenant catalog item name |
| `latitude` | number | Optional user latitude for distance sorting |
| `longitude` | number | Optional user longitude for distance sorting |
| `page` | number | Page number (default 1) |
| `limit` | number | Rows per page (default 20, max 100) |

**Search Notes**
- Item-name search includes tenants that have matching catalog items.
- Item-name matching considers storefront-visible items regardless of stock.
- Storefront-visible follows POS policy precedence: explicit `pos_visible` override first; otherwise default visibility is `category=product` + `product_type=finished_goods`.

### GET /storefront/discovery/:slug
Resolve one storefront profile by tenant slug for public storefront entry.

**Auth**: Public  
**Tenant Context**: Not required

**Security Note**: Discovery payloads do not expose `company_token`.

### GET /store/catalog
List tenant storefront catalog items (public read).

**Auth**: Public  
**Tenant Context**: Required (`x-store-slug` header for public store tenant resolution)

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `search` | string | Optional item name filter |
| `limit` | number | Row limit (default 60, max 200) |

Catalog rows include:
- `item_id`, `name`, `category`, `unit_of_measure`
- `is_available` (`true`/`false`)
- `availability_status` (`in_stock`/`out_of_stock`)
- `default_sale_price`
- `vat_type`
- `image_url` (from POS catalog override when available)
  - may be an absolute URL or backend-relative `/uploads/...` path
  - storefront/POS clients should gracefully show a placeholder when image load fails

**Availability Contract**
- `current_stock` is intentionally not exposed in public storefront catalog payloads.
- `cost_per_unit` is intentionally not exposed in public storefront catalog payloads.
- Exact quantity remains server-side and is enforced during quote/checkout validation.

**Catalog Search Note**
- `search` narrows by item name only; out-of-stock rows are still returned when storefront-visible.
- Storefront-visible follows POS policy precedence: explicit `pos_visible` override first; otherwise default visibility is `category=product` + `product_type=finished_goods`.

### GET /store/locations
List active tenant fulfillment locations for a specific storefront tenant page.

**Auth**: Public  
**Tenant Context**: Required (`x-store-slug` header for public store tenant resolution)

**Response Notes**
1. Returns active locations only.
2. Includes `primary_location_id`.
3. Discovery (`/storefront/discovery`) remains one row per tenant.
4. Storefront UI may additionally resolve `/store/locations` per tenant and rank/map by nearest active branch pin while still opening the same tenant page.

### POST /store/cart/quote
Compute quote totals for guest or store-customer checkout.

**Auth**: Optional store customer (`Store JWT`)  
**Tenant Context**: Required (`x-store-slug` header for public store tenant resolution)

**Validation Note**
- When requested quantity exceeds current stock, response is `422` with machine-readable stock violation details in `errors`.

### POST /store/checkout
Create online-store order and return tracking metadata.

**Auth**: Optional store customer (`Store JWT`)  
**Tenant Context**: Required (`x-store-slug` header for public store tenant resolution)

**Validation Note**
- Validation or stock-constraint breaches return `422` with machine-readable error details.
- Server errors (`500`) are not the expected contract for normal checkout validation failures.

### GET /store/track/:tracking_pin
Track online-store order status for public users.

**Auth**: Public  
**Tenant Context**: Required (`x-store-slug` header for public store tenant resolution)  
**Response Contract**: Valid tracking PIN returns `200` with explicit status payload.

### VAT Data Placement (Current Contract)
1. Default item classification: `items.vat_type`
2. Immutable legal snapshot per sold line:
   - `pos_transaction_lines.vat_type_snapshot`
   - `pos_transaction_lines.vat_rate_snapshot`
3. Transaction-level receipt totals:
   - `pos_transactions.vatable_sales`
   - `pos_transactions.vat_amount`
   - `pos_transactions.vat_exempt_sales`
   - `pos_transactions.zero_rated_sales`
4. Tenant POS receipt/business metadata is stored in `system_settings`:
   - `pos_business_name`
   - `pos_tin_branch`
   - `pos_address`
   - `pos_ptu_number`
   - `pos_min_number`
   - `pos_accreditation_number`
   - `pos_receipt_footer_message`
   - `pos_discount_profiles` (JSON array of `{name, percentage, active}`)
   - `pos_order_method_fees` (JSON object keyed by method with `{enabled, amount, label}`)
   - `pos_petty_cash_symbol`
   - `pos_petty_cash_amount`
5. Compliance lifecycle/profile is tenant-level (`tenants` + compliance module tables), not controlled by a strict-toggle setting.

---

## Unified Sales Endpoints

Unified Sales is a **read-only** reporting surface that consolidates POS and Dispatch data.

### Domain Boundary Note
- Dispatch and POS remain separate write domains.
- Unified Sales combines both domains only at query/reporting time.
- No mutation of POS or Dispatch source records is performed by unified sales reads.

### GET /sales/transactions
List normalized sales timeline rows from:
1. POS (`source='POS'`)
2. Dispatch (`source='DISPATCH'`)

Shared fields include date/time, reference number, source, gross sales, VAT buckets (if available), COGS, gross profit, and status.
For POS rows, service-fee snapshots are included (`service_fee_amount`, label/method/override fields).
POS rows now also expose `pos_order_source` (`in_store`, `online_store`) for channel-level filtering/audit.

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `page` | number | Page number (default 1) |
| `limit` | number | Rows per page (default 20, max 200) |
| `source` | string | `POS`, `DISPATCH`, or omitted for both |
| `source_id` | number | Optional source transaction ID (`pos_transaction_id` or `do_id`) |
| `search` | string | Search reference/customer/recipient |
| `status` | string | Source status filter |
| `payment_type` | string | POS-only filter |
| `order_method` | string | POS-only filter (`dine_in`, `takeout`, `pickup`, `delivery`; legacy `online` accepted for historical rows) |
| `pos_order_source` | string | POS-only channel filter (`in_store`, `online_store`) |
| `date_from` | ISO date | Inclusive start date |
| `date_to` | ISO date | Inclusive end date |
| `sort_by` | string | `occurred_at`, `gross_sales`, `cogs`, `gross_profit`, `reference_no` |
| `sort_order` | string | `asc` or `desc` |
| `export` | string | `csv` returns CSV download |

**Validation Notes**
1. Query values are validated before read execution.
2. Invalid enum values (for example unsupported `pos_order_source` or `sort_by`) return `422 Validation failed` with field-level errors.

---

## Reports Endpoints

### GET /reports/expiry
Get expiry-risk report (near-expiry, expired, and healthy buckets).

**Query Parameters**
```
?startDate=2026-04-01
&endDate=2026-04-18
&location_id=3
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "near_expiry": [
      {
        "batch_id": 22,
        "item_name": "All-Purpose Flour",
        "sku_code": "ING-001",
        "location_id": 3,
        "location_name": "Villa Store",
        "remaining_quantity": 40,
        "expiry_date": "2024-12-01",
        "days_until_expiry": 5
      }
    ]
  }
}
```

### GET /reports/stock-aging-enhanced
Get FIFO batch aging analytics with value-at-risk details.

**Query Parameters**
```
?startDate=2026-04-01
&endDate=2026-04-18
&location_id=3
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "batches": [
      {
        "batch_id": 22,
        "item_name": "All-Purpose Flour",
        "sku_code": "ING-001",
        "location_id": 3,
        "location_name": "Villa Store",
        "received_date": "2026-03-01",
        "expiry_date": "2026-05-01",
        "days_in_stock": 48,
        "remaining_quantity": 40,
        "cost_per_unit": 25.5,
        "value_at_risk": 1020
      }
    ]
  }
}
```

### GET /reports/export
Export report output as CSV.

**Query Parameters**
```
?type=expiry
&startDate=2026-04-01
&endDate=2026-04-18
&location_id=3
```

**Supported `type` values**
- `expiry`
- `stockAging`
- `production`
- `poAnalysis`
- `executiveSummary`

**CSV Contract Notes (location-aware):**
- `type=expiry` CSV includes `Location` column.
- `type=stockAging` CSV includes `Location` column.
- Date filters are normalized server-side to a max range of 365 days.

### GET /reports/stock-aging
Legacy lightweight aging endpoint kept for backward compatibility.

### GET /reports/surplus-shortage
Get surplus and shortage report

**Response (200)**
```json
{
  "success": true,
  "data": {
    "surplus": [
      {
        "item_id": 2,
        "item_name": "Sugar",
        "current_stock": 800,
        "max_capacity": 500,
        "excess_quantity": 300,
        "estimated_value": 7500
      }
    ],
    "shortage": [
      {
        "item_id": 3,
        "item_name": "Cocoa Powder",
        "current_stock": 10,
        "min_threshold": 50,
        "shortage_quantity": 40,
        "recommended_action": "Urgent PO required"
      }
    ]
  }
}
```

### GET /reports/financial-summary
Get financial tracking report

**Query Parameters**
```
?startDate=2024-01-01
&endDate=2024-01-31
&groupBy=category
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "report": [
      {
        "category": "ingredient",
        "total_inventory_value": 45000,
        "total_cogs": 12000,
        "total_movements": 150,
        "average_cost_per_unit": 25.50
      }
    ],
    "summary": {
      "total_inventory_value": 120000,
      "total_cogs": 35000,
      "inventory_turnover_ratio": 2.5
    }
  }
}
```

### GET /reports/supplier-performance
Get supplier performance report

**Query Parameters**
```
?startDate=2024-01-01
&endDate=2024-01-31
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "suppliers": [
      {
        "supplier_id": 1,
        "supplier_name": "Flour Supplier Inc",
        "total_orders": 5,
        "on_time_delivery_rate": 100,
        "quality_rating": 4.5,
        "average_delivery_days": 3,
        "total_spent": 25500
      }
    ]
  }
}
```

---

## Frontend-Backend Integration Points

### 1. Authentication Flow

```
Frontend                          Backend
   │                                │
   ├─── POST /auth/login ──────────>│
   │                                │
   │<─── JWT Token + Refresh ───────┤
   │                                │
   ├─ Store in localStorage ─┐      │
   │                         │      │
   │ Add to headers ──────────────>│
   │ (Authorization: Bearer)       │
   │                                │
   │<─── Protected Resource ───────┤
   │                                │
```

### 2. Item Management Flow

```
Frontend                          Backend
   │                                │
   ├─── GET /items ───────────────>│
   │                                │
   │<─── Items List ────────────────┤
   │                                │
   ├─── POST /items ──────────────>│
   │ (Create new item)              │
   │                                │
   │<─── Item Created ──────────────┤
   │                                │
   ├─── PUT /items/:id ───────────>│
   │ (Update item)                  │
   │                                │
   │<─── Item Updated ──────────────┤
   │                                │
```

### 3. Purchase Order Flow

```
Frontend                          Backend
   │                                │
   ├─── GET /suppliers ───────────>│
   │ (Get available suppliers)      │
   │                                │
   │<─── Suppliers List ────────────┤
   │                                │
   ├─── POST /purchase-orders ────>│
   │ (Create PO)                    │
   │                                │
   │<─── PO Created ────────────────┤
   │                                │
   ├─ Poll status or WebSocket ────>│
   │                                │
   │<─── PO Status Updates ─────────┤
   │                                │
   ├─── POST /purchase-orders/receive
   │ (Record receipt)               │
   │                                │
   │<─── Inventory Updated ─────────┤
   │                                │
```

### 4. Job Order Production Flow

```
Frontend                          Backend
   │                                │
   ├─── GET /items (products) ────>│
   │ (Get available products)       │
   │                                │
   │<─── Products List ─────────────┤
   │                                │
   ├─── POST /job-orders ─────────>│
   │ (Create JO)                    │
   │                                │
   │<─── JO Created ────────────────┤
   │                                │
   ├─── PUT /job-orders/:id/start >│
   │ (Start production)             │
   │                                │
   │<─── Production Started ────────┤
   │                                │
   ├─── PUT /job-orders/:id/complete
   │ (Complete production)          │
   │                                │
   │<─── Inventory Updated ─────────┤
   │ (Ingredients deducted,         │
   │  Products added)               │
   │                                │
```

### 5. Real-time Notifications (WebSocket)

```
Frontend                          Backend
   │                                │
   ├─── WebSocket Connect ────────>│
   │                                │
   │<─── Connection Established ───┤
   │                                │
   │                   (Background Job)
   │                   Low Stock Alert
   │                                │
   │<─── Real-time Alert ──────────┤
   │ {type: 'LOW_STOCK',            │
   │  item: 'Cocoa Powder'}         │
   │                                │
```

---

## Data Synchronization Strategy

### 1. Initial Data Load
- Load items, suppliers, and settings on app startup
- Cache in Redux/Zustand store
- Implement optimistic updates

### 2. Real-time Updates
- Use WebSocket for critical updates (stock levels, alerts)
- Poll for non-critical data (reports, analytics)
- Implement exponential backoff for failed requests

### 3. Offline Support
- Implement service worker for offline caching
- Queue mutations when offline
- Sync when connection restored

### 4. Error Handling
- Implement retry logic with exponential backoff
- Display user-friendly error messages
- Log errors to backend for debugging

---

## API Rate Limiting

### Rate Limits
- **Authenticated Users**: 1000 requests per hour
- **Unauthenticated**: 100 requests per hour
- **Burst Limit**: 50 requests per minute

### Headers
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642329600
```

---

## API Documentation Tools

### Swagger/OpenAPI
- Auto-generated from code
- Interactive API explorer
- Available at: `/api/v1/docs`

### Postman Collection
- Export for team collaboration
- Pre-configured authentication
- Example requests and responses

---

## Security Considerations

### Input Validation
- All inputs validated on backend
- Sanitize to prevent SQL injection
- Validate data types and ranges

### Authorization
- Role-based access control (RBAC)
- Resource-level permissions
- Audit all sensitive operations

### Data Protection
- Encrypt sensitive data in transit (HTTPS)
- Hash passwords with bcrypt
- Implement CORS properly

### API Security
- Implement CSRF protection
- Rate limiting
- Request signing for critical operations

---

## AI Assistant Endpoints

### POST /ai/chat
Send a message to the AI assistant, optionally with file attachments.

**Request (Multipart Form Data)**
- `message` (string): User message
- `conversationId` (uuid, optional): ID of existing conversation
- `files` (file[], optional): Up to 5 files (PDF, DOCX, Images, Text, CSV)

**Response (200)**
```json
{
  "success": true,
  "data": {
    "content": "Hello! I see you uploaded a PDF. Based on the content...",
    "conversationId": "uuid",
    "type": "text",
    "toolContext": {}
  }
}
```

### POST /ai/confirm
Confirm and execute a pending AI action.

**Request**
```json
{
  "actionId": "uuid"
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "result": { "po_id": 123 },
    "message": "Purchase Order created successfully"
  }
}
```

### GET /ai/conversations
List user's conversation history.

**Response (200)**
```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "conversation_id": "uuid",
        "title": "Inventory Status",
        "updated_at": "2026-02-02T..."
      }
    ]
  }
}
```

### GET /ai/exports/:id
Download a temporary CSV export generated by the AI assistant.

**Response (200)**
- Stream: CSV File Attachment

---

## Payments & Subscription Endpoints

> Status update (2026-04-03): Subscription/payment workflows are disabled by default.
> Unless `PAYMENTS_ENABLED=true` is explicitly set on the backend and matching frontend flags are enabled, all `/payments/*` endpoints are treated as unavailable.

### `/payments/*` route behavior in default mode

**Response (503)**
```json
{
  "success": false,
  "message": "Payments are temporarily disabled while the billing direction is being updated.",
  "code": "PAYMENTS_DISABLED"
}
```

Applies to public and private payment routes, including but not limited to:
- `POST /payments/webhook`
- `POST /payments/request-reactivation`
- `POST /payments/reactivate-with-paypal`
- `POST /payments/reactivate-with-paymongo`
- `POST /payments/migrate-to-paypal`
- `POST /payments/migrate-to-paymongo`
- `POST /payments/change-plan`
- `POST /payments/setup-paymongo-recurring`
- `GET /payments/history`
- `GET /payments/pending-plan`

---
### POST /admin/tenants/resubmit
Re-submit a rejected registration for review. Resets status to `pending` and clears `rejection_reason`. **Public endpoint** — authenticated only by `x-company-token` header.

**Access:** x-company-token header only

**Response (200)**
```json
{ "success": true, "message": "Registration re-submitted for review." }
```

**Errors**: 400 if account is not in rejected state.

---

### POST /admin/tenants/:id/setup-paypal-recurring
Legacy billing endpoint. In default mode (`PAYMENTS_ENABLED=false`), this endpoint is disabled.

**Access:** Admin JWT required

**Request**: No body required.

**Response (503)**
```json
{
  "success": false,
  "message": "Payments are temporarily disabled while the billing direction is being updated.",
  "code": "PAYMENTS_DISABLED"
}
```

Enable payment workflows first before using this endpoint in non-default mode.

---

### POST /admin/tenants/:id/change-plan
Legacy billing endpoint. In default mode (`PAYMENTS_ENABLED=false`), this endpoint is disabled.

**Access:** Admin JWT required

**Request**
```json
{ "plan": "standard" }
```

**Response (503)**
```json
{
  "success": false,
  "message": "Payments are temporarily disabled while the billing direction is being updated.",
  "code": "PAYMENTS_DISABLED"
}
```

Enable payment workflows first before using this endpoint in non-default mode.

---

### POST /admin/tenants/:id/reactivate
Reactivate an inactive tenant. Sets `status='active'`, `subscription_status='active'`, extends `current_period_end` by 30 days, sends approval email.

**Access:** Admin JWT required

**Request**: No body required.

**Response (200)**
```json
{ "success": true, "message": "Tenant reactivated successfully." }
```

**Errors**: 400 if tenant is not inactive.

---

## Admin Tenant Management Endpoints

> **Note**: These endpoints are for the Developer Portal (superadmin) and are NOT tenant-isolated. They manage company registrations across the entire platform.
>
> **Scope clarification**: `company_token` in this section is internal/admin context only. Public storefront flows use `x-store-slug` and do not expose tenant tokens in discovery payloads.

### GET /admin/tenants
List all tenant registrations with their status.

**Response (200)**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "ACME Corp",
      "admin_email": "admin@acme.com",
      "company_token": "token-acme-123",
      "status": "pending",
      "created_at": "2026-02-06T..."
    }
  ]
}
```

### POST /admin/tenants/:id/approve
Approve a pending tenant registration and provision their isolated database.

**Request**
No body required.

**Response (200)**
```json
{
  "success": true,
  "message": "Tenant approved and provisioned successfully",
  "data": {
    "id": 1,
    "name": "ACME Corp",
    "status": "active",
    "database_name": "sku_tenant_acme_corp",
    "email_sent": true
  }
}
```

**Side Effects**:
- Creates isolated tenant database with all required tables
- Seeds default admin user with provided credentials
- **Sends approval email** with login credentials and company token (if SMTP configured)

**Response Fields**:
- `email_sent`: Boolean indicating whether approval notification email was sent successfully

### POST /admin/tenants/:id/reject
Reject a pending tenant registration.

**Request**
```json
{
  "reason": "Optional rejection reason displayed to the registrant"
}
```

**Response (200)**
```json
{
  "success": true,
  "message": "Tenant registration rejected",
  "data": {
    "id": 1,
    "status": "rejected",
    "email_sent": true
  }
}
```

**Side Effects**:
- Updates tenant status to "rejected"
- **Sends rejection email** with reason (if provided) and link to re-register (if SMTP configured)

**Response Fields**:
- `email_sent`: Boolean indicating whether rejection notification email was sent successfully

### PUT /admin/tenants/:id
Update tenant status or subscription plan.

**Request**
```json
{
  "status": "inactive",
  "plan": "premium"
}
```

**Response (200)**
```json
{
  "success": true,
  "message": "Tenant updated successfully",
  "data": {
    "id": 1,
    "name": "ACME Corp",
    "status": "inactive",
    "plan": "premium",
    "updated_at": "2026-02-12T..."
  }
}
```

**Notes**:
- `status` values: "active", "inactive" (soft delete), "pending", "rejected"
- `plan` values: "standard", "premium"
- Changing status to "inactive" prevents all users of that tenant from logging in.
- In default billing-paused mode (`PAYMENTS_ENABLED=false`), this endpoint still allows manual tenant `plan` metadata edits.
- In billing-paused mode, those manual plan metadata edits are immediately honored by premium route gating.
- Billing automation endpoints remain disabled in that mode (`POST /admin/tenants/:id/change-plan`, `/payments/*` return `503` + `PAYMENTS_DISABLED`).

### DELETE /admin/tenants/:id
Permanently delete a tenant and their isolated database. **IRREVERSIBLE**.

**Request**
No body required.

**Response (200)**
```json
{
  "success": true,
  "message": "Tenant and database permanently deleted"
}
```

**Side Effects**:
- **DROPS** the tenant's isolated database (`sku_tenant_...`)
- Removes the tenant record from the `Tenants` table
- This action cannot be undone. All data is lost.

### GET /admin/tenants/:id/compliance/security-incidents
List tenant security incidents aggregated from immutable compliance audit logs.

### POST /admin/tenants/:id/compliance/final-review/documents/:document_id/review
Platform-admin review action for tenant documentary records (note/revoke/restore).

**Access:** Admin JWT required (`authenticateAdmin`)

**Query Parameters**
| Name | Type | Description |
|------|------|-------------|
| `limit` | number | Max log rows scanned for incident aggregation (default 200, max 500) |

**Response (200)**
```json
{
  "success": true,
  "data": {
    "incidents": [
      {
        "incident_id": "sig-mass_export_threshold_reached-20260408103000",
        "signal_code": "mass_export_threshold_reached",
        "severity": "warning",
        "status": "acknowledged",
        "opened_at": "2026-04-08T10:30:00.000Z",
        "updated_at": "2026-04-08T11:00:00.000Z",
        "event_count": 2,
        "dispatch": {
          "channel": "email",
          "delivery_status": "queued",
          "attempted_at": "2026-04-08T11:00:30.000Z",
          "error": null,
          "target_configured": true,
          "dispatch_reference": "email:compliance@example.com"
        }
      }
    ],
    "counts": {
      "total": 1,
      "requires_action": 1,
      "new": 0,
      "acknowledged": 1,
      "resolved": 0
    }
  }
}
```

### POST /admin/tenants/:id/compliance/security-incidents/:incident_id/acknowledge
Append immutable compliance audit evidence that an incident has been acknowledged.

### POST /admin/tenants/:id/compliance/security-incidents/:incident_id/resolve
Append immutable compliance audit evidence that an incident has been resolved.

**Request Body (both endpoints)**
```json
{
  "note": "Validated incident and completed remediation",
  "evidence_ref": "SEC-INC-2026-041"
}
```

**Response Notes (both endpoints)**
- `data.dispatch` includes latest dispatch summary (`channel`, `delivery_status`, `attempted_at`, `error`).
- `delivery_status` values:
  - `recorded` for `audit_only` mode
  - `queued` or `sent` when external channel target is configured
  - `failed` when strict channel delivery is enabled but target is missing or simulated dispatch failure is triggered
- `data.dispatch.target_configured` is `false` when strict channel delivery was requested but no endpoint/recipient is configured.
- `data.dispatch.dispatch_reference` is included when a concrete email/webhook target is available.
- `data.dispatch_attempt_append_result` indicates where immutable dispatch evidence was persisted (`primary`, `fallback`, or `none`).

---

## Receive Tokens (QR Scan) Endpoints

These endpoints power the mobile QR receiving flow for Purchase Orders and Job Orders. The validate and receive endpoints are **public** — the QR token itself is the authorization credential.

### POST /receive-tokens
Generate a QR token for a PO or JO. The token encodes a URL that the mobile receiver scans.

**Access:** Private (requires JWT)

**Request**
```json
{
  "order_type": "PO",
  "order_id": 39,
  "expiry_days": 7
}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "token": "a3f8c2e1...",
    "expires_at": "2026-02-26T10:00:00.000Z",
    "url": "/receive/a3f8c2e1..."
  }
}
```

---

### GET /receive-tokens/:token
Validate a QR token and retrieve order details for the mobile receive page.

**Access:** Public (token is the credential)

**Response (200)**
```json
{
  "success": true,
  "data": {
    "receiveToken": {
      "token_id": 5,
      "token_type": "PO",
      "expires_at": "2026-02-26T10:00:00.000Z"
    },
    "order": {
      "order_type": "PO",
      "order_id": 39,
      "order_number": "PO-2026-943841",
      "supplier_name": "Pillow Supplier",
      "status": "pending",
      "total_items": 1,
      "total_remaining": 60,
      "items": [
        {
          "line_item_id": 12,
          "item_name": "Pillow",
          "sku_code": "PIL-001",
          "quantity_ordered": 60,
          "quantity_received_total": 0,
          "quantity_remaining": 60,
          "unit_of_measure": "pcs"
        }
      ]
    }
  }
}
```

For a **JO** token the `order` shape is:
```json
{
  "order_type": "JO",
  "order_id": 12,
  "order_number": "JO-2026-001",
  "product_name": "Assembled Pillow",
  "status": "in_progress",
  "quantity_to_produce": 100,
  "quantity_produced": 0,
  "ingredients": [
    { "item_id": 3, "item_name": "Pillow Fill", "quantity_required": 200, "unit_of_measure": "g" }
  ],
  "items": []
}
```

---

### POST /receive-tokens/:token/receive
Perform the PO or JO receive operation. The QR token is validated server-side; no user JWT is required.

**Access:** Public (token is the credential)

**Request — PO**
```json
{
  "line_items": [
    { "line_item_id": 12, "quantity_received": 60, "quality_check_status": "passed" }
  ],
  "notes": "All items in good condition",
  "delivery_rating": 5
}
```

**Request — JO**
```json
{
  "quantity_produced": 80,
  "notes": "Batch complete",
  "quality_check": "pass"
}
```

**Response (200)**
```json
{
  "success": true,
  "data": { "po_id": 39, "status": "received", ... },
  "message": "Received successfully"
}
```

> **Note:** This endpoint also marks the token as `used_at` atomically. A token can only be used once.

---

## Email Configuration

The system uses Nodemailer with SMTP for sending emails. All email features gracefully degrade - if email fails, the primary operation (approval/invitation) still succeeds.

### Environment Variables
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
EMAIL_FROM_NAME=SKU Inventory Manager
APP_URL=https://your-domain.com
```

### Email Types

| Email Type | Trigger | Template |
|------------|---------|----------|
| User Invitation | Creating user invitation via AI or admin panel | `getInvitationTemplate()` |
| Company Approved | Admin approves pending company registration | `getCompanyApprovedTemplate()` |
| Company Rejected | Admin rejects pending company registration | `getCompanyRejectedTemplate()` |

### Gmail SMTP Setup
1. Enable 2-Factor Authentication on your Google account
2. Generate an App Password at: https://myaccount.google.com/apppasswords
3. Use the 16-character app password as `SMTP_PASS`
