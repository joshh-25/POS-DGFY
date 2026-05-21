{
    "name": "PurchaseOrder",
    "type": "object",
    "properties": {
      "po_number": {
        "type": "string",
        "description": "Purchase order number"
      },
      "supplier_id": {
        "type": "string",
        "description": "Supplier ID"
      },
      "supplier_name": {
        "type": "string",
        "description": "Supplier name"
      },
      "items": {
        "type": "array",
        "description": "Items in this order",
        "items": {
          "type": "object",
          "properties": {
            "item_id": {
              "type": "string"
            },
            "item_name": {
              "type": "string"
            },
            "quantity": {
              "type": "number"
            },
            "unit_price": {
              "type": "number"
            },
            "total_price": {
              "type": "number"
            },
            "quantity_received": {
              "type": "number"
            },
            "quality_check": {
              "type": "string"
            }
          }
        }
      },
      "subtotal": {
        "type": "number"
      },
      "discount": {
        "type": "number"
      },
      "total_amount": {
        "type": "number"
      },
      "order_date": {
        "type": "string",
        "format": "date"
      },
      "expected_delivery_date": {
        "type": "string",
        "format": "date"
      },
      "received_date": {
        "type": "string",
        "format": "date"
      },
      "status": {
        "type": "string",
        "enum": [
          "draft",
          "pending",
          "partial",
          "received",
          "cancelled"
        ],
        "default": "draft"
      },
      "delivery_rating": {
        "type": "number"
      },
      "notes": {
        "type": "string"
      }
    },
    "required": [
      "po_number",
      "supplier_id",
      "items",
      "order_date",
      "status"
    ]
  }