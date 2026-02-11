# Nested Products Feature

This feature enables products to be used as ingredients for other products (e.g., "Chocolate Ganache" as an ingredient in "Chocolate Cake") with full batch lineage tracking, circular dependency prevention, and nesting depth limiting.

## Overview

### Key Features
- **Nested Products**: Use other products as ingredients in your product recipes
- **Circular Dependency Prevention**: System automatically detects and prevents circular dependencies
- **Depth Limiting**: Maximum 3 levels of nesting allowed
- **Batch Lineage Tracking**: Track which ingredient batches were used to produce product batches
- **Full Traceability**: Query ancestry and descendants of any batch

### Nesting Levels

| Level | Description | Example |
|-------|-------------|---------|
| 0 | Uses only raw ingredients | Chocolate Ganache (uses Chocolate, Cream) |
| 1 | Uses Level 0 products | Chocolate Cake (uses Chocolate Ganache + Flour, Sugar) |
| 2 | Uses Level 1 products | Birthday Cake Box (uses Chocolate Cake + Candles, Box) |
| 3 | Uses Level 2 products | Premium Gift Basket (uses Birthday Cake Box + Gift Items) - MAX |
 
> [!IMPORTANT]
> **Batch Conversions**: When using nested products as ingredients, ensure the Job Order is created using the **base unit quantity** (e.g., grams, ml) for both the parent and child products. The AI is now trained to automatically handle these conversions based on the `batch_size` defined in each product's details.

## User Guide

### Creating a Nested Product

1. Open the Product Wizard
2. Navigate to "Recipe & Ingredients" step
3. You'll see two tabs:
   - **Raw Ingredients**: Traditional ingredients (category = 'ingredient')
   - **Product Components**: Other products you can use as ingredients

4. Switch to "Product Components" tab to add products as ingredients
5. Each product shows its nesting level badge (Level 0, 1, 2, 3)
6. Add the product as you would any ingredient

### Validation Rules

The system validates your composition and will block:

1. **Direct Circular**: Product A cannot use itself
2. **Indirect Circular**: Product A → B → C → A creates a loop
3. **Depth Exceeded**: Cannot create Level 4 products (max is 3)

Error messages are displayed as toast notifications explaining the issue.

### Batch Lineage

When a Job Order completes:
1. A new FIFO batch is created for the produced product
2. Batch lineage records link the new batch to all consumed ingredient batches
3. This enables full traceability:
   - "Which batches of Flour were used to make Batch #500 of Chocolate Cake?"
   - "What products were made using Batch #123 of Chocolate Ganache?"

## Technical Details

### Database Schema

#### batch_lineage Table
```sql
CREATE TABLE batch_lineage (
  lineage_id INT PRIMARY KEY AUTO_INCREMENT,
  parent_batch_id INT NOT NULL,  -- Produced product batch
  child_batch_id INT NOT NULL,   -- Consumed ingredient batch
  quantity_consumed DECIMAL(12,2) NOT NULL,
  jo_number VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Items Table Additions
```sql
ALTER TABLE items ADD COLUMN
  nesting_level INT DEFAULT 0,
  max_child_depth INT DEFAULT 0,
  is_leaf_node BOOLEAN DEFAULT TRUE,
  composition_hash VARCHAR(64);
```

#### product_composition Addition
```sql
ALTER TABLE product_composition ADD COLUMN
  is_subproduct BOOLEAN DEFAULT FALSE;
```

### API Endpoints

#### Validate Composition
```http
POST /api/v1/items/validate-composition
Content-Type: application/json

{
  "product_id": 123,  // null for new products
  "ingredient_ids": [45, 67, 89]
}

Response:
{
  "success": true,
  "data": {
    "valid": true,
    "errors": [],
    "nestingLevel": 1
  }
}
```

### Backend Services

- `compositionValidationService.js`: Validates compositions, detects circular dependencies
- `batchLineageService.js`: Creates and queries batch lineage records

### Frontend Components

- `RecipeFormulationStep.jsx`: Split into Raw Ingredients and Product Components tabs
- `compositionValidation.js`: Utility for frontend validation

## Migration Guide

### Running Migrations

```bash
cd backend
npx sequelize-cli db:migrate
```

### Calculating Nesting Levels for Existing Products

```bash
cd backend
node src/scripts/calculateNestingLevels.js
# This script will automatically iterate through ALL active tenants and the default database.
```
```

## Example Workflow

### Creating a 3-Level Nested Product

```
Step 1: Create "Chocolate Ganache" (Level 0)
- Uses: Chocolate Powder, Cream (raw ingredients)
- Nesting Level: 0

Step 2: Create "Chocolate Cake" (Level 1)  
- Uses: Chocolate Ganache (product), Flour, Sugar, Eggs (raw)
- Nesting Level: 1

Step 3: Create "Birthday Cake Box" (Level 2)
- Uses: Chocolate Cake (product), Candles, Box (raw)
- Nesting Level: 2

Step 4: Create "Premium Gift Basket" (Level 3)
- Uses: Birthday Cake Box (product), Gift Items (raw)
- Nesting Level: 3 (MAXIMUM)

Step 5 (BLOCKED): Cannot create product using "Premium Gift Basket"
- Would create Level 4 - exceeds maximum
- Error: "Maximum nesting depth of 3 levels exceeded"
```

### Batch Lineage Example

```
Job Order JO-2024-0001:
- Produce: 10 units of Birthday Cake Box

Consumed Batches:
- Batch #450: Chocolate Cake (5 units)
- Batch #451: Chocolate Cake (5 units)
- Batch #460: Candles (10 units)
- Batch #470: Box (10 units)

Created:
- Batch #500: Birthday Cake Box (10 units)

Lineage Records:
- #500 ← #450 (consumed 5 units)
- #500 ← #451 (consumed 5 units)
- #500 ← #460 (consumed 10 units)
- #500 ← #470 (consumed 10 units)

Traceability:
- Batch #500 ancestry shows all consumed batches
- Batch #450 descendants shows Batch #500
```

## Troubleshooting

### "Circular Dependency Detected" Error
This means adding the selected product would create a loop. For example, if Product A uses Product B, you cannot then add Product A as an ingredient of Product B.

**Solution**: Choose a different product or restructure your product hierarchy.

### "Maximum Nesting Depth Exceeded" Error
You're trying to create a product at Level 4 or higher.

**Solution**: Simplify your product structure. Consider using raw ingredients instead of nested products.

### Validation Service Unavailable
If the validation API is unreachable, the frontend will allow submission. The backend will validate and reject invalid compositions with appropriate error messages.
