# MySQL Database Schema Design - SKU Inventory Manager

## Database Overview

**Database Name**: `sku_inventory_manager`
**MySQL Version**: 8.0+
**Character Set**: utf8mb4
**Collation**: utf8mb4_unicode_ci

---

## Entity-Relationship Diagram

> **Reference Diagram**: See [Data Model Diagram](./images/data-model-diagram.png) for a visual representation of the complete database schema and entity relationships.

```
┌─────────────────┐
│     Users       │
│─────────────────│
│ user_id (PK)    │
│ username        │
│ email           │
│ password_hash   │
│ role            │
│ created_at      │
│ updated_at      │
└────────┬────────┘
         │
         │ 1:N
         │
    ┌────▼─────────────────┐
    │  AuditLogs           │
    │──────────────────────│
    │ log_id (PK)          │
    │ user_id (FK)         │
    │ entity_type          │
    │ entity_id            │
    │ action               │
    │ changes              │
    │ timestamp            │
    └──────────────────────┘

┌──────────────────────────┐
│      Items (SKU Master)  │
│──────────────────────────│
│ item_id (PK)             │
│ sku_code (UNIQUE)        │
│ name                     │
│ category                 │
│ description              │
│ current_stock            │
│ max_capacity             │
│ min_threshold            │
│ purchase_allowance       │
│ unit_of_measure          │
│ cost_per_unit            │
│ fifo_enabled             │
│ created_at               │
│ updated_at               │
└────────┬─────────────────┘
         │
    ┌────┴────────────────────┐
    │                         │
    │ 1:N                     │ 1:N
    │                         │
    ▼                         ▼
┌──────────────────┐   ┌──────────────────┐
│  FIFOBatches     │   │ ItemNutrition    │
│──────────────────│   │──────────────────│
│ batch_id (PK)    │   │ nutrition_id(PK) │
│ item_id (FK)     │   │ item_id (FK)     │
│ quantity         │   │ calories         │
│ cost_per_unit    │   │ protein          │
│ received_date    │   │ fat              │
│ expiry_date      │   │ carbohydrates    │
│ po_number (FK)   │   │ fiber            │
│ created_at       │   │ sodium           │
└──────────────────┘   └──────────────────┘

┌──────────────────┐
│  ItemAllergens   │
│──────────────────│
│ allergen_id(PK)  │
│ item_id (FK)     │
│ allergen_name    │
└──────────────────┘

┌──────────────────────────────┐
│  ProductComposition          │
│──────────────────────────────│
│ composition_id (PK)          │
│ product_id (FK)              │
│ ingredient_id (FK)           │
│ quantity_required            │
│ unit_of_measure              │
└──────────────────────────────┘

┌──────────────────────────┐
│      Suppliers           │
│──────────────────────────│
│ supplier_id (PK)         │
│ name                     │
│ contact_person           │
│ email                    │
│ phone                    │
│ address                  │
│ quality_rating           │
│ avg_delivery_days        │
│ is_active                │
│ created_at               │
│ updated_at               │
└────────┬─────────────────┘
         │
    ┌────┴─────────────────────┐
    │                          │
    │ 1:N                      │ 1:N
    │                          │
    ▼                          ▼
┌────────────────────┐  ┌──────────────────┐
│ SupplierItems      │  │ BulkDiscounts    │
│────────────────────│  │──────────────────│
│ supplier_item_id   │  │ discount_id (PK) │
│ supplier_id (FK)   │  │ supplier_id (FK) │
│ item_id (FK)       │  │ min_quantity     │
│ moq                │  │ discount_percent │
│ price_per_unit     │  │ created_at       │
│ last_price_update  │  └──────────────────┘
└────────────────────┘

┌────────────────────────────────┐
│     PurchaseOrders             │
│────────────────────────────────│
│ po_id (PK)                     │
│ po_number (UNIQUE)             │
│ supplier_id (FK)               │
│ order_date                     │
│ expected_delivery_date         │
│ received_date                  │
│ status                         │
│ subtotal                       │
│ discount                       │
│ total_amount                   │
│ delivery_rating                │
│ notes                          │
│ created_by (FK - Users)        │
│ created_at                     │
│ updated_at                     │
└────────┬────────────────────────┘
         │
         │ 1:N
         │
         ▼
    ┌────────────────────────┐
    │  POLineItems           │
    │────────────────────────│
    │ line_item_id (PK)      │
    │ po_id (FK)             │
    │ item_id (FK)           │
    │ quantity_ordered       │
    │ quantity_received      │
    │ unit_price             │
    │ total_price            │
    │ quality_check_status   │
    │ notes                  │
    └────────────────────────┘

┌────────────────────────────────┐
│       JobOrders                │
│────────────────────────────────│
│ jo_id (PK)                     │
│ jo_number (UNIQUE)             │
│ product_id (FK - Items)        │
│ quantity_to_produce            │
│ status                         │
│ created_date                   │
│ completion_date                │
│ responsible_user (FK - Users)  │
│ notes                          │
│ created_at                     │
│ updated_at                     │
└────────┬────────────────────────┘
         │
         │ 1:N
         │
         ▼
    ┌────────────────────────┐
    │ JOIngredients          │
    │────────────────────────│
    │ jo_ingredient_id (PK)  │
    │ jo_id (FK)             │
    │ item_id (FK)           │
    │ quantity_required      │
    │ quantity_consumed      │
    │ stock_before           │
    │ stock_after            │
    └────────────────────────┘

┌────────────────────────────────┐
│     StockMovements             │
│────────────────────────────────│
│ movement_id (PK)               │
│ item_id (FK)                   │
│ movement_type                  │
│ quantity                       │
│ from_location                  │
│ to_location                    │
│ reference_id                   │
│ reference_type                 │
│ user_responsible (FK - Users)  │
│ notes                          │
│ loss_reason                    │
│ weighted_average_cost          │
│ timestamp                      │
│ created_at                     │
└────────┬────────────────────────┘
         │
         │ 1:N
         │
         ▼
    ┌────────────────────────┐
    │ BatchTransactions      │
    │────────────────────────│
    │ transaction_id (PK)    │
    │ movement_id (FK)       │
    │ batch_id (FK)          │
    │ quantity_consumed      │
    │ remaining_after        │
    │ cost_per_unit          │
    └────────────────────────┘

┌────────────────────────────────┐
│      SystemSettings            │
│────────────────────────────────│
│ setting_id (PK)                │
│ setting_key (UNIQUE)           │
│ setting_value                  │
│ data_type                      │
│ description                    │
│ updated_at                     │
└────────────────────────────────┘
```

---

## Detailed Table Definitions

### 1. Users Table

```sql
CREATE TABLE users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'manager', 'staff') DEFAULT 'staff',
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_role (role)
);
```

### 2. Items (SKU Master) Table

```sql
CREATE TABLE items (
    item_id INT PRIMARY KEY AUTO_INCREMENT,
    sku_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category ENUM('ingredient', 'product', 'packaging') NOT NULL,
    product_folder VARCHAR(100),
    description TEXT,
    current_stock DECIMAL(12, 2) DEFAULT 0,
    max_capacity DECIMAL(12, 2) NOT NULL,
    min_threshold DECIMAL(12, 2),
    purchase_allowance DECIMAL(12, 2),
    unit_of_measure VARCHAR(50) NOT NULL,
    cost_per_unit DECIMAL(10, 4),
    fifo_enabled BOOLEAN DEFAULT FALSE,
    batch_size DECIMAL(12, 2),
    yield_percentage DECIMAL(5, 2),
    processing_loss DECIMAL(5, 2),
    production_notes TEXT,
    status ENUM('draft', 'active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_sku_code (sku_code),
    INDEX idx_category (category),
    INDEX idx_name (name),
    INDEX idx_current_stock (current_stock)
);
```

### 3. FIFO Batches Table

```sql
CREATE TABLE fifo_batches (
    batch_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL,
    quantity DECIMAL(12, 2) NOT NULL,
    cost_per_unit DECIMAL(10, 4),
    received_date DATE NOT NULL,
    expiry_date DATE,
    po_number VARCHAR(50),
    quantity_consumed DECIMAL(12, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
    INDEX idx_item_id (item_id),
    INDEX idx_expiry_date (expiry_date),
    INDEX idx_received_date (received_date)
);
```

### 4. Item Nutrition Table

```sql
CREATE TABLE item_nutrition (
    nutrition_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL UNIQUE,
    serving_size VARCHAR(50),
    calories DECIMAL(8, 2),
    total_fat DECIMAL(8, 2),
    saturated_fat DECIMAL(8, 2),
    cholesterol DECIMAL(8, 2),
    sodium DECIMAL(8, 2),
    total_carbohydrates DECIMAL(8, 2),
    dietary_fiber DECIMAL(8, 2),
    sugars DECIMAL(8, 2),
    protein DECIMAL(8, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
    INDEX idx_item_id (item_id)
);
```

### 5. Item Allergens Table

```sql
CREATE TABLE item_allergens (
    allergen_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL,
    allergen_name VARCHAR(100) NOT NULL,
    is_cross_contamination BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
    INDEX idx_item_id (item_id),
    UNIQUE KEY unique_allergen (item_id, allergen_name)
);
```

### 6. Product Composition Table

```sql
CREATE TABLE product_composition (
    composition_id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    ingredient_id INT NOT NULL,
    quantity_required DECIMAL(12, 2) NOT NULL,
    unit_of_measure VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (product_id) REFERENCES items(item_id) ON DELETE CASCADE,
    FOREIGN KEY (ingredient_id) REFERENCES items(item_id) ON DELETE RESTRICT,
    INDEX idx_product_id (product_id),
    INDEX idx_ingredient_id (ingredient_id)
);
```

### 7. Suppliers Table

```sql
CREATE TABLE suppliers (
    supplier_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    address TEXT,
    quality_rating DECIMAL(3, 2),
    avg_delivery_days INT,
    is_active BOOLEAN DEFAULT TRUE,
    last_delivery_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_name (name),
    INDEX idx_email (email),
    INDEX idx_is_active (is_active)
);
```

### 8. Supplier Items Table

```sql
CREATE TABLE supplier_items (
    supplier_item_id INT PRIMARY KEY AUTO_INCREMENT,
    supplier_id INT NOT NULL,
    item_id INT NOT NULL,
    moq DECIMAL(12, 2),
    price_per_unit DECIMAL(10, 4),
    last_price_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_preferred BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(item_id) ON DELETE CASCADE,
    INDEX idx_supplier_id (supplier_id),
    INDEX idx_item_id (item_id),
    UNIQUE KEY unique_supplier_item (supplier_id, item_id)
);
```

### 9. Bulk Discounts Table

```sql
CREATE TABLE bulk_discounts (
    discount_id INT PRIMARY KEY AUTO_INCREMENT,
    supplier_id INT NOT NULL,
    min_quantity DECIMAL(12, 2) NOT NULL,
    discount_percent DECIMAL(5, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id) ON DELETE CASCADE,
    INDEX idx_supplier_id (supplier_id)
);
```

### 10. Purchase Orders Table

```sql
CREATE TABLE purchase_orders (
    po_id INT PRIMARY KEY AUTO_INCREMENT,
    po_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_id INT NOT NULL,
    order_date DATE NOT NULL,
    expected_delivery_date DATE,
    received_date DATE,
    status ENUM('pending', 'partial', 'received', 'cancelled') DEFAULT 'pending',
    subtotal DECIMAL(12, 2),
    discount DECIMAL(12, 2),
    total_amount DECIMAL(12, 2),
    delivery_rating DECIMAL(3, 2),
    notes TEXT,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id),
    FOREIGN KEY (created_by) REFERENCES users(user_id),
    INDEX idx_po_number (po_number),
    INDEX idx_supplier_id (supplier_id),
    INDEX idx_status (status),
    INDEX idx_order_date (order_date)
);
```

### 11. PO Line Items Table

```sql
CREATE TABLE po_line_items (
    line_item_id INT PRIMARY KEY AUTO_INCREMENT,
    po_id INT NOT NULL,
    item_id INT NOT NULL,
    quantity_ordered DECIMAL(12, 2) NOT NULL,
    quantity_received DECIMAL(12, 2) DEFAULT 0,
    unit_price DECIMAL(10, 4) NOT NULL,
    total_price DECIMAL(12, 2),
    quality_check_status ENUM('pending', 'passed', 'failed') DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(item_id),
    INDEX idx_po_id (po_id),
    INDEX idx_item_id (item_id)
);
```

### 12. Job Orders Table

```sql
CREATE TABLE job_orders (
    jo_id INT PRIMARY KEY AUTO_INCREMENT,
    jo_number VARCHAR(50) UNIQUE NOT NULL,
    product_id INT NOT NULL,
    quantity_to_produce DECIMAL(12, 2) NOT NULL,
    status ENUM('draft', 'in_progress', 'completed', 'cancelled') DEFAULT 'draft',
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completion_date TIMESTAMP NULL,
    responsible_user INT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (product_id) REFERENCES items(item_id),
    FOREIGN KEY (responsible_user) REFERENCES users(user_id),
    INDEX idx_jo_number (jo_number),
    INDEX idx_product_id (product_id),
    INDEX idx_status (status),
    INDEX idx_created_date (created_date)
);
```

### 13. JO Ingredients Table

```sql
CREATE TABLE jo_ingredients (
    jo_ingredient_id INT PRIMARY KEY AUTO_INCREMENT,
    jo_id INT NOT NULL,
    item_id INT NOT NULL,
    quantity_required DECIMAL(12, 2) NOT NULL,
    quantity_consumed DECIMAL(12, 2),
    stock_before DECIMAL(12, 2),
    stock_after DECIMAL(12, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (jo_id) REFERENCES job_orders(jo_id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(item_id),
    INDEX idx_jo_id (jo_id),
    INDEX idx_item_id (item_id)
);
```

### 14. Stock Movements Table

```sql
CREATE TABLE stock_movements (
    movement_id INT PRIMARY KEY AUTO_INCREMENT,
    item_id INT NOT NULL,
    movement_type ENUM('production_consumption', 'purchase_receipt', 'return', 'transfer', 'calculated_loss') NOT NULL,
    quantity DECIMAL(12, 2) NOT NULL,
    from_location VARCHAR(100),
    to_location VARCHAR(100),
    reference_id VARCHAR(50),
    reference_type ENUM('PO', 'JO', 'MANUAL', 'RETURN') DEFAULT 'MANUAL',
    user_responsible INT,
    notes TEXT,
    loss_reason ENUM('waste', 'spoilage', 'damage', 'pilferage', NULL) NULL,
    weighted_average_cost DECIMAL(10, 4),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (item_id) REFERENCES items(item_id),
    FOREIGN KEY (user_responsible) REFERENCES users(user_id),
    INDEX idx_item_id (item_id),
    INDEX idx_movement_type (movement_type),
    INDEX idx_timestamp (timestamp),
    INDEX idx_reference_id (reference_id)
);
```

### 15. Batch Transactions Table

```sql
CREATE TABLE batch_transactions (
    transaction_id INT PRIMARY KEY AUTO_INCREMENT,
    movement_id INT NOT NULL,
    batch_id INT NOT NULL,
    quantity_consumed DECIMAL(12, 2) NOT NULL,
    remaining_after DECIMAL(12, 2),
    cost_per_unit DECIMAL(10, 4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (movement_id) REFERENCES stock_movements(movement_id) ON DELETE CASCADE,
    FOREIGN KEY (batch_id) REFERENCES fifo_batches(batch_id),
    INDEX idx_movement_id (movement_id),
    INDEX idx_batch_id (batch_id)
);
```

### 16. Audit Logs Table

```sql
CREATE TABLE audit_logs (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT,
    action ENUM('CREATE', 'UPDATE', 'DELETE', 'VIEW') NOT NULL,
    changes JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_user_id (user_id),
    INDEX idx_entity_type (entity_type),
    INDEX idx_timestamp (timestamp)
);
```

### 17. System Settings Table

```sql
CREATE TABLE system_settings (
    setting_id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    data_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_setting_key (setting_key)
);
```

---

## Key Indexes & Performance Optimization

### Primary Indexes
- All tables have primary keys for unique identification
- Foreign keys are indexed for join performance
- Frequently queried columns are indexed

### Composite Indexes (for optimization)
```sql
-- For finding items by category and stock level
CREATE INDEX idx_category_stock ON items(category, current_stock);

-- For finding movements by item and date range
CREATE INDEX idx_item_timestamp ON stock_movements(item_id, timestamp);

-- For PO status tracking
CREATE INDEX idx_po_status_date ON purchase_orders(status, order_date);

-- For JO tracking
CREATE INDEX idx_jo_status_date ON job_orders(status, created_date);
```

---

## Data Integrity Constraints

### Referential Integrity
- All foreign keys enforce referential integrity
- Cascade delete for dependent records where appropriate
- Restrict delete for items referenced in compositions

### Business Rules
- Stock levels cannot go negative (enforced at application level)
- FIFO batches must have received_date before expiry_date
- Purchase order total must equal sum of line items
- Job order completion requires all ingredients to be available

### Unique Constraints
- SKU codes are globally unique
- PO numbers are unique
- JO numbers are unique
- Usernames and emails are unique

---

## Initial Data Setup

### Default System Settings
```sql
INSERT INTO system_settings (setting_key, setting_value, data_type, description) VALUES
('min_stock_threshold_percent', '40', 'number', 'Minimum stock as percentage of capacity'),
('purchase_allowance_percent', '20', 'number', 'Purchase allowance as percentage of capacity'),
('low_stock_alert_threshold', '30', 'number', 'Days before low stock alert'),
('forecast_days_ahead', '30', 'number', 'Number of days for forecasting'),
('currency', 'PHP', 'string', 'Default currency for financial tracking'),
('system_timezone', 'Asia/Manila', 'string', 'System timezone');
```

---

## Backup & Recovery Strategy

- Daily automated backups
- Point-in-time recovery capability
- Separate backup storage
- Regular backup integrity tests

---

## Migration Strategy

### Phase 1: Schema Creation
- Create all tables with relationships
- Create indexes and constraints
- Create views for reporting

### Phase 2: Data Migration
- Migrate from frontend mock data to database
- Validate data integrity
- Create audit trail for initial data

### Phase 3: Optimization
- Monitor query performance
- Add additional indexes if needed
- Optimize slow queries

