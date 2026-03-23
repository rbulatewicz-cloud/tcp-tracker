import { createContext, useContext } from 'react';
import { useLOCManagement } from '../../hooks/useLOCManagement';

export interface LOCContextType {
  locManagement: ReturnType<typeof useLOCManagement>;
}

export const LOCContext = createContext<LOCContextType | undefined>(undefined);

export const useLOCContext = () => {
  const context = useContext(LOCContext);
  if (!context) {
    throw new Error('useLOCContext must be used within a LOCProvider');
  }
  return context;
};
