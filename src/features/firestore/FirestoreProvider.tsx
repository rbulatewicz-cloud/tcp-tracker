import React, { ReactNode } from 'react';
import { FirestoreContext } from './FirestoreContext';
import { useFirestoreData } from '../../hooks/useFirestoreData';
import { useAuthContext } from '../auth/AuthContext';

export const FirestoreProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { auth } = useAuthContext();
  const firestoreData = useFirestoreData(auth.currentUser, auth.role, auth.canManageApp);

  return (
    <FirestoreContext.Provider value={{ firestoreData }}>
      {children}
    </FirestoreContext.Provider>
  );
};
