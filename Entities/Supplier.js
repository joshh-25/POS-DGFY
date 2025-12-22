{
    "name": "Supplier",
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": "Supplier name"
      },
      "contact_person": {
        "type": "string",
        "description": "Contact person name"
      },
      "email": {
        "type": "string",
        "description": "Email address"
      },
      "phone": {
        "type": "string",
        "description": "Phone number"
      },
      "address": {
        "type": "string",
        "description": "Physical address"
      },
      "items_supplied": {
        "type": "array",
        "description": "Items this supplier provides",
        "items": {
          "type": "object",
          "properties": {
            "item_id": {
              "type": "string"
            },
            "item_name": {
              "type": "string"
            },
            "moq": {
              "type": "number"
            },
            "price_per_unit": {
              "type": "number"
            }
          }
        }
      },
      "quality_rating": {
        "type": "number",
        "description": "Average quality rating (1-5)"
      },
      "avg_delivery_days": {
        "type": "number",
        "description": "Average delivery time in days"
      },
      "bulk_discounts": {
        "type": "array",
        "description": "Bulk discount tiers",
        "items": {
          "type": "object",
          "properties": {
            "min_quantity": {
              "type": "number"
            },
            "discount_percent": {
              "type": "number"
            }
          }
        }
      },
      "last_delivery_date": {
        "type": "string",
        "format": "date"
      }
    },
    "required": [
      "name",
      "contact_person",
      "email"
    ]
  }