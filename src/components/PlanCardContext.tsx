import { useContext } from 'react';
import { PlanCardContext } from './PlanCardContextDef';
import type { PlanCardContextType, PlanData, PlanActions, PlanPermissions, PlanUtils } from './PlanCardProvider';

const usePlanCardBase = () => {
  const context = useContext(PlanCardContext);
  if (!context) throw new Error('usePlanCard must be used within a PlanCardProvider');
  return context;
};

export const usePlanCard = () => {
  const { data, actions, permissions, utils } = usePlanCardBase() as PlanCardContextType;
  return { ...data, ...actions, ...permissions, ...utils } as PlanData & PlanActions & PlanPermissions & PlanUtils;
};

export const usePlanCardStructured = () => usePlanCardBase();
export const usePlanData = () => usePlanCardBase().data;
export const usePlanActions = () => usePlanCardBase().actions;
export const usePlanPermissions = () => usePlanCardBase().permissions;
export const usePlanUtils = () => usePlanCardBase().utils;
