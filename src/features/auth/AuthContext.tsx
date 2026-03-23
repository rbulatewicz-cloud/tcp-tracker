import { createContext, useContext } from 'react';
import { useAuth } from '../../hooks/useAuth';

export interface AuthContextType {
  auth: ReturnType<typeof useAuth>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
