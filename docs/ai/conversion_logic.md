# AI Conversion & Production Logic

This document explains how the inventory system handles product conversions, batches, and production yield. The AI should use this logic when assisting users with Job Orders and Inventory management.

## 1. Units of Measure (UOM)
The system uses base units for all internal calculations and stock tracking:
- **Weight**: grams (g), kilograms (kg)
- **Volume**: milliliters (ml), liters (L)
- **Count**: pieces (pcs), units

## 2. Batches vs. Base Units
A "Batch" is a production unit, not a standard unit of measure. 
- **Batch Size**: Every product has a `batch_size` defined in its base unit.
- **Job Orders**: Must ALWAYS be created using the **base unit quantity**, not the number of batches.
- **Conversion**: To calculate the quantity for $N$ batches:
  $$Quantity = N \times batch\_size$$

### Calculation Example
If **Calamansi Pasteurized** has a `batch_size` of `3000g`:
- User wants "1 batch" → `quantity_to_produce` = `3000`
- User wants "10 batches" → `quantity_to_produce` = `30000`

## 3. Yield and Loss
Production performance is tracked via:
- **Yield Percentage**: The percentage of ingredients that actually result in finished product (default 100%).
- **Processing Loss**: Fixed loss expected during production (e.g., evaporation, residue).

AI should mention these when analyzing production viability:
- "The theoretical yield is 95%, so you might get slightly less than the target quantity."

## 4. Nested Products
Products can be ingredients for other products. The `analyze_production_feasibility` tool handles this recursively. If an ingredient is missing but can be produced, the AI should suggest creating a Job Order for that ingredient first.
