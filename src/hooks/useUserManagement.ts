import { useState } from 'react';
import { User, UserRole } from '../types';
import { saveUser } from '../services/userService';
import { showToast } from '../lib/toast';

export const useUserManagement = (role: string, setShowUserForm: (show: boolean) => void) => {
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({ name: "", email: "", role: UserRole.SFTC });

  const handleSaveUser = async () => {
    if (!userForm.email || !userForm.name) return;
    const uid = editingUser?.uid || Math.random().toString(36).substr(2, 9);
    const newUser = { ...userForm, uid };
    
    try {
      await saveUser(newUser, role);
      setShowUserForm(false);
      setEditingUser(null);
      setUserForm({ name: "", email: "", role: UserRole.SFTC });
    } catch (error) {
      console.error("Error saving user:", error);
      showToast(error instanceof Error ? error.message : "Failed to save user. Check permissions.", "error");
    }
  };

  return {
    editingUser, setEditingUser,
    userForm, setUserForm,
    handleSaveUser
  };
};
