# Frontend-Backend Integration Guide

## Table of Contents

> **Navigation Tip:** Click a section to jump directly to that part.

### Setup & Services
- [Overview](#overview)
- [Part 1: API Client Setup](#part-1-api-client-setup)
- [Part 2: State Management with Zustand](#part-2-state-management-with-zustand)
- [Part 3: Custom Hooks for Data Fetching](#part-3-custom-hooks-for-data-fetching)

### Real-time & Error Handling
- [Part 4: Real-time Updates with WebSocket](#part-4-real-time-updates-with-websocket)
- [Part 5: Error Handling & Retry Logic](#part-5-error-handling--retry-logic)
- [Part 6: Updating Existing Components](#part-6-updating-existing-components)

### Configuration & Testing
- [Part 7: Environment Configuration](#part-7-environment-configuration)
- [Part 8: Testing Integration](#part-8-testing-integration)
- [Part 9: Performance Optimization](#part-9-performance-optimization)
- [Checklist for Integration](#checklist-for-integration)

---

# Frontend-Backend Integration Guide

## Overview

This guide provides detailed instructions for integrating the React frontend with the Node.js/Express backend, including API client setup, state management, real-time updates, and error handling.

---

## Part 1: API Client Setup

### Creating the API Service Layer

The API service layer acts as a bridge between the frontend and backend, handling all HTTP requests and responses.

**File: `src/services/api.js`**

```javascript
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add JWT token and Company Token to headers
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    const companyToken = localStorage.getItem('companyToken');
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    if (companyToken) {
      config.headers['x-company-token'] = companyToken;
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - Handle token refresh and errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const response = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
          refreshToken,
        });

        const { token } = response.data.data;
        localStorage.setItem('authToken', token);

        api.defaults.headers.common.Authorization = `Bearer ${token}`;
        originalRequest.headers.Authorization = `Bearer ${token}`;

        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

### Authentication Service

**File: `src/services/authService.js`**

The authentication service handles login, logout, and registration. It also dispatches custom events that allow other parts of the application (like PermissionContext) to react to authentication state changes.

```javascript
import api from './api';

export const register = async (userData, companyToken) => {
  const config = companyToken ? {
    headers: { 'x-company-token': companyToken }
  } : {};

  const response = await api.post('/auth/register', userData, config);
  const { token, refreshToken } = response.data.data;
  localStorage.setItem('authToken', token);
  localStorage.setItem('refreshToken', refreshToken);
  if (companyToken) {
    localStorage.setItem('companyToken', companyToken);
  }

  // Dispatch custom event to notify PermissionContext to reload
  window.dispatchEvent(new CustomEvent('auth:login'));

  return response.data.data;
};

export const login = async (credentials) => {
  const config = {
    headers: { 'x-company-token': credentials.companyToken }
  };

  const response = await api.post('/auth/login', {
    email: credentials.email,
    password: credentials.password
  }, config);

  const { token, refreshToken } = response.data.data;
  localStorage.setItem('authToken', token);
  localStorage.setItem('refreshToken', refreshToken);
  if (credentials.companyToken) {
    localStorage.setItem('companyToken', credentials.companyToken);
  }

  // Dispatch custom event to notify PermissionContext to reload
  window.dispatchEvent(new CustomEvent('auth:login'));

  return response.data.data;
};

export const logout = async () => {
  await api.post('/auth/logout');
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('companyToken');

  // Dispatch custom event to notify PermissionContext to clear permissions
  window.dispatchEvent(new CustomEvent('auth:logout'));
};

export const getCurrentUser = async () => {
  const response = await api.get('/users/me');
  return response.data.data;
};
```

### Authentication Events

The authentication service dispatches custom browser events that other components can listen to:

| Event | When Fired | Purpose |
|-------|------------|---------|
| `auth:login` | After successful login or registration | Triggers PermissionContext to reload user permissions |
| `auth:logout` | After logout completes | Triggers PermissionContext to clear permissions |

**Listening for auth events (example):**

```javascript
useEffect(() => {
  const handleAuthChange = () => {
    // React to authentication state change
    loadPermissions();
  };

  window.addEventListener('auth:login', handleAuthChange);
  window.addEventListener('auth:logout', handleAuthChange);

  return () => {
    window.removeEventListener('auth:login', handleAuthChange);
    window.removeEventListener('auth:logout', handleAuthChange);
  };
}, []);
```

This event-based system ensures that the PermissionContext always has up-to-date user permissions after login, preventing race conditions where the sidebar might render before permissions are loaded.

### Items Service

**File: `src/services/itemService.js`**

```javascript
import api from './api';

const itemService = {
  getItems: async (params = {}) => {
    const response = await api.get('/items', { params });
    return response.data.data;
  },

  getItemById: async (itemId) => {
    const response = await api.get(`/items/${itemId}`);
    return response.data.data;
  },

  createItem: async (itemData) => {
    const response = await api.post('/items', itemData);
    return response.data.data;
  },

  updateItem: async (itemId, itemData) => {
    const response = await api.put(`/items/${itemId}`, itemData);
    return response.data.data;
  },

  deleteItem: async (itemId) => {
    await api.delete(`/items/${itemId}`);
  },

  getItemStockHistory: async (itemId, params = {}) => {
    const response = await api.get(`/items/${itemId}/stock-history`, { params });
    return response.data.data;
  },
};

export default itemService;
```

### Supplier Service

**File: `src/services/supplierService.js`**

```javascript
import api from './api';

const supplierService = {
  getSuppliers: async (params = {}) => {
    const response = await api.get('/suppliers', { params });
    return response.data.data;
  },

  getSupplierById: async (supplierId) => {
    const response = await api.get(`/suppliers/${supplierId}`);
    return response.data.data;
  },

  createSupplier: async (supplierData) => {
    const response = await api.post('/suppliers', supplierData);
    return response.data.data;
  },

  updateSupplier: async (supplierId, supplierData) => {
    const response = await api.put(`/suppliers/${supplierId}`, supplierData);
    return response.data.data;
  },

  deleteSupplier: async (supplierId) => {
    await api.delete(`/suppliers/${supplierId}`);
  },

  addItemToSupplier: async (supplierId, itemData) => {
    const response = await api.post(`/suppliers/${supplierId}/items`, itemData);
    return response.data.data;
  },
};

export default supplierService;
```

### Purchase Order Service

**File: `src/services/poService.js`**

```javascript
import api from './api';

const poService = {
  getPurchaseOrders: async (params = {}) => {
    const response = await api.get('/purchase-orders', { params });
    return response.data.data;
  },

  getPOById: async (poId) => {
    const response = await api.get(`/purchase-orders/${poId}`);
    return response.data.data;
  },

  createPO: async (poData) => {
    const response = await api.post('/purchase-orders', poData);
    return response.data.data;
  },

  updatePO: async (poId, poData) => {
    const response = await api.put(`/purchase-orders/${poId}`, poData);
    return response.data.data;
  },

  receivePO: async (poId, receiptData) => {
    const response = await api.post(`/purchase-orders/${poId}/receive`, receiptData);
    return response.data.data;
  },

  cancelPO: async (poId) => {
    const response = await api.post(`/purchase-orders/${poId}/cancel`);
    return response.data.data;
  },
};

export default poService;
```

### Job Order Service

**File: `src/services/joService.js`**

```javascript
import api from './api';

const joService = {
  getJobOrders: async (params = {}) => {
    const response = await api.get('/job-orders', { params });
    return response.data.data;
  },

  getJOById: async (joId) => {
    const response = await api.get(`/job-orders/${joId}`);
    return response.data.data;
  },

  createJO: async (joData) => {
    const response = await api.post('/job-orders', joData);
    return response.data.data;
  },

  startProduction: async (joId) => {
    const response = await api.put(`/job-orders/${joId}/start`);
    return response.data.data;
  },

  completeProduction: async (joId, completionData) => {
    const response = await api.put(`/job-orders/${joId}/complete`, completionData);
    return response.data.data;
  },

  cancelJO: async (joId) => {
    const response = await api.post(`/job-orders/${joId}/cancel`);
    return response.data.data;
  },
};

export default joService;
```

---

## Part 2: State Management with Zustand

### Store Setup

**File: `src/store/useStore.js`**

```javascript
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

const useStore = create(
  devtools(
    persist(
      (set, get) => ({
        // Auth state
        user: null,
        isAuthenticated: false,
        loading: false,
        error: null,

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
        selectedPO: null,
        posLoading: false,

        // Job Orders state
        jobOrders: [],
        selectedJO: null,
        josLoading: false,

        // Notifications
        notifications: [],

        // Auth actions
        setUser: (user) => set({ user, isAuthenticated: !!user }),
        setLoading: (loading) => set({ loading }),
        setError: (error) => set({ error }),
        clearError: () => set({ error: null }),

        // Items actions
        setItems: (items) => set({ items }),
        setSelectedItem: (item) => set({ selectedItem: item }),
        setItemsLoading: (loading) => set({ itemsLoading: loading }),
        addItem: (item) => set((state) => ({ items: [...state.items, item] })),
        updateItem: (id, updates) =>
          set((state) => ({
            items: state.items.map((item) =>
              item.item_id === id ? { ...item, ...updates } : item
            ),
          })),
        removeItem: (id) =>
          set((state) => ({
            items: state.items.filter((item) => item.item_id !== id),
          })),

        // Suppliers actions
        setSuppliers: (suppliers) => set({ suppliers }),
        setSelectedSupplier: (supplier) => set({ selectedSupplier: supplier }),
        setSuppliersLoading: (loading) => set({ suppliersLoading: loading }),
        addSupplier: (supplier) =>
          set((state) => ({ suppliers: [...state.suppliers, supplier] })),
        updateSupplier: (id, updates) =>
          set((state) => ({
            suppliers: state.suppliers.map((supplier) =>
              supplier.supplier_id === id ? { ...supplier, ...updates } : supplier
            ),
          })),

        // PO actions
        setPurchaseOrders: (pos) => set({ purchaseOrders: pos }),
        setSelectedPO: (po) => set({ selectedPO: po }),
        setPOsLoading: (loading) => set({ posLoading: loading }),
        addPO: (po) =>
          set((state) => ({ purchaseOrders: [...state.purchaseOrders, po] })),
        updatePO: (id, updates) =>
          set((state) => ({
            purchaseOrders: state.purchaseOrders.map((po) =>
              po.po_id === id ? { ...po, ...updates } : po
            ),
          })),

        // JO actions
        setJobOrders: (jos) => set({ jobOrders: jos }),
        setSelectedJO: (jo) => set({ selectedJO: jo }),
        setJOsLoading: (loading) => set({ josLoading: loading }),
        addJO: (jo) =>
          set((state) => ({ jobOrders: [...state.jobOrders, jo] })),
        updateJO: (id, updates) =>
          set((state) => ({
            jobOrders: state.jobOrders.map((jo) =>
              jo.jo_id === id ? { ...jo, ...updates } : jo
            ),
          })),

        // Notification actions
        addNotification: (notification) =>
          set((state) => ({
            notifications: [...state.notifications, notification],
          })),
        removeNotification: (id) =>
          set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id),
          })),
      }),
      {
        name: 'sku-inventory-store',
        partialize: (state) => ({
          user: state.user,
          isAuthenticated: state.isAuthenticated,
        }),
      }
    )
  )
);

export default useStore;
```

---

## Part 3: Custom Hooks for Data Fetching

### useItems Hook

**File: `src/hooks/useItems.js`**

```javascript
import { useEffect, useCallback } from 'react';
import useStore from '../store/useStore';
import itemService from '../services/itemService';

export const useItems = (params = {}) => {
  const { items, itemsLoading, setItems, setItemsLoading, setError } = useStore();

  const fetchItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      const data = await itemService.getItems(params);
      setItems(data.items);
    } catch (error) {
      setError(error.message);
    } finally {
      setItemsLoading(false);
    }
  }, [params, setItems, setItemsLoading, setError]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return { items, loading: itemsLoading, refetch: fetchItems };
};

export const useItemById = (itemId) => {
  const { selectedItem, setSelectedItem, itemsLoading, setItemsLoading, setError } =
    useStore();

  const fetchItem = useCallback(async () => {
    if (!itemId) return;
    setItemsLoading(true);
    try {
      const data = await itemService.getItemById(itemId);
      setSelectedItem(data);
    } catch (error) {
      setError(error.message);
    } finally {
      setItemsLoading(false);
    }
  }, [itemId, setSelectedItem, setItemsLoading, setError]);

  useEffect(() => {
    fetchItem();
  }, [fetchItem]);

  return { item: selectedItem, loading: itemsLoading, refetch: fetchItem };
};

export const useCreateItem = () => {
  const { addItem, setLoading, setError } = useStore();

  const createItem = useCallback(
    async (itemData) => {
      setLoading(true);
      try {
        const newItem = await itemService.createItem(itemData);
        addItem(newItem);
        return newItem;
      } catch (error) {
        setError(error.message);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [addItem, setLoading, setError]
  );

  return { createItem };
};

export const useUpdateItem = () => {
  const { updateItem, setLoading, setError } = useStore();

  const updateItemData = useCallback(
    async (itemId, itemData) => {
      setLoading(true);
      try {
        const updated = await itemService.updateItem(itemId, itemData);
        updateItem(itemId, updated);
        return updated;
      } catch (error) {
        setError(error.message);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [updateItem, setLoading, setError]
  );

  return { updateItem: updateItemData };
};
```

### useSuppliers Hook

**File: `src/hooks/useSuppliers.js`**

```javascript
import { useEffect, useCallback } from 'react';
import useStore from '../store/useStore';
import supplierService from '../services/supplierService';

export const useSuppliers = (params = {}) => {
  const { suppliers, suppliersLoading, setSuppliers, setSuppliersLoading, setError } =
    useStore();

  const fetchSuppliers = useCallback(async () => {
    setSuppliersLoading(true);
    try {
      const data = await supplierService.getSuppliers(params);
      setSuppliers(data.suppliers);
    } catch (error) {
      setError(error.message);
    } finally {
      setSuppliersLoading(false);
    }
  }, [params, setSuppliers, setSuppliersLoading, setError]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  return { suppliers, loading: suppliersLoading, refetch: fetchSuppliers };
};

export const useCreateSupplier = () => {
  const { addSupplier, setLoading, setError } = useStore();

  const createSupplier = useCallback(
    async (supplierData) => {
      setLoading(true);
      try {
        const newSupplier = await supplierService.createSupplier(supplierData);
        addSupplier(newSupplier);
        return newSupplier;
      } catch (error) {
        setError(error.message);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [addSupplier, setLoading, setError]
  );

  return { createSupplier };
};
```

---

## Part 4: Real-time Updates with WebSocket

### WebSocket Service

**File: `src/services/websocketService.js`**

```javascript
import io from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.listeners = {};
  }

  connect(token) {
    this.socket = io(SOCKET_URL, {
      auth: {
        token,
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.emit('connected');
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      this.emit('disconnected');
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);

    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
    }

    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }
}

export default new WebSocketService();
```

### Using WebSocket in Components

**File: `src/hooks/useWebSocket.js`**

```javascript
import { useEffect } from 'react';
import useStore from '../store/useStore';
import websocketService from '../services/websocketService';

export const useWebSocketAlerts = () => {
  const { addNotification } = useStore();

  useEffect(() => {
    const handleStockAlert = (data) => {
      addNotification({
        id: Date.now(),
        type: 'stock_alert',
        title: 'Stock Alert',
        message: data.message,
        severity: data.severity,
      });
    };

    const handlePOUpdate = (data) => {
      addNotification({
        id: Date.now(),
        type: 'po_update',
        title: 'Purchase Order Update',
        message: data.message,
        severity: 'info',
      });
    };

    const handleJOUpdate = (data) => {
      addNotification({
        id: Date.now(),
        type: 'jo_update',
        title: 'Job Order Update',
        message: data.message,
        severity: 'info',
      });
    };

    websocketService.on('stock_alert', handleStockAlert);
    websocketService.on('po_update', handlePOUpdate);
    websocketService.on('jo_update', handleJOUpdate);

    return () => {
      websocketService.off('stock_alert', handleStockAlert);
      websocketService.off('po_update', handlePOUpdate);
      websocketService.off('jo_update', handleJOUpdate);
    };
  }, [addNotification]);
};
```

---

## Part 5: Error Handling & Retry Logic

### Error Handling Utility

**File: `src/utils/errorHandler.js`**

```javascript
export const handleApiError = (error) => {
  if (error.response) {
    // Server responded with error status
    const { status, data } = error.response;

    switch (status) {
      case 400:
        return {
          message: data.message || 'Invalid request',
          errors: data.errors,
        };
      case 401:
        return {
          message: 'Unauthorized. Please login again.',
          type: 'auth',
        };
      case 403:
        return {
          message: 'You do not have permission to perform this action.',
          type: 'permission',
        };
      case 404:
        return {
          message: 'Resource not found.',
          type: 'notfound',
        };
      case 422:
        return {
          message: 'Validation failed',
          errors: data.errors,
        };
      case 500:
        return {
          message: 'Server error. Please try again later.',
          type: 'server',
        };
      default:
        return {
          message: data.message || 'An error occurred',
        };
    }
  } else if (error.request) {
    // Request made but no response
    return {
      message: 'No response from server. Check your connection.',
      type: 'network',
    };
  } else {
    // Error in request setup
    return {
      message: error.message || 'An unexpected error occurred',
    };
  }
};

export const isRetryableError = (error) => {
  if (!error.response) return true; // Network errors are retryable

  const retryableStatuses = [408, 429, 500, 502, 503, 504];
  return retryableStatuses.includes(error.response.status);
};
```

### Retry Hook

**File: `src/hooks/useRetry.js`**

```javascript
import { useCallback } from 'react';

export const useRetry = (maxRetries = 3, delayMs = 1000) => {
  const retry = useCallback(
    async (asyncFunction) => {
      let lastError;

      for (let i = 0; i < maxRetries; i++) {
        try {
          return await asyncFunction();
        } catch (error) {
          lastError = error;

          if (i < maxRetries - 1) {
            const delay = delayMs * Math.pow(2, i); // Exponential backoff
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      throw lastError;
    },
    [maxRetries, delayMs]
  );

  return { retry };
};
```

---

## Part 6: Updating Existing Components

### Example: Items Page Integration

**File: `src/Pages/Items.jsx`**

```javascript
import React, { useState } from 'react';
import { useItems, useCreateItem, useUpdateItem } from '../hooks/useItems';
import useStore from '../store/useStore';
import ItemCard from '../Components/items/ItemCard';
import ItemFormModal from '../Components/items/ItemFormModal';
import { Button } from '../Components/ui/button';
import { handleApiError } from '../utils/errorHandler';

export default function Items() {
  const { items, loading, refetch } = useItems();
  const { createItem } = useCreateItem();
  const { updateItem } = useUpdateItem();
  const { addNotification, error, clearError } = useStore();
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const handleCreateItem = async (formData) => {
    try {
      await createItem(formData);
      addNotification({
        id: Date.now(),
        type: 'success',
        title: 'Success',
        message: 'Item created successfully',
      });
      setShowFormModal(false);
      refetch();
    } catch (error) {
      const errorInfo = handleApiError(error);
      addNotification({
        id: Date.now(),
        type: 'error',
        title: 'Error',
        message: errorInfo.message,
      });
    }
  };

  const handleUpdateItem = async (formData) => {
    try {
      await updateItem(editingItem.item_id, formData);
      addNotification({
        id: Date.now(),
        type: 'success',
        title: 'Success',
        message: 'Item updated successfully',
      });
      setShowFormModal(false);
      setEditingItem(null);
      refetch();
    } catch (error) {
      const errorInfo = handleApiError(error);
      addNotification({
        id: Date.now(),
        type: 'error',
        title: 'Error',
        message: errorInfo.message,
      });
    }
  };

  const handleEditClick = (item) => {
    setEditingItem(item);
    setShowFormModal(true);
  };

  const handleCloseModal = () => {
    setShowFormModal(false);
    setEditingItem(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Items</h1>
        <Button onClick={() => setShowFormModal(true)}>Add New Item</Button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
          <button onClick={clearError} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">Loading items...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <ItemCard
              key={item.item_id}
              item={item}
              onEdit={() => handleEditClick(item)}
            />
          ))}
        </div>
      )}

      <ItemFormModal
        isOpen={showFormModal}
        onClose={handleCloseModal}
        onSubmit={editingItem ? handleUpdateItem : handleCreateItem}
        initialData={editingItem}
        isEditing={!!editingItem}
      />
    </div>
  );
}
```

---

## Part 7: Environment Configuration

### Frontend Environment Variables

**File: `.env.example`**

```
REACT_APP_API_URL=http://localhost:5000/api/v1
REACT_APP_SOCKET_URL=http://localhost:5000
REACT_APP_ENV=development
REACT_APP_LOG_LEVEL=debug
```

### Backend Environment Variables

**File: `backend/.env.example`**

```
NODE_ENV=development
PORT=5000
DATABASE_URL=mysql://user:password@localhost:3306/sku_inventory_manager
JWT_SECRET=your-secret-key-here
JWT_EXPIRY=24h
REFRESH_TOKEN_SECRET=your-refresh-secret
REFRESH_TOKEN_EXPIRY=7d
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:3000
```

---

## Part 8: Testing Integration

### Integration Test Example

**File: `src/__tests__/integration/items.test.js`**

```javascript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Items from '../../Pages/Items';
import * as itemService from '../../services/itemService';

jest.mock('../../services/itemService');

describe('Items Integration', () => {
  beforeEach(() => {
    itemService.getItems.mockResolvedValue({
      items: [
        {
          item_id: 1,
          sku_code: 'ING-001',
          name: 'Flour',
          category: 'ingredient',
        },
      ],
    });
  });

  test('displays items on load', async () => {
    render(<Items />);

    await waitFor(() => {
      expect(screen.getByText('Flour')).toBeInTheDocument();
    });
  });

  test('creates new item', async () => {
    const user = userEvent.setup();
    itemService.createItem.mockResolvedValue({
      item_id: 2,
      sku_code: 'ING-002',
      name: 'Sugar',
    });

    render(<Items />);

    const addButton = screen.getByText('Add New Item');
    await user.click(addButton);

    // Fill form and submit
    // Verify item was created
  });
});
```

---

## Part 9: Performance Optimization

### Lazy Loading Components

**File: `src/Pages/Dashboard.jsx`**

```javascript
import React, { lazy, Suspense } from 'react';

const StatsCard = lazy(() => import('../Components/dashboard/StatsCard'));
const LowStockList = lazy(() => import('../Components/dashboard/LowStockList'));
const RecentMovements = lazy(() => import('../Components/dashboard/RecentMovements'));

export default function Dashboard() {
  return (
    <div className="space-y-4">
      <Suspense fallback={<div>Loading stats...</div>}>
        <StatsCard />
      </Suspense>

      <Suspense fallback={<div>Loading low stock items...</div>}>
        <LowStockList />
      </Suspense>

      <Suspense fallback={<div>Loading recent movements...</div>}>
        <RecentMovements />
      </Suspense>
    </div>
  );
}
```

### API Request Caching

**File: `src/hooks/useCache.js`**

```javascript
import { useRef, useCallback } from 'react';

export const useCache = (ttl = 5 * 60 * 1000) => {
  const cacheRef = useRef({});

  const getCached = useCallback((key) => {
    const cached = cacheRef.current[key];
    if (!cached) return null;

    if (Date.now() - cached.timestamp > ttl) {
      delete cacheRef.current[key];
      return null;
    }

    return cached.data;
  }, [ttl]);

  const setCached = useCallback((key, data) => {
    cacheRef.current[key] = {
      data,
      timestamp: Date.now(),
    };
  }, []);

  const clearCache = useCallback(() => {
    cacheRef.current = {};
  }, []);

  return { getCached, setCached, clearCache };
};
```

---

## Checklist for Integration

- [ ] API service layer created and configured
- [ ] Authentication service implemented
- [ ] All entity services created (items, suppliers, POs, JOs)
- [ ] State management with Zustand set up
- [ ] Custom hooks for data fetching created
- [ ] WebSocket service configured
- [ ] Error handling utilities implemented
- [ ] Retry logic implemented
- [ ] Components updated to use API services
- [ ] Environment variables configured
- [ ] Integration tests written
- [ ] Performance optimizations applied
- [ ] Real-time updates working
- [ ] Offline support implemented
- [ ] Error messages display correctly

