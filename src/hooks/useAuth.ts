import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { User, UserRole } from '../types';
import * as authService from '../services/authService';

// Module-level flag — reset to false on every true page load.
// Prevents onAuthStateChanged firing 2–3 times per load from each counting as a login.
let _loginCountedThisPageLoad = false;

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

        try {
        let initialRole = await authService.fetchUserRole(userEmail);
        if (isBootstrapAdmin) initialRole = UserRole.ADMIN;

        const shouldCountLogin = !_loginCountedThisPageLoad;
        _loginCountedThisPageLoad = true;
        await authService.initializeUser(firebaseUser, userEmail, initialRole, shouldCountLogin);

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

        // Track the last-seen claims timestamp so we only force-refresh the ID
        // token when the server-side `syncUserClaims` function bumps it.
        let lastClaimsAtMs: number | null = null;

        // Live listener for role + profileComplete changes
        unsubRoleRef.current = onSnapshot(
          doc(db, 'users_private', userEmail),
          (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();
            let liveRole = (data.role as UserRole) ?? UserRole.GUEST;
            if (isBootstrapAdmin) liveRole = UserRole.ADMIN;
            const livePC = data.profileComplete === true;
            // Only mint a new currentUser object when the role actually changed.
            // Returning the same `prev` reference lets React bail out of the update,
            // which prevents downstream effects (e.g. useFirestoreData) from re-running
            // and re-reading the full plans/locs collections on every role-doc snapshot.
            setCurrentUser(prev => (prev && prev.role !== liveRole) ? { ...prev, role: liveRole } : prev);
            setIsRealAdmin(liveRole === UserRole.ADMIN);
            setProfileComplete(livePC);

            // If `syncUserClaims` just ran (claimsUpdatedAt advanced), force a
            // token refresh so Firestore rules see the new `role` claim.
            const claimsAtMs = data.claimsUpdatedAt?.toMillis?.() ?? null;
            if (claimsAtMs && claimsAtMs !== lastClaimsAtMs) {
              lastClaimsAtMs = claimsAtMs;
              firebaseUser.getIdToken(true).catch(err =>
                console.error('[Auth] failed to refresh ID token after claims change:', err)
              );
            }
          },
          (error) => { console.error(`[Auth] role listener error for ${userEmail}:`, error); }
        );
        } catch (err) {
          // A failed initial read (commonly Firestore daily-read quota exhaustion)
          // must not leave the app stuck on "Loading..." forever. Enter a degraded
          // mode: still finish loading so the UI renders and the user can reload.
          console.error('[Auth] initial load failed (likely Firestore quota); entering degraded mode:', err);
          setShowLogin(false);
          setLoaded(true);
        }
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
