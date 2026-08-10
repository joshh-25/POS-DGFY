export const buildSupplierToolRegistry = ({ supplierService }) => {
  const handlers = {
    get_suppliers: async ({ args }) => {
      const { search, status = 'active', limit = 50 } = args;

      const result = await supplierService.getSuppliers({
        search,
        status,
        limit
      });

      return {
        count: result.length,
        suppliers: result.map((supplier) => ({
          id: supplier.supplier_id,
          name: supplier.name,
          contact_person: supplier.contact_person,
          email: supplier.email,
          phone: supplier.phone,
          quality_rating: supplier.quality_rating,
          avg_delivery_days: supplier.avg_delivery_days
        }))
      };
    },

    get_supplier_details: async ({ args }) => {
      const { supplier_id } = args;
      const supplier = await supplierService.getSupplierById(supplier_id);
      if (!supplier) {
        throw new Error('Supplier not found');
      }

      return {
        ...supplier,
        items_supplied: supplier.SupplierItems?.map((supplierItem) => ({
          item_id: supplierItem.item_id,
          item_name: supplierItem.Item?.name,
          price_per_unit: supplierItem.price_per_unit,
          moq: supplierItem.moq
        })) || []
      };
    },

    create_supplier: async ({ args, user }) => {
      const supplierData = {
        name: args.name,
        contact_person: args.contact_person,
        email: args.email,
        phone: args.phone,
        address: args.address,
        avg_delivery_days: args.lead_time,
        status: 'active'
      };

      const supplier = await supplierService.createSupplier(supplierData, user.user_id);
      return {
        success: true,
        message: `Supplier "${supplier.name}" registered successfully`,
        details: {
          Name: supplier.name,
          Contact: supplier.contact_person,
          Email: supplier.email,
          'Lead Time': `${supplier.avg_delivery_days} days`
        },
        related_entity: {
          type: 'supplier',
          id: supplier.supplier_id,
          label: supplier.name
        },
        suggested_actions: [
          { label: 'Create Purchase Order', prompt: `Create a purchase order for ${supplier.name}` }
        ],
        supplier: {
          id: supplier.supplier_id,
          name: supplier.name,
          contact: supplier.contact_person
        }
      };
    },

    update_supplier: async ({ args, user }) => {
      const { supplier_id, ...updates } = args;

      if (updates.lead_time) {
        updates.avg_delivery_days = updates.lead_time;
        delete updates.lead_time;
      }

      const supplier = await supplierService.updateSupplier(supplier_id, updates, user.user_id);
      return {
        success: true,
        message: `Supplier "${supplier.name}" updated successfully`,
        supplier: {
          id: supplier.supplier_id,
          name: supplier.name,
          status: supplier.status
        }
      };
    },

    delete_supplier: async ({ args, user }) => {
      const { supplier_id, reason } = args;
      await supplierService.deleteSupplier(supplier_id, user.user_id);
      return {
        success: true,
        message: 'Supplier has been soft-deleted',
        details: {
          'Supplier ID': String(supplier_id),
          Reason: reason || 'No reason provided',
          Status: 'Inactive'
        },
        note: 'Active POs were checked before deletion. Supplier is now inactive.'
      };
    },

    add_supplier_item: async ({ args }) => {
      const { supplier_id, item_id, moq, price_per_unit } = args;

      await supplierService.addSupplierItem(supplier_id, {
        item_id,
        moq: moq || 1,
        price_per_unit
      });

      return {
        success: true,
        message: 'Item linked to supplier successfully',
        details: {
          supplier_id,
          item_id,
          price: price_per_unit
        }
      };
    }
  };

  return handlers;
};
