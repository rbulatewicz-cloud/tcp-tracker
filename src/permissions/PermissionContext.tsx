import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserRole } from '../types';
import { useAuth } from '../hooks/useAuth';
import { PermissionContext, type Permission } from './PermissionContextDef';

export const PermissionProvider = ({ children }: { children: React.ReactNode }) => {
  const { currentUser, role } = useAuth();
  const [fieldPermissions, setFieldPermissions] = useState<Record<string, Permission>>({});

  const canView = (fieldKey: string) => {
    const rolePermissions = fieldPermissions[fieldKey];
    if (!rolePermissions) return true;
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
          setFieldPermissions(docSnap.data() as Record<string, Permission>);
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
