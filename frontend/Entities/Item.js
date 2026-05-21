{
    "name": "Item",
    "type": "object",
    "properties": {
      "sku_code": {
        "type": "string",
        "description": "Unique SKU code for the item"
      },
      "name": {
        "type": "string",
        "description": "Item name"
      },
      "category": {
        "type": "string",
        "enum": [
          "ingredient",
          "product",
          "packaging"
        ],
        "description": "Item category"
      },
      "product_folder": {
        "type": "string",
        "description": "Folder/category for organizing products"
      },
      "description": {
        "type": "string",
        "description": "Item description"
      },
      "current_stock": {
        "type": "number",
        "description": "Current stock level"
      },
      "max_capacity": {
        "type": "number",
        "description": "Maximum storage capacity"
      },
      "min_threshold": {
        "type": "number",
        "description": "Minimum threshold (40% of capacity)"
      },
      "purchase_allowance": {
        "type": "number",
        "description": "Purchase allowance (20% of capacity)"
      },
      "unit_of_measure": {
        "type": "string",
        "description": "Unit of measurement"
      },
      "cost_per_unit": {
        "type": "number",
        "description": "Cost per unit in PHP"
      },
      "fifo_enabled": {
        "type": "boolean",
        "description": "Enable FIFO batch tracking for this item",
        "default": false
      },
      "fifo_batches": {
        "type": "array",
        "description": "FIFO batches for inventory tracking",
        "items": {
          "type": "object",
          "properties": {
            "batch_id": {
              "type": "string"
            },
            "quantity": {
              "type": "number"
            },
            "cost_per_unit": {
              "type": "number"
            },
            "received_date": {
              "type": "string",
              "format": "date"
            },
            "po_number": {
              "type": "string"
            },
            "expiry_date": {
              "type": "string",
              "format": "date"
            }
          }
        }
      },
      "ingredients": {
        "type": "array",
        "description": "For products: ingredient composition",
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
            }
          }
        }
      },
      "batch_size": {
        "type": "number",
        "description": "Standard batch size for production"
      },
      "yield_percentage": {
        "type": "number",
        "description": "Expected production yield percentage"
      },
      "processing_loss": {
        "type": "number",
        "description": "Expected processing loss percentage"
      },
      "nutritional_info": {
        "type": "object",
        "description": "Nutritional information per serving",
        "properties": {
          "serving_size": {
            "type": "string"
          },
          "calories": {
            "type": "number"
          },
          "total_fat": {
            "type": "number"
          },
          "saturated_fat": {
            "type": "number"
          },
          "cholesterol": {
            "type": "number"
          },
          "sodium": {
            "type": "number"
          },
          "total_carbohydrates": {
            "type": "number"
          },
          "dietary_fiber": {
            "type": "number"
          },
          "sugars": {
            "type": "number"
          },
          "protein": {
            "type": "number"
          }
        }
      },
      "allergens": {
        "type": "array",
        "description": "List of allergens present",
        "items": {
          "type": "string",
          "enum": [
            "milk",
            "eggs",
            "fish",
            "shellfish",
            "tree_nuts",
            "peanuts",
            "wheat",
            "soybeans",
            "sesame"
          ]
        }
      },
      "may_contain_allergens": {
        "type": "array",
        "description": "Potential cross-contamination allergens",
        "items": {
          "type": "string"
        }
      },
      "physical_properties": {
        "type": "object",
        "description": "Physical and chemical properties",
        "properties": {
          "texture": {
            "type": "string"
          },
          "color": {
            "type": "string"
          },
          "ph_level": {
            "type": "number"
          },
          "water_activity": {
            "type": "number"
          },
          "viscosity": {
            "type": "string"
          }
        }
      },
      "shelf_life": {
        "type": "object",
        "description": "Shelf life information",
        "properties": {
          "duration_days": {
            "type": "number"
          },
          "storage_temperature": {
            "type": "string"
          },
          "storage_conditions": {
            "type": "string"
          },
          "opened_shelf_life_days": {
            "type": "number"
          }
        }
      },
      "packaging_info": {
        "type": "object",
        "description": "Packaging details",
        "properties": {
          "primary_packaging": {
            "type": "string"
          },
          "secondary_packaging": {
            "type": "string"
          },
          "packaging_material": {
            "type": "string"
          },
          "label_compliance": {
            "type": "boolean"
          },
          "net_weight": {
            "type": "string"
          }
        }
      },
      "quality_control": {
        "type": "object",
        "description": "Quality control parameters",
        "properties": {
          "test_frequency": {
            "type": "string"
          },
          "acceptance_criteria": {
            "type": "string"
          },
          "sampling_plan": {
            "type": "string"
          },
          "corrective_actions": {
            "type": "string"
          }
        }
      },
      "regulatory_compliance": {
        "type": "object",
        "description": "Regulatory compliance information",
        "properties": {
          "fda_approved": {
            "type": "boolean"
          },
          "organic_certified": {
            "type": "boolean"
          },
          "kosher_certified": {
            "type": "boolean"
          },
          "halal_certified": {
            "type": "boolean"
          },
          "gmp_compliant": {
            "type": "boolean"
          },
          "haccp_plan": {
            "type": "boolean"
          }
        }
      },
      "production_notes": {
        "type": "string",
        "description": "Additional production notes and instructions"
      },
      "packaging_specs": {
        "type": "object",
        "description": "For packaging items: specifications",
        "properties": {
          "height": {
            "type": "string"
          },
          "width": {
            "type": "string"
          },
          "thickness": {
            "type": "string"
          },
          "material": {
            "type": "string"
          },
          "design": {
            "type": "string"
          },
          "contents": {
            "type": "string"
          }
        }
      },
      "status": {
        "type": "string",
        "enum": [
          "draft",
          "active",
          "inactive"
        ],
        "default": "active",
        "description": "Item status"
      }
    },
    "required": [
      "sku_code",
      "name",
      "category",
      "current_stock",
      "max_capacity",
      "unit_of_measure"
    ]
  }