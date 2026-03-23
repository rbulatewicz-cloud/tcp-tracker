import { createContext, useContext } from 'react';
import { useUIState } from '../../hooks/useUIState';

export interface UIContextType {
  uiState: ReturnType<typeof useUIState>;
}

export const UIContext = createContext<UIContextType | undefined>(undefined);

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};
