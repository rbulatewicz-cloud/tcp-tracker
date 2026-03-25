import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { User, UserRole } from '../types';

export const fetchUserRole = async (email: string): Promise<UserRole> => {
  try {
    const userPrivateSnap = await getDoc(doc(db, 'users_private', email));
    if (userPrivateSnap.exists()) {
      return userPrivateSnap.data().role as UserRole;
    }
    return UserRole.GUEST;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users_private/${email}`);
    return UserRole.GUEST;
  }
};

export const initializeUser = async (user: any, email: string, role: UserRole) => {
  const userPublicRef = doc(db, 'users_public', email);
  const userPrivateRef = doc(db, 'users_private', email);
  
  try {
    const userPublicSnap = await getDoc(userPublicRef);
    
    const now = new Date().toISOString();
    if (userPublicSnap.exists()) {
      await setDoc(userPublicRef, { uid: user.uid, name: user.displayName || userPublicSnap.data().name, email: email }, { merge: true });
      const userPrivateSnap = await getDoc(userPrivateRef);
      if (!userPrivateSnap.exists()) {
        await setDoc(userPrivateRef, { uid: user.uid, role, lastLogin: now, loginCount: 1 });
      } else {
        await updateDoc(userPrivateRef, { lastLogin: now, loginCount: increment(1) });
      }
    } else {
      await setDoc(userPublicRef, { uid: user.uid, name: user.displayName || 'Unknown User', email: email });
      await setDoc(userPrivateRef, { uid: user.uid, role, lastLogin: now, loginCount: 1 });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users_public/${email}`);
  }
};
