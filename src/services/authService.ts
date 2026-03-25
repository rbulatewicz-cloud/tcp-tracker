import { doc, getDoc, setDoc } from 'firebase/firestore';
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
    
    if (userPublicSnap.exists()) {
      // Update uid and name if needed
      await setDoc(userPublicRef, { uid: user.uid, name: user.displayName || userPublicSnap.data().name, email: email }, { merge: true });
      // Ensure users_private exists — it may be missing for legacy/imported users
      const userPrivateSnap = await getDoc(userPrivateRef);
      if (!userPrivateSnap.exists()) {
        await setDoc(userPrivateRef, { uid: user.uid, role });
      }
    } else {
      await setDoc(userPublicRef, {
        uid: user.uid,
        name: user.displayName || 'Unknown User',
        email: email
      });
      await setDoc(userPrivateRef, {
        uid: user.uid,
        role
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users_public/${email}`);
  }
};
