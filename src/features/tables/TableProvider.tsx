import React, { ReactNode } from 'react';
import { TableContext } from './TableContext';
import { useTableState } from '../../hooks/useTableState';

export const TableProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const tableState = useTableState();

  return (
    <TableContext.Provider value={{ tableState }}>
      {children}
    </TableContext.Provider>
  );
};
