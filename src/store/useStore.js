import { create } from 'zustand';

const useStore = create((set) => ({
  // Items state
  items: [],
  selectedItem: null,
  itemsLoading: false,
  setItems: (items) => set({ items }),
  setSelectedItem: (item) => set({ selectedItem: item }),
  setItemsLoading: (loading) => set({ itemsLoading: loading }),

  // Suppliers state
  suppliers: [],
  selectedSupplier: null,
  suppliersLoading: false,
  setSuppliers: (suppliers) => set({ suppliers }),
  setSelectedSupplier: (supplier) => set({ selectedSupplier: supplier }),
  setSuppliersLoading: (loading) => set({ suppliersLoading: loading }),

  // Purchase Orders state
  purchaseOrders: [],
  selectedPurchaseOrder: null,
  purchaseOrdersLoading: false,
  setPurchaseOrders: (orders) => set({ purchaseOrders: orders }),
  setSelectedPurchaseOrder: (order) => set({ selectedPurchaseOrder: order }),
  setPurchaseOrdersLoading: (loading) => set({ purchaseOrdersLoading: loading }),

  // Job Orders state
  jobOrders: [],
  selectedJobOrder: null,
  jobOrdersLoading: false,
  setJobOrders: (orders) => set({ jobOrders: orders }),
  setSelectedJobOrder: (order) => set({ selectedJobOrder: order }),
  setJobOrdersLoading: (loading) => set({ jobOrdersLoading: loading }),

  // Stock Movements state
  stockMovements: [],
  stockMovementsLoading: false,
  setStockMovements: (movements) => set({ stockMovements: movements }),
  setStockMovementsLoading: (loading) => set({ stockMovementsLoading: loading }),

  // Dashboard state
  dashboardStats: null,
  lowStockItems: [],
  recentMovements: [],
  dashboardLoading: false,
  setDashboardStats: (stats) => set({ dashboardStats: stats }),
  setLowStockItems: (items) => set({ lowStockItems: items }),
  setRecentMovements: (movements) => set({ recentMovements: movements }),
  setDashboardLoading: (loading) => set({ dashboardLoading: loading }),

  // Error state
  error: null,
  setError: (error) => set({ error }),

  // Loading state
  loading: false,
  setLoading: (loading) => set({ loading }),

  // Auth state
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  clearAuth: () => set({ user: null, isAuthenticated: false }),

  // Cache management
  cache: {},
  setCache: (key, value) => set((state) => ({
    cache: { ...state.cache, [key]: value }
  })),
  getCache: (key) => {
    const state = useStore.getState();
    return state.cache[key];
  },
  clearCache: () => set({ cache: {} })
}));

export default useStore;

