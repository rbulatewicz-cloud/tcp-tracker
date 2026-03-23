import React, { ReactNode } from 'react';
import { UIContext } from './UIContext';
import { useUIState } from '../../hooks/useUIState';

export const UIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const uiState = useUIState();

  return (
    <UIContext.Provider value={{ uiState }}>
      {children}
    </UIContext.Provider>
  );
};
