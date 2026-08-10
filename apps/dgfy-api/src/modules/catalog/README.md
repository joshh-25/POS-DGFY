# Catalog Module

Catalog owns item identity and base sale metadata while the existing `items`
table remains physically unchanged during this alignment phase.

Current migration shape:

`routes/controllers -> catalog use-cases or repositories -> existing items table`

Ownership:

- item/product identity
- SKU and barcode identity
- variants/base item metadata
- units of measure
- categories and product type
- `default_sale_price`

Catalog does not own stock balances, FIFO batches, stock movements, POS
visibility, Storefront visibility, checkout transactions, or public discovery.
