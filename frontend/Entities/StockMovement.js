{
    "name": "StockMovement",
    "type": "object",
    "properties": {
      "item_id": {
        "type": "string"
      },
      "item_name": {
        "type": "string"
      },
      "movement_type": {
        "type": "string",
        "enum": [
          "production_consumption",
          "purchase_receipt",
          "return",
          "transfer",
          "calculated_loss"
        ],
        "description": "Type of stock movement"
      },
      "quantity": {
        "type": "number"
      },
      "from_location": {
        "type": "string"
      },
      "to_location": {
        "type": "string"
      },
      "reference_id": {
        "type": "string",
        "description": "PO or JO number"
      },
      "user_responsible": {
        "type": "string"
      },
      "notes": {
        "type": "string"
      },
      "loss_reason": {
        "type": "string",
        "enum": [
          "waste",
          "spoilage",
          "damage",
          "pilferage"
        ]
      },
      "batch_transactions": {
        "type": "array",
        "description": "FIFO batch transactions for this movement",
        "items": {
          "type": "object",
          "properties": {
            "batch_id": {
              "type": "string"
            },
            "quantity_consumed": {
              "type": "number"
            },
            "remaining_after": {
              "type": "number"
            },
            "cost_per_unit": {
              "type": "number"
            }
          }
        }
      },
      "weighted_average_cost": {
        "type": "number",
        "description": "Weighted average cost for multi-batch movements"
      }
    },
    "required": [
      "item_id",
      "item_name",
      "movement_type",
      "quantity"
    ]
  }