{
    "name": "JobOrder",
    "type": "object",
    "properties": {
      "jo_number": {
        "type": "string",
        "description": "Job order number"
      },
      "product_id": {
        "type": "string",
        "description": "Product to produce"
      },
      "product_name": {
        "type": "string"
      },
      "quantity_to_produce": {
        "type": "number"
      },
      "ingredients_consumed": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "item_id": {
              "type": "string"
            },
            "item_name": {
              "type": "string"
            },
            "quantity_required": {
              "type": "number"
            },
            "stock_before": {
              "type": "number"
            },
            "stock_after": {
              "type": "number"
            }
          }
        }
      },
      "status": {
        "type": "string",
        "enum": [
          "draft",
          "in_progress",
          "completed",
          "cancelled"
        ],
        "default": "draft"
      },
      "completion_date": {
        "type": "string",
        "format": "date-time"
      },
      "responsible_user": {
        "type": "string"
      }
    },
    "required": [
      "jo_number",
      "product_id",
      "quantity_to_produce",
      "status"
    ]
  }