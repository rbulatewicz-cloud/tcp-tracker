import { describe, it, expect, vi } from 'vitest';
import { fetchUserRole } from './authService';
import { UserRole } from '../types';

// Mock the firebase modules
vi.mock('../firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { GET: 'get' }
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}));

describe('authService', () => {
  it('fetchUserRole should return GUEST if user not found', async () => {
    const { getDoc } = await import('firebase/firestore');
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => false,
    } as any);

    const role = await fetchUserRole('test@example.com');
    expect(role).toBe(UserRole.GUEST);
  });
});
