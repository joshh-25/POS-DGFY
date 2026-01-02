# Hotfix: Job Order Drafts Issue

## Problem
The `job_orders` table has a constraint that requires `jo_number` to be NOT NULL, but the application allows saving drafts without a JO number (NULL). This causes a 500 error when trying to save drafts.

## Solution
We need to alter the database table to allow NULL values for the `jo_number` column.

## How to Apply the Fix

### Option 1: Using phpMyAdmin (XAMPP)
1. Open phpMyAdmin in your browser: `http://localhost/phpmyadmin`
2. Select the `sku_inventory_manager` database from the left sidebar
3. Click on the "SQL" tab at the top
4. Copy and paste the following SQL:

```sql
ALTER TABLE job_orders
MODIFY COLUMN jo_number VARCHAR(50) NULL UNIQUE;
```

5. Click "Go" to execute

### Option 2: Using MySQL Command Line
1. Open Command Prompt or Terminal
2. Navigate to XAMPP MySQL bin directory:
   ```
   cd C:\xampp\mysql\bin
   ```
3. Run MySQL:
   ```
   mysql -u root -p
   ```
4. Enter your MySQL root password (default is empty for XAMPP)
5. Run the following commands:
   ```sql
   USE sku_inventory_manager;
   ALTER TABLE job_orders MODIFY COLUMN jo_number VARCHAR(50) NULL UNIQUE;
   DESCRIBE job_orders;
   ```

### Option 3: Using the SQL file
1. Open the SQL file: `backend/fix-jo-number.sql`
2. Import it through phpMyAdmin or run it via command line

## Verification
After running the fix, the `jo_number` column should show `NULL: YES` when you describe the table:

```sql
DESCRIBE job_orders;
```

Expected output should show:
```
jo_number | varchar(50) | YES | UNI | NULL |
```

## What This Fixes
- ✅ Allows saving job orders as drafts without a JO number
- ✅ Prevents 500 Internal Server Error when clicking "Save as Draft"
- ✅ Draft job orders can be finalized later, at which point a JO number is generated
