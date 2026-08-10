export const buildAnalysisToolRegistry = ({
    analyticsService,
    jobOrderService
}) => {
    const handlers = {
        analyze_production_feasibility: async ({ args }) => {
            if (args.product_id) {
                return jobOrderService.checkProductionFeasibility(args.product_id, 1, args.show_chain !== false);
            }

            if (args.product_ids) {
                const results = [];
                for (const productId of args.product_ids) {
                    results.push(await jobOrderService.checkProductionFeasibility(productId, 1, args.show_chain !== false));
                }
                return results;
            }

            throw new Error('Please specify a product_id or list of product_ids to check feasibility for.');
        },

        analyze_reorder_needs: async ({ args }) => {
            if (args.item_id) {
                return analyticsService.calculateReorderPoint(args.item_id);
            }
            return analyticsService.getReorderRecommendations(args.category);
        },

        detect_anomalies: async ({ args }) => analyticsService.detectAnomalies({
            category: args.category,
            days: 30
        }),

        get_advanced_analytics: async ({ args }) => {
            if (args.analysis_type === 'supplier_performance') {
                if (!args.target_id) {
                    throw new Error('target_id (Supplier ID) is required');
                }
                return analyticsService.analyzeSupplierPerformance(args.target_id);
            }

            if (args.analysis_type === 'cost_analysis') {
                return analyticsService.analyzeInventoryCosts({
                    startDate: args.date_range?.start,
                    endDate: args.date_range?.end
                });
            }

            return undefined;
        }
    };

    return handlers;
};

