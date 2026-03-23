import { createContext, useContext } from 'react';
import { useTableState } from '../../hooks/useTableState';

export interface TableContextType {
  tableState: ReturnType<typeof useTableState>;
}

export const TableContext = createContext<TableContextType | undefined>(undefined);

export const useTable = () => {
  const context = useContext(TableContext);
  if (!context) {
    throw new Error('useTable must be used within a TableProvider');
  }
  return context;
};
