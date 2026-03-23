import { createContext, useContext } from 'react';
import { usePermissions } from '../../hooks/usePermissions';

export interface PermissionsContextType {
  permissions: ReturnType<typeof usePermissions>;
}

export const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export const usePermissionsContext = () => {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error('usePermissionsContext must be used within a PermissionsProvider');
  }
  return context;
};
