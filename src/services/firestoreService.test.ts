import { describe, it, expect, vi } from 'vitest';
import { subscribeToPlans } from './firestoreService';

// Mock firebase
vi.mock('../firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'list' }
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn((_ref, callback) => {
    callback({ docs: [{ id: '1', data: () => ({ name: 'Test Plan' }) }] });
    return vi.fn(); // unsubscribe
  }),
}));

describe('firestoreService', () => {
  it('subscribeToPlans should call callback with data', () => {
    const callback = vi.fn();
    subscribeToPlans(callback);
    expect(callback).toHaveBeenCalledWith([{ id: '1', name: 'Test Plan' }]);
  });
});
