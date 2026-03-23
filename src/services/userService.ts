import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { User, UserRole } from '../types';

export const saveUser = async (user: User, role: string) => {
  const emailId = user.email.toLowerCase();
  
  // Security check: only admins can grant admin role
  if (user.role === UserRole.ADMIN && role !== UserRole.ADMIN) {
    throw new Error("Only system admins can grant the Tier 0: System Admin role.");
  }
  
  await setDoc(doc(db, 'users_public', emailId), { uid: user.uid, name: user.name, email: user.email });
  await setDoc(doc(db, 'users_private', emailId), { uid: user.uid, role: user.role });
};
