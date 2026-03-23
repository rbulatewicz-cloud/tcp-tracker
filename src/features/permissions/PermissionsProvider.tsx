import React, { ReactNode } from 'react';
import { PermissionsContext } from './PermissionsContext';
import { usePermissions } from '../../hooks/usePermissions';

export const PermissionsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const permissions = usePermissions();

  return (
    <PermissionsContext.Provider value={{ permissions }}>
      {children}
    </PermissionsContext.Provider>
  );
};
