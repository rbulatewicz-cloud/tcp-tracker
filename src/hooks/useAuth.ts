import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { User, UserRole } from '../types';
import * as authService from '../services/authService';

const DEV_USER: User = {
  uid: 'dev-admin',
  name: 'Dev Admin',
  email: 'r.bulatewicz@gmail.com',
  role: UserRole.ADMIN,
};
const IS_DEV_BYPASS = import.meta.env.DEV && window.location.hostname === 'localhost';

export function useAuth() {
  const [currentUser, setCurrentUser]         = useState<User | null>(IS_DEV_BYPASS ? DEV_USER : null);
  const [isRealAdmin, setIsRealAdmin]         = useState(IS_DEV_BYPASS);
  const [loaded, setLoaded]                   = useState(IS_DEV_BYPASS);
  const [showLogin, setShowLogin]             = useState(false);
  // profileComplete: null = not yet read, false = new user, true = profile saved
  const [profileComplete, setProfileComplete] = useState<boolean | null>(IS_DEV_BYPASS ? true : null);

  const unsubRoleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (IS_DEV_BYPASS) return;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubRoleRef.current) { unsubRoleRef.current(); unsubRoleRef.current = null; }

      if (firebaseUser) {
        const userEmail = firebaseUser.email?.toLowerCase();
        if (!userEmail) return;

        const isBootstrapAdmin = userEmail === 'r.bulatewicz@gmail.com';

        let initialRole = await authService.fetchUserRole(userEmail);
        if (isBootstrapAdmin) initialRole = UserRole.ADMIN;

        await authService.initializeUser(firebaseUser, userEmail, initialRole);

        // Read profileComplete + profile fields before setting loaded
        const [pubSnap, privSnap] = await Promise.all([
          getDoc(doc(db, 'users_public',  userEmail)),
          getDoc(doc(db, 'users_private', userEmail)),
        ]);
        const pub  = pubSnap.exists()  ? pubSnap.data()  : {};
        const priv = privSnap.exists() ? privSnap.data() : {};
        const pc   = priv.profileComplete === true;

        const resolvedRole = isBootstrapAdmin ? UserRole.ADMIN : initialRole;

        setCurrentUser({
          uid:               firebaseUser.uid,
          name:              pub.displayName || firebaseUser.displayName || 'Unknown User',
          email:             firebaseUser.email || '',
          role:              resolvedRole,
          displayName:       pub.displayName,
          title:             pub.title,
          notificationEmail: pub.notificationEmail || firebaseUser.email || '',
        });
        setIsRealAdmin(resolvedRole === UserRole.ADMIN);
        setProfileComplete(pc);
        setShowLogin(false);
        setLoaded(true);

        // Live listener for role + profileComplete changes
        unsubRoleRef.current = onSnapshot(
          doc(db, 'users_private', userEmail),
          (snap) => {
            if (!snap.exists()) return;
            let liveRole = (snap.data().role as UserRole) ?? UserRole.GUEST;
            if (isBootstrapAdmin) liveRole = UserRole.ADMIN;
            const livePC = snap.data().profileComplete === true;
            setCurrentUser(prev => prev ? { ...prev, role: liveRole } : prev);
            setIsRealAdmin(liveRole === UserRole.ADMIN);
            setProfileComplete(livePC);
          },
          (error) => { console.error(`[Auth] role listener error for ${userEmail}:`, error); }
        );
      } else {
        setCurrentUser(null);
        setIsRealAdmin(false);
        setProfileComplete(null);
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
    profileComplete,
    role:         currentUser?.role || UserRole.GUEST,
    canManageApp: (currentUser?.role || UserRole.GUEST) === UserRole.ADMIN,
  };
}
