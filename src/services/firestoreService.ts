import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

export const subscribeToPlans = (callback: (data: any[]) => void) => {
  return onSnapshot(collection(db, 'plans'), (snapshot) => {
    const plansData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
    callback(plansData);
  }, (error) => handleFirestoreError(error, OperationType.LIST, 'plans'));
};

export const subscribeToLocs = (callback: (data: any[]) => void) => {
  return onSnapshot(collection(db, 'locs'), (snapshot) => {
    const locsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
    callback(locsData);
  }, (error) => handleFirestoreError(error, OperationType.LIST, 'locs'));
};

export const subscribeToUsers = (role: string, callback: (data: any[]) => void) => {
  let unsubPrivate: (() => void) | null = null;

  const unsubPublic = onSnapshot(collection(db, 'users_public'), (snapshot) => {
    const usersPublicData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));

    if (role?.toUpperCase() === 'ADMIN') {
      // Clean up any previous private listener before creating a new one
      if (unsubPrivate) unsubPrivate();
      unsubPrivate = onSnapshot(collection(db, 'users_private'), (privateSnapshot) => {
        const usersPrivateData = privateSnapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as any));
        const mergedUsers = usersPublicData.map(u => {
          // users_private doc ID is the email key, same as users_public doc ID
          const privateData = usersPrivateData.find(p => p.uid === u.id);
          return { ...u, ...privateData };
        });
        callback(mergedUsers);
      }, (error) => handleFirestoreError(error, OperationType.LIST, 'users_private'));
    } else {
      callback(usersPublicData);
    }
  }, (error) => handleFirestoreError(error, OperationType.LIST, 'users_public'));

  // Return a cleanup function that unsubscribes both listeners
  return () => {
    unsubPublic();
    if (unsubPrivate) unsubPrivate();
  };
};

export const subscribeToAppFeedback = (callback: (data: any[]) => void) => {
  return onSnapshot(collection(db, 'app_feedback'), (snapshot) => {
    const requestsData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    callback(requestsData.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }, (error) => handleFirestoreError(error, OperationType.LIST, 'app_feedback'));
};

export const subscribeToAppTodos = (callback: (data: any[]) => void) => {
  return onSnapshot(collection(db, 'app_todos'), (snapshot) => {
    const todosData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    callback(todosData.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }, (error) => handleFirestoreError(error, OperationType.LIST, 'app_todos'));
};

export const subscribeToReportTemplate = (callback: (data: any) => void) => {
  return onSnapshot(doc(db, 'settings', 'reportTemplate'), (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data());
    }
  }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/reportTemplate'));
};
