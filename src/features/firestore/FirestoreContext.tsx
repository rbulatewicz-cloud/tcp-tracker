import { createContext, useContext } from 'react';
import { useFirestoreData } from '../../hooks/useFirestoreData';

export interface FirestoreContextType {
  firestoreData: ReturnType<typeof useFirestoreData>;
}

export const FirestoreContext = createContext<FirestoreContextType | undefined>(undefined);

export const useFirestoreContext = () => {
  const context = useContext(FirestoreContext);
  if (!context) {
    throw new Error('useFirestoreContext must be used within a FirestoreProvider');
  }
  return context;
};
