import React, { ReactNode } from 'react';
import { UserContext } from './UserContext';
import { useUserManagement } from '../../hooks/useUserManagement';
import { useAuthContext } from '../auth/AuthContext';
import { useUI } from '../ui/UIContext';

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { auth } = useAuthContext();
  const { uiState } = useUI();
  const userManagement = useUserManagement(auth.role, uiState.setShowUserForm);

  return (
    <UserContext.Provider value={{ userManagement }}>
      {children}
    </UserContext.Provider>
  );
};
