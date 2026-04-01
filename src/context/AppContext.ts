import { createContext } from 'react';
import type { useUIState } from '../hooks/useUIState';
import type { usePlanManagement } from '../hooks/usePlanManagement';
import type { useTableState } from '../hooks/useTableState';
import type { useAuth } from '../hooks/useAuth';
import type { useFirestoreData } from '../hooks/useFirestoreData';
import type { usePermissions } from '../hooks/usePermissions';
import type { usePlanActions } from '../hooks/usePlanActions';
import type { useUserManagement } from '../hooks/useUserManagement';
import type { useLOCManagement } from '../hooks/useLOCManagement';
import type { NoiseVariance } from '../types';

export interface AppContextType {
  uiState: ReturnType<typeof useUIState>;
  planManagement: ReturnType<typeof usePlanManagement>;
  tableState: ReturnType<typeof useTableState>;
  auth: ReturnType<typeof useAuth>;
  firestoreData: ReturnType<typeof useFirestoreData>;
  permissions: ReturnType<typeof usePermissions>;
  planActions: ReturnType<typeof usePlanActions>;
  userManagement: ReturnType<typeof useUserManagement>;
  locManagement: ReturnType<typeof useLOCManagement>;
  libraryVariances: NoiseVariance[];
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
