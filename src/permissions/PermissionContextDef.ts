import { createContext } from 'react';
import type React from 'react';

export type Permission = { edit: string[], view: string[] };

export type PermissionContextType = {
  fieldPermissions: Record<string, Permission>;
  setFieldPermissions: React.Dispatch<React.SetStateAction<Record<string, Permission>>>;
  toggleSectionPermission: (keys: string[], role: string, type: 'edit' | 'view') => void;
  canView: (fieldKey: string) => boolean;
  canEditPlan: boolean;
};

export const PermissionContext = createContext<PermissionContextType | undefined>(undefined);
