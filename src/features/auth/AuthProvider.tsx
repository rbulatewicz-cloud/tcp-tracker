import React, { ReactNode } from 'react';
import { AuthContext } from './AuthContext';
import { useAuth } from '../../hooks/useAuth';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const auth = useAuth();

  return (
    <AuthContext.Provider value={{ auth }}>
      {children}
    </AuthContext.Provider>
  );
};
