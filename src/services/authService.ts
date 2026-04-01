import { doc, getDoc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserRole, NotificationPrefs } from '../types';

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

export const initializeUser = async (user: any, email: string, role: UserRole, countLogin = true) => {
  const userPublicRef  = doc(db, 'users_public',  email);
  const userPrivateRef = doc(db, 'users_private', email);

  try {
    const userPublicSnap = await getDoc(userPublicRef);
    const now = new Date().toISOString();

    if (userPublicSnap.exists()) {
      // Existing user — update last login, keep existing profile fields
      await setDoc(userPublicRef, {
        uid: user.uid,
        name: user.displayName || userPublicSnap.data().name,
        email,
      }, { merge: true });

      const userPrivateSnap = await getDoc(userPrivateRef);
      if (!userPrivateSnap.exists()) {
        await setDoc(userPrivateRef, {
          uid: user.uid, role, lastLogin: now, loginCount: 1, profileComplete: false,
        });
      } else {
        await updateDoc(userPrivateRef, {
          lastLogin: now,
          ...(countLogin ? { loginCount: increment(1) } : {}),
        });
      }
    } else {
      // New user — create both docs, profileComplete = false triggers welcome screen
      await setDoc(userPublicRef, {
        uid: user.uid,
        name: user.displayName || 'Unknown User',
        email,
        notificationEmail: email, // default to login email
      });
      await setDoc(userPrivateRef, {
        uid: user.uid, role, lastLogin: now, loginCount: 1, profileComplete: false,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users_public/${email}`);
  }
};

/** Save full profile + notification prefs. Sets profileComplete: true. */
export const saveUserProfile = async (email: string, data: NotificationPrefs): Promise<void> => {
  const userPublicRef  = doc(db, 'users_public',  email);
  const userPrivateRef = doc(db, 'users_private', email);
  try {
    await Promise.all([
      updateDoc(userPublicRef, {
        displayName:       data.displayName,
        name:              data.displayName, // keep name in sync for activity logs
        title:             data.title,
        notificationEmail: data.notificationEmail,
      }),
      updateDoc(userPrivateRef, {
        notifyOn:              data.notifyOn,
        notificationFrequency: data.notificationFrequency,
        autoFollow:            data.autoFollow,
        profileComplete:       true,
      }),
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${email}`);
    throw error;
  }
};

/** Fetch full profile data for the profile modal (pre-fill). */
export const fetchUserProfile = async (email: string): Promise<NotificationPrefs> => {
  try {
    const [pubSnap, privSnap] = await Promise.all([
      getDoc(doc(db, 'users_public',  email)),
      getDoc(doc(db, 'users_private', email)),
    ]);
    const pub  = pubSnap.exists()  ? pubSnap.data()  : {};
    const priv = privSnap.exists() ? privSnap.data() : {};
    return {
      displayName:           pub.displayName        || pub.name || '',
      title:                 pub.title              || '',
      notificationEmail:     pub.notificationEmail  || email,
      notifyOn:              priv.notifyOn           || ['status_change', 'window_expiring'],
      notificationFrequency: priv.notificationFrequency || 'daily_digest',
      autoFollow:            priv.autoFollow         || { myRequests: true, myLeads: true, onComment: false, segments: [] },
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${email}`);
    return {
      displayName: '', title: '', notificationEmail: email,
      notifyOn: ['status_change', 'window_expiring'],
      notificationFrequency: 'daily_digest',
      autoFollow: { myRequests: true, myLeads: true, onComment: false, segments: [] },
    };
  }
};
