import React, { ReactNode } from 'react';
import { LOCContext } from './LOCContext';
import { useLOCManagement } from '../../hooks/useLOCManagement';
import { usePlan } from '../plans/PlanContext';
import { useFirestoreContext } from '../firestore/FirestoreContext';
import { useAuthContext } from '../auth/AuthContext';
import { useUI } from '../ui/UIContext';

export const LOCProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { planManagement } = usePlan();
  const { firestoreData } = useFirestoreContext();
  const { auth } = useAuthContext();
  const { uiState } = useUI();
  
  const locManagement = useLOCManagement(
    planManagement.selectedPlanIds, 
    firestoreData.plans, 
    auth.currentUser, 
    () => auth.currentUser ? `${auth.currentUser.name} (${auth.currentUser.role})` : "Guest", 
    new Date().toLocaleDateString('en-CA'), 
    uiState.setLoading, 
    planManagement.setSelectedPlanIds
  );

  return (
    <LOCContext.Provider value={{ locManagement }}>
      {children}
    </LOCContext.Provider>
  );
};
