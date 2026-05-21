# Store Module

Public storefront contracts for tenant-isolated customer auth, saved addresses,
checkout/quote, order tracking, and order history.

Stock-bearing quote and checkout lines aggregate requested quantity by `item_id`
before stock validation. This preserves separate submitted lines for F&B
modifiers and future customizations while preventing one checkout from exceeding
available stock through duplicate lines. Pure service bookings use the Services
Mode capacity and hold contract instead.
