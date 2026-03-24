import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { User, UserRole } from '../types';
import * as authService from '../services/authService';
import { doc, onSnapshot } from 'firebase/firestore';

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
  // Hold the live-role unsubscribe so we can clean it up on sign-out
  const unsubRoleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (IS_DEV_BYPASS) return;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Clean up any previous role listener
      if (unsubRoleRef.current) { unsubRoleRef.current(); unsubRoleRef.current = null; }

      if (firebaseUser) {
        const userEmail = firebaseUser.email?.toLowerCase();
        if (!userEmail) return;

        // Hardcoded admin override (bootstrap safety net)
        const isBootstrapAdmin = userEmail === 'r.bulatewicz@gmail.com';

        // Get initial role and ensure the user doc exists in Firestore
        let initialRole = await authService.fetchUserRole(userEmail);
        if (isBootstrapAdmin) initialRole = UserRole.ADMIN;
        await authService.initializeUser(firebaseUser, userEmail, initialRole);

        const displayName = firebaseUser.displayName || 'Unknown User';
        const email = firebaseUser.email || '';

        // Set initial state immediately so the app doesn't wait for the listener
        const resolvedRole = isBootstrapAdmin ? UserRole.ADMIN : initialRole;
        setCurrentUser({ uid: firebaseUser.uid, name: displayName, email, role: resolvedRole });
        setIsRealAdmin(resolvedRole === UserRole.ADMIN);
        setShowLogin(false);
        setLoaded(true);

        // Subscribe to live role changes — if an admin updates this user's role,
        // the app will reflect it immediately without requiring a sign-out/sign-in.
        unsubRoleRef.current = onSnapshot(
          doc(db, 'users_private', userEmail),
          (snap) => {
            if (!snap.exists()) return;
            let liveRole = (snap.data().role as UserRole) ?? UserRole.GUEST;
            if (isBootstrapAdmin) liveRole = UserRole.ADMIN;
            setCurrentUser(prev => prev ? { ...prev, role: liveRole } : prev);
            setIsRealAdmin(liveRole === UserRole.ADMIN);
          }
        );
      } else {
        setCurrentUser(null);
        setIsRealAdmin(false);
        setLoaded(true);
      }
    });

    return () => {
      unsubscribe();
      if (unsubRoleRef.current) unsubRoleRef.current();
    };
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
