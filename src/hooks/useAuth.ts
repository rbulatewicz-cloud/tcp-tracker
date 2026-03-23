import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { User, UserRole } from '../types';
import * as authService from '../services/authService';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const DEV_USER: User = {
  uid: 'dev-admin',
  name: 'Dev Admin',
  email: 'r.bulatewicz@gmail.com',
  role: UserRole.ADMIN,
};
const IS_DEV_BYPASS = import.meta.env.DEV && window.location.hostname === 'localhost';

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<User | null>(IS_DEV_BYPASS ? DEV_USER : null);
  const [isRealAdmin, setIsRealAdmin] = useState(IS_DEV_BYPASS);
  const [loaded, setLoaded] = useState(IS_DEV_BYPASS);
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (IS_DEV_BYPASS) return;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userEmail = user.email?.toLowerCase();
        if (!userEmail) return;
        
        let role = await authService.fetchUserRole(userEmail);
        
        // Default first user to MOT if they match the email, else GUEST
        if (userEmail === "r.bulatewicz@gmail.com") {
          role = UserRole.ADMIN;
        }
        
        await authService.initializeUser(user, userEmail, role);

        if (role === UserRole.ADMIN) {
          setIsRealAdmin(true);
        }
        
        setCurrentUser({
          uid: user.uid,
          name: user.displayName || 'Unknown User',
          email: user.email || '',
          role
        });
        setShowLogin(false);
      } else {
        setCurrentUser(null);
        setIsRealAdmin(false);
      }
      setLoaded(true);
    });
    return () => unsubscribe();
  }, []);

  return {
    currentUser,
    setCurrentUser,
    isRealAdmin,
    loaded,
    showLogin,
    setShowLogin,
    role: currentUser?.role || UserRole.GUEST,
    canManageApp: (currentUser?.role || UserRole.GUEST) === UserRole.ADMIN
  };
}
