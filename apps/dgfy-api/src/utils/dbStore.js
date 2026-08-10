
import { AsyncLocalStorage } from 'async_hooks';
import defaultModels from '../models/index.js'; // The static/default models (Landlord + Main DB)

// The actual storage instance
const storage = new AsyncLocalStorage();

const dbStore = {
    /**
     * Run a function within a tenant context
     * @param {Object} store - Map or Object containing models { User, Item, ... }
     * @param {Function} callback - Function to run
     */
    run: (store, callback) => {
        return storage.run(store, callback);
    },

    /**
     * Get the current store (entire object)
     */
    getStore: () => {
        return storage.getStore();
    },

    /**
     * Get a specific model from the current context.
     * SAFELY falls back to default/global models if no context is active.
     * @param {string} modelName - e.g., 'User', 'Item'
     */
    get: (modelName) => {
        const store = storage.getStore();

        // 1. Try to get from active tenant context
        if (store && store[modelName]) {
            return store[modelName];
        }

        // 2. Fallback to default (Global/Landlord) models
        // This is CRITICAL for:
        // - Non-tenant routes (e.g. /landing-page)
        // - Legacy code not yet refactored
        // - Landlord-specific models (Tenant)
        // - During the migration phase
        if (defaultModels[modelName]) {
            return defaultModels[modelName];
        }

        throw new Error(`Model ${modelName} not found in Tenant Context OR Default Context`);
    }
};

export default dbStore;
