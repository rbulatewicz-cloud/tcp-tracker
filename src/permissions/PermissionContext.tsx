import React, { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserRole } from '../types';
import { useAuth } from '../hooks/useAuth';
import { PermissionContext, type Permission } from './PermissionContextDef';

export const PermissionProvider = ({ children }: { children: React.ReactNode }) => {
  const { currentUser, role } = useAuth();
  const [fieldPermissions, setFieldPermissions] = useState<Record<string, Permission>>({});
  // Tracks whether the last fieldPermissions change came from Firestore (not a user action).
  // Prevents the write-useEffect from echoing Firestore updates back to Firestore in a loop.
  const fromFirestore = useRef(false);

  const canView = (fieldKey: string) => {
    const rolePermissions = fieldPermissions[fieldKey];
    // No entry, or view array is empty/missing → allow everyone (treat as unrestricted)
    if (!rolePermissions || !rolePermissions.view?.length) return true;
    return rolePermissions.view.includes(role || '') || role === UserRole.ADMIN;
  };

  const canEditPlan = role !== UserRole.GUEST;

  const toggleSectionPermission = (keys: string[], role: string, type: 'edit' | 'view') => {
    setFieldPermissions(prev => {
      const next = { ...prev };
      keys.forEach(key => {
        const current = next[key] || { edit: [], view: [] };
        const updated = {
          edit: current.edit || [],
          view: current.view || []
        };
        if (type === 'edit') {
          updated.edit = updated.edit.includes(role)
            ? updated.edit.filter(r => r !== role)
            : [...updated.edit, role];
        } else {
          updated.view = updated.view.includes(role)
            ? updated.view.filter(r => r !== role)
            : [...updated.view, role];
        }
        next[key] = updated;
      });
      return next;
    });
  };

  useEffect(() => {
    // Skip the write if this state update originated from Firestore — don't echo it back.
    if (fromFirestore.current) {
      fromFirestore.current = false;
      return;
    }
    if (Object.keys(fieldPermissions).length > 0 && (role === UserRole.ADMIN || role === UserRole.MOT)) {
      setDoc(doc(db, 'settings', 'fieldPermissions'), fieldPermissions)
        .catch(error => handleFirestoreError(error, OperationType.WRITE, 'settings/fieldPermissions'));
    }
  }, [fieldPermissions, role]);

  useEffect(() => {
    let unsubPermissions = () => {};
    if (currentUser) {
      unsubPermissions = onSnapshot(doc(db, 'settings', 'fieldPermissions'), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as Record<string, Permission>;

          // Self-heal: remove any entries where view is empty — they lock out all non-admins.
          // Only admins can write; run once silently when detected.
          if (role === UserRole.ADMIN) {
            const brokenKeys = Object.keys(data).filter(k => !data[k]?.view?.length);
            if (brokenKeys.length > 0) {
              const patch: Record<string, unknown> = {};
              brokenKeys.forEach(k => { patch[k] = deleteField(); });
              updateDoc(doc(db, 'settings', 'fieldPermissions'), patch)
                .catch((e: unknown) => handleFirestoreError(e, OperationType.WRITE, 'settings/fieldPermissions'));
            }
          }

          fromFirestore.current = true;
          setFieldPermissions(data);
        }
      }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/fieldPermissions'));
    }
    return () => unsubPermissions();
  }, [currentUser]);

  return (
    <PermissionContext.Provider value={{ fieldPermissions, setFieldPermissions, toggleSectionPermission, canView, canEditPlan }}>
      {children}
    </PermissionContext.Provider>
  );
};
