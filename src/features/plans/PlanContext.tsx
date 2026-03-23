import { createContext, useContext } from 'react';
import { usePlanManagement } from '../../hooks/usePlanManagement';
import { usePlanActions } from '../../hooks/usePlanActions';
import { usePlanExport } from '../../hooks/usePlanExport';

export interface PlanContextType {
  planManagement: ReturnType<typeof usePlanManagement>;
  planActions: ReturnType<typeof usePlanActions>;
  planExport: ReturnType<typeof usePlanExport>;
}

export const PlanContext = createContext<PlanContextType | undefined>(undefined);

export const usePlan = () => {
  const context = useContext(PlanContext);
  if (!context) {
    throw new Error('usePlan must be used within a PlanProvider');
  }
  return context;
};
