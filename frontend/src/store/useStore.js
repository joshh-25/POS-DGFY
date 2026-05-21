import { create } from 'zustand';

const initialState = {
  // Items state
  items: [],
  selectedItem: null,
  itemsLoading: false,

  // Suppliers state
  suppliers: [],
  selectedSupplier: null,
  suppliersLoading: false,

  // Purchase Orders state
  purchaseOrders: [],
  selectedPurchaseOrder: null,
  purchaseOrdersLoading: false,

  // Job Orders state
  jobOrders: [],
  selectedJobOrder: null,
  jobOrdersLoading: false,

  // Stock Movements state
  stockMovements: [],
  stockMovementsLoading: false,

  // Dashboard state
  dashboardStats: null,
  lowStockItems: [],
  recentMovements: [],
  dashboardLoading: false,

  // Error state
  error: null,

  // Loading state
  loading: false,

  // Auth state
  user: null,
  isAuthenticated: false,

  // User profile state
  currentUser: null,
  userLoading: false,

  // User management state (admin)
  allUsers: [],
  usersLoading: false,

  // Cache management
  cache: {}
};

const useStore = create((set, get, store) => ({
  ...initialState,

  setItems: (items) => set({ items }),
  setSelectedItem: (item) => set({ selectedItem: item }),
  setItemsLoading: (loading) => set({ itemsLoading: loading }),

  setSuppliers: (suppliers) => set({ suppliers }),
  setSelectedSupplier: (supplier) => set({ selectedSupplier: supplier }),
  setSuppliersLoading: (loading) => set({ suppliersLoading: loading }),

  setPurchaseOrders: (orders) => set({ purchaseOrders: orders }),
  setSelectedPurchaseOrder: (order) => set({ selectedPurchaseOrder: order }),
  setPurchaseOrdersLoading: (loading) => set({ purchaseOrdersLoading: loading }),

  setJobOrders: (orders) => set({ jobOrders: orders }),
  setSelectedJobOrder: (order) => set({ selectedJobOrder: order }),
  setJobOrdersLoading: (loading) => set({ jobOrdersLoading: loading }),

  setStockMovements: (movements) => set({ stockMovements: movements }),
  setStockMovementsLoading: (loading) => set({ stockMovementsLoading: loading }),

  setDashboardStats: (stats) => set({ dashboardStats: stats }),
  setLowStockItems: (items) => set({ lowStockItems: items }),
  setRecentMovements: (movements) => set({ recentMovements: movements }),
  setDashboardLoading: (loading) => set({ dashboardLoading: loading }),

  setError: (error) => set({ error }),
  setLoading: (loading) => set({ loading }),

  setUser: (user) => set({ user, isAuthenticated: !!user }),
  clearAuth: () => set({ user: null, isAuthenticated: false }),

  setCurrentUser: (user) => set({ currentUser: user }),
  setUserLoading: (loading) => set({ userLoading: loading }),

  setAllUsers: (users) => set({ allUsers: users }),
  setUsersLoading: (loading) => set({ usersLoading: loading }),

  setCache: (key, value) => set((state) => ({
    cache: { ...state.cache, [key]: value }
  })),
  getCache: (key) => get().cache[key],
  clearCache: () => set({ cache: {} }),

  // Official Zustand reset pattern: use store.getInitialState() to avoid reset drift.
  reset: () => set(store.getInitialState())
}));

export default useStore;

