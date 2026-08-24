import { beforeEach, describe, expect, it } from 'vitest';
import useStore from '../useStore.js';

describe('useStore reset', () => {
  beforeEach(() => {
    useStore.getState().reset();
  });

  it('restores initial state values', () => {
    useStore.getState().setItems([{ id: 1 }]);
    useStore.getState().setSuppliers([{ id: 2 }]);
    useStore.getState().setCurrentUser({ id: 3, username: 'alice' });
    useStore.getState().setCache('key', { value: 1 });
    useStore.getState().setDashboardStats({ total: 10 });

    useStore.getState().reset();

    const state = useStore.getState();
    expect(state.items).toEqual([]);
    expect(state.suppliers).toEqual([]);
    expect(state.currentUser).toBeNull();
    expect(state.cache).toEqual({});
    expect(state.dashboardStats).toBeNull();
  });

  it('keeps actions callable after reset', () => {
    useStore.getState().reset();
    useStore.getState().setItems([{ id: 99 }]);

    expect(useStore.getState().items).toEqual([{ id: 99 }]);
  });
});
