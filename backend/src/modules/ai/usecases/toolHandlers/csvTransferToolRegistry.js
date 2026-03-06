export const buildCsvTransferToolRegistry = ({
  tempFileService,
  itemService,
  supplierService,
  purchaseOrderService,
  jobOrderService,
  stockMovementService,
  logger
}) => {
  const handlers = {
    import_csv_data: async ({ args, user }) => {
      const {
        entity_type,
        csv_content,
        options = {},
        _confirmed = false
      } = args;

      try {
        if (!csv_content) {
          return {
            error: 'No CSV content provided. Please attach a CSV file or paste the CSV data.',
            success: false
          };
        }

        const parsed = tempFileService.parseCsv(csv_content);

        if (parsed.error) {
          return { error: parsed.error };
        }

        const requiredFields = {
          items: ['sku_code', 'name', 'category', 'max_capacity', 'unit_of_measure'],
          suppliers: ['name', 'contact_person', 'email']
        };

        const required = requiredFields[entity_type] || [];

        const validation = tempFileService.validateCsvStructure(parsed, required);

        if (!validation.valid) {
          return {
            success: false,
            error: 'Validation failed',
            validation_errors: validation.errors,
            parse_errors: validation.parseErrors,
            summary: validation.summary
          };
        }

        if (_confirmed) {
          const results = {
            imported: 0,
            skipped: 0,
            errors: []
          };

          for (const row of parsed.rows) {
            try {
              if (entity_type === 'suppliers') {
                await supplierService.createSupplier({
                  name: row.name,
                  contact_person: row.contact_person || '',
                  email: row.email || '',
                  phone: row.phone || '',
                  address: row.address || '',
                  status: 'active'
                }, user.user_id);
                results.imported++;
              } else if (entity_type === 'items') {
                await itemService.createItem({
                  sku_code: row.sku_code,
                  name: row.name,
                  category: row.category,
                  max_capacity: parseFloat(row.max_capacity) || 100,
                  unit_of_measure: row.unit_of_measure || 'pcs',
                  description: row.description || '',
                  cost_per_unit: parseFloat(row.cost_per_unit) || 0,
                  status: 'active'
                }, user.user_id);
                results.imported++;
              }
            } catch (rowError) {
              if (options.skip_duplicates && rowError.message?.includes('duplicate')) {
                results.skipped++;
              } else {
                results.errors.push({
                  row: row.name || row.sku_code || 'unknown',
                  error: rowError.message
                });
              }
            }
          }

          return {
            success: true,
            message: `Import completed: ${results.imported} ${entity_type} imported, ${results.skipped} skipped, ${results.errors.length} errors.`,
            details: {
              'Entity Type': entity_type.charAt(0).toUpperCase() + entity_type.slice(1),
              Imported: String(results.imported),
              Skipped: String(results.skipped),
              Errors: String(results.errors.length)
            },
            stats: {
              imported: results.imported,
              skipped: results.skipped,
              errors: results.errors.length
            },
            related_entity: {
              type: entity_type === 'items' ? 'item' : 'supplier',
              id: null,
              label: `All ${entity_type.charAt(0).toUpperCase() + entity_type.slice(1)}`
            },
            results
          };
        }

        return {
          success: true,
          requires_confirmation: true,
          entity_type,
          preview: {
            headers: parsed.headers,
            sample_rows: parsed.rows.slice(0, 5),
            total_rows: parsed.totalRows
          },
          summary: validation.summary,
          options: {
            skip_duplicates: options.skip_duplicates !== false,
            update_existing: options.update_existing === true
          },
          message: `Ready to import ${parsed.totalRows} ${entity_type}. Please confirm to proceed.`
        };
      } catch (error) {
        logger.error('Error in importCsvData:', error);
        return { error: error.message || 'Failed to parse CSV content' };
      }
    },

    export_to_csv: async ({ args, user }) => {
      const {
        entity_type,
        filters = {},
        output_preference = 'ask_user'
      } = args;

      try {
        let data = [];
        let columns = [];
        let filename = '';

        switch (entity_type) {
          case 'items': {
            const result = await itemService.getItems({
              category: filters.category,
              status: filters.status || 'active',
              limit: 1000
            });
            data = result.items || result.data?.items || [];
            columns = [
              { key: 'sku_code', label: 'SKU Code' },
              { key: 'name', label: 'Name' },
              { key: 'category', label: 'Category' },
              { key: 'current_stock', label: 'Current Stock' },
              { key: 'max_capacity', label: 'Max Capacity' },
              { key: 'min_threshold', label: 'Min Threshold' },
              { key: 'unit_of_measure', label: 'Unit' },
              { key: 'cost_per_unit', label: 'Cost/Unit' },
              { key: 'status', label: 'Status' }
            ];
            filename = `items_export_${new Date().toISOString().split('T')[0]}.csv`;
            break;
          }

          case 'suppliers': {
            const result = await supplierService.getSuppliers({
              status: filters.status || 'active',
              limit: 500
            });
            data = result.suppliers || result.data?.suppliers || [];
            columns = [
              { key: 'name', label: 'Name' },
              { key: 'contact_person', label: 'Contact Person' },
              { key: 'email', label: 'Email' },
              { key: 'phone', label: 'Phone' },
              { key: 'address', label: 'Address' },
              { key: 'quality_rating', label: 'Quality Rating' },
              { key: 'lead_time', label: 'Lead Time (days)' },
              { key: 'status', label: 'Status' }
            ];
            filename = `suppliers_export_${new Date().toISOString().split('T')[0]}.csv`;
            break;
          }

          case 'purchase_orders': {
            const result = await purchaseOrderService.getPurchaseOrders({
              status: filters.status,
              startDate: filters.date_from,
              endDate: filters.date_to,
              limit: 500
            });
            data = (result.purchaseOrders || result.data?.purchaseOrders || []).map((purchaseOrder) => ({
              po_number: purchaseOrder.po_number,
              supplier_name: purchaseOrder.supplier?.name || purchaseOrder.Supplier?.name || '',
              status: purchaseOrder.status,
              total_amount: purchaseOrder.total_amount,
              expected_delivery: purchaseOrder.expected_delivery,
              created_at: purchaseOrder.created_at
            }));
            columns = [
              { key: 'po_number', label: 'PO Number' },
              { key: 'supplier_name', label: 'Supplier' },
              { key: 'status', label: 'Status' },
              { key: 'total_amount', label: 'Total Amount' },
              { key: 'expected_delivery', label: 'Expected Delivery' },
              { key: 'created_at', label: 'Created At' }
            ];
            filename = `purchase_orders_export_${new Date().toISOString().split('T')[0]}.csv`;
            break;
          }

          case 'job_orders': {
            const result = await jobOrderService.getJobOrders({
              status: filters.status,
              limit: 500
            });
            data = (result.jobOrders || result.data?.jobOrders || []).map((jobOrder) => ({
              jo_number: jobOrder.jo_number,
              product_name: jobOrder.product?.name || jobOrder.Product?.name || '',
              quantity_to_produce: jobOrder.quantity_to_produce,
              quantity_produced: jobOrder.quantity_produced,
              status: jobOrder.status,
              created_at: jobOrder.created_at
            }));
            columns = [
              { key: 'jo_number', label: 'JO Number' },
              { key: 'product_name', label: 'Product' },
              { key: 'quantity_to_produce', label: 'Qty to Produce' },
              { key: 'quantity_produced', label: 'Qty Produced' },
              { key: 'status', label: 'Status' },
              { key: 'created_at', label: 'Created At' }
            ];
            filename = `job_orders_export_${new Date().toISOString().split('T')[0]}.csv`;
            break;
          }

          case 'stock_movements': {
            const result = await stockMovementService.getStockMovements({
              item_id: filters.item_id,
              startDate: filters.date_from,
              endDate: filters.date_to,
              limit: 1000
            });
            data = (result.movements || result.data?.movements || []).map((movement) => ({
              movement_id: movement.movement_id,
              item_name: movement.item?.name || movement.Item?.name || '',
              movement_type: movement.movement_type,
              quantity: movement.quantity,
              reference_type: movement.reference_type,
              reference_id: movement.reference_id,
              created_by: movement.userResponsible?.username || '',
              created_at: movement.created_at
            }));
            columns = [
              { key: 'movement_id', label: 'Movement ID' },
              { key: 'item_name', label: 'Item' },
              { key: 'movement_type', label: 'Type' },
              { key: 'quantity', label: 'Quantity' },
              { key: 'reference_type', label: 'Reference Type' },
              { key: 'reference_id', label: 'Reference ID' },
              { key: 'created_by', label: 'Created By' },
              { key: 'created_at', label: 'Created At' }
            ];
            filename = `stock_movements_export_${new Date().toISOString().split('T')[0]}.csv`;
            break;
          }

          default:
            return { error: `Export not supported for entity type: ${entity_type}` };
        }

        if (data.length === 0) {
          return {
            success: true,
            message: `No ${entity_type} found matching the specified filters.`,
            total_records: 0
          };
        }

        const csvContent = tempFileService.generateCsv(data, columns);

        if (output_preference === 'display') {
          const displayRows = data.slice(0, 10);
          return {
            success: true,
            output_mode: 'display',
            entity_type,
            total_records: data.length,
            preview: {
              headers: columns.map((column) => column.label),
              rows: displayRows.map((row) => columns.map((column) => row[column.key] || '')),
              showing: displayRows.length,
              total: data.length
            },
            message: `Showing first ${displayRows.length} of ${data.length} records.${data.length > 10 ? ' Use download option for full data.' : ''}`
          };
        }

        if (output_preference === 'download') {
          const fileInfo = await tempFileService.storeTemporaryFile(
            csvContent,
            filename,
            user.user_id
          );

          return {
            success: true,
            output_mode: 'download',
            entity_type,
            total_records: data.length,
            download: {
              url: fileInfo.downloadUrl,
              filename: fileInfo.filename,
              expires_at: fileInfo.expiresAt,
              expires_in: fileInfo.expiresIn
            },
            message: `Export ready! ${data.length} records exported. Download link valid for 1 hour.`
          };
        }

        return {
          success: true,
          output_mode: 'ask_preference',
          entity_type,
          total_records: data.length,
          message: `Ready to export ${data.length} ${entity_type}. How would you like to receive the data?`,
          options: [
            { value: 'display', label: 'Display in chat (first 10 rows)' },
            { value: 'download', label: 'Generate download link' }
          ]
        };
      } catch (error) {
        logger.error('Error in exportToCsv:', error);
        return { error: error.message || 'Failed to export data' };
      }
    }
  };

  return handlers;
};
