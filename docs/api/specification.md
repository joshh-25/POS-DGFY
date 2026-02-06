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
- `400` - Cannot remove yourself / User already removed
- `403` - Cannot remove Master Admin / Insufficient hierarchy level
- `404` - User not found

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
        "quantity": 100,
        "cost_per_unit": 25.00,
        "received_date": "2024-01-10",
        "expiry_date": "2025-01-10",
        "quantity_consumed": 10
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

### POST /items
Create new item

**Request**
```json
{
  "sku_code": "ING-001",
  "name": "All-Purpose Flour",
  "category": "ingredient",
  "description": "High-quality all-purpose flour",
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

### GET /items/:item_id/stock-history
Get stock movement history for an item
...

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

### POST /stock-movements
Record manual stock movement

**Request**
```json
{
  "item_id": 1,
  "movement_type": "calculated_loss",
  "quantity": 5.5,
  "loss_reason": "spoilage",
  "notes": "Flour damaged due to moisture",
  "user_responsible": "manager_john"
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
Movement ID,Date,Item Name,SKU,Type,Quantity,Current Stock,Reference,Batch ID,User,Notes
94,"1/16/2026, 3:43:53 PM","Calamansi Label 330ml","PKG-005","transfer","1.00",,"N/A","N/A","admin",""
```

---

## Reports Endpoints

### GET /reports/stock-aging
Get stock aging report

**Query Parameters**
```
?days=30
&category=ingredient
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "report": [
      {
        "item_id": 1,
        "item_name": "All-Purpose Flour",
        "sku_code": "ING-001",
        "current_stock": 150,
        "oldest_batch_date": "2023-12-01",
        "days_in_stock": 45,
        "expiry_date": "2024-12-01",
        "risk_level": "medium"
      }
    ]
  }
}
```

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

## Admin Tenant Management Endpoints

> **Note**: These endpoints are for the Developer Portal (superadmin) and are NOT tenant-isolated. They manage company registrations across the entire platform.

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
